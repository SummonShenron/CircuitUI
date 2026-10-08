import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { CircuitComponent, ChatMessage, Screen, ComponentKind } from '../types'
import { defaultScreenSize, defaultSize } from '../componentCatalog'
import { outputOverrideProps, resolveTemplate } from './runtime'
import { evaluateVisibility } from './expressions'
import { effectClassNames } from '../effectPresets'

const GRID = 8
const SNAP_THRESHOLD = 6

type Guide = { axis: 'v' | 'h'; pos: number }
type LivePreview = { id: string; x: number; y: number; width: number; height: number }
type DragState =
  | { mode: 'move'; id: string; startClientX: number; startClientY: number; startAbsX: number; startAbsY: number; width: number; height: number }
  | { mode: 'resize'; id: string; startClientX: number; startClientY: number; startAbsX: number; startAbsY: number; startWidth: number; startHeight: number }

function isFillScreen(component: CircuitComponent) {
  return component.type === 'container' && component.props.fillScreen === true
}

// A List's array either comes from its own workflow binding's output (same
// mechanism `table` already uses) or from a named variable.
function getListItems(component: CircuitComponent, runtimeValues: Record<string, unknown>, variables: Record<string, unknown>): unknown[] {
  const source = component.props.source === 'variable'
    ? variables[String(component.props.variable_name ?? '')]
    : runtimeValues[component.id]
  return Array.isArray(source) ? source : []
}

// Resolves `{{item.field}}`/`{{item}}` (and `{{component_id}}`) inside a List
// template child's own string props against the current row, so e.g. a
// label's Text field of "{{item.content}}" shows that row's content.
function resolveItemProps(props: Record<string, unknown>, screen: Screen, runtimeValues: Record<string, unknown>, item: unknown): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    resolved[key] = typeof value === 'string' ? resolveTemplate(value, screen, runtimeValues, item) : value
  }
  return resolved
}

// A component's own `position` is relative to its parent (or the canvas, if
// it has none) - walk the parent chain to get where it actually paints.
function getAbsolutePosition(component: CircuitComponent, byId: Map<string, CircuitComponent>) {
  let x = component.position.x
  let y = component.position.y
  let current = component
  const seen = new Set([component.id])
  while (current.parent_id) {
    const parent = byId.get(current.parent_id)
    if (!parent || seen.has(parent.id)) break
    x += parent.position.x
    y += parent.position.y
    seen.add(parent.id)
    current = parent
  }
  return { x, y }
}

function getDepth(component: CircuitComponent, byId: Map<string, CircuitComponent>) {
  let depth = 0
  let current = component
  const seen = new Set([component.id])
  while (current.parent_id) {
    const parent = byId.get(current.parent_id)
    if (!parent || seen.has(parent.id)) break
    depth += 1
    seen.add(parent.id)
    current = parent
  }
  return depth
}

// All descendants of a component (children, grandchildren, ...) - used so a
// container can't be dropped into its own child, and so it can't snap/align
// against something that's moving along with it.
function collectDescendantIds(rootId: string, components: CircuitComponent[]) {
  const childrenOf = new Map<string, string[]>()
  for (const component of components) {
    if (!component.parent_id) continue
    const list = childrenOf.get(component.parent_id) ?? []
    list.push(component.id)
    childrenOf.set(component.parent_id, list)
  }
  const result = new Set<string>()
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()!
    for (const childId of childrenOf.get(id) ?? []) {
      if (!result.has(childId)) {
        result.add(childId)
        stack.push(childId)
      }
    }
  }
  return result
}

// Which container (if any) a point on the artboard falls inside of,
// preferring the smallest/innermost match when containers overlap or nest.
function findDropContainer(
  components: CircuitComponent[],
  byId: Map<string, CircuitComponent>,
  x: number,
  y: number,
  excludeIds: Set<string>,
) {
  let match: { container: CircuitComponent; abs: { x: number; y: number } } | null = null
  for (const component of components) {
    if ((component.type !== 'container' && component.type !== 'list') || excludeIds.has(component.id) || isFillScreen(component)) continue
    const abs = getAbsolutePosition(component, byId)
    const inside = x >= abs.x && x <= abs.x + component.size.width && y >= abs.y && y <= abs.y + component.size.height
    if (!inside) continue
    if (!match || component.size.width * component.size.height < match.container.size.width * match.container.size.height) {
      match = { container: component, abs }
    }
  }
  return match
}

// Snap-target collection for the smart guides: screen edges/center plus
// every other component's edges/centers, in absolute canvas coordinates.
function buildSnapTargets(
  components: CircuitComponent[],
  byId: Map<string, CircuitComponent>,
  excludeIds: Set<string>,
  screenSize: { width: number; height: number },
) {
  const targetsX = [0, screenSize.width, screenSize.width / 2]
  const targetsY = [0, screenSize.height, screenSize.height / 2]
  for (const component of components) {
    if (excludeIds.has(component.id) || isFillScreen(component)) continue
    const abs = getAbsolutePosition(component, byId)
    targetsX.push(abs.x, abs.x + component.size.width, abs.x + component.size.width / 2)
    targetsY.push(abs.y, abs.y + component.size.height, abs.y + component.size.height / 2)
  }
  return { targetsX, targetsY }
}

function snapEdges(rawPositions: number[], targets: number[]): { delta: number; guide: number } | null {
  let best: { delta: number; guide: number } | null = null
  for (const raw of rawPositions) {
    for (const target of targets) {
      const delta = target - raw
      if (Math.abs(delta) <= SNAP_THRESHOLD && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, guide: target }
      }
    }
  }
  return best
}

function snapToGrid(value: number) {
  return Math.round(value / GRID) * GRID
}

// Dragged box's left/center/right (or top/center/bottom) edges get compared
// against every target; a match within the threshold wins and draws a guide,
// otherwise the raw position just falls back to the fixed grid.
function computeMoveSnap(rawX: number, rawY: number, width: number, height: number, targetsX: number[], targetsY: number[]) {
  const guides: Guide[] = []
  const xMatch = snapEdges([rawX, rawX + width / 2, rawX + width], targetsX)
  const x = xMatch ? rawX + xMatch.delta : snapToGrid(rawX)
  if (xMatch) guides.push({ axis: 'v', pos: xMatch.guide })
  const yMatch = snapEdges([rawY, rawY + height / 2, rawY + height], targetsY)
  const y = yMatch ? rawY + yMatch.delta : snapToGrid(rawY)
  if (yMatch) guides.push({ axis: 'h', pos: yMatch.guide })
  return { x, y, guides }
}

// Resizing only grows the bottom-right corner, so only that single edge on
// each axis needs to look for an alignment match.
function computeResizeSnap(startX: number, startY: number, rawWidth: number, rawHeight: number, targetsX: number[], targetsY: number[]) {
  const guides: Guide[] = []
  const xMatch = snapEdges([startX + rawWidth], targetsX)
  const width = Math.max(60, xMatch ? rawWidth + xMatch.delta : snapToGrid(rawWidth))
  if (xMatch) guides.push({ axis: 'v', pos: xMatch.guide })
  const yMatch = snapEdges([startY + rawHeight], targetsY)
  const height = Math.max(40, yMatch ? rawHeight + yMatch.delta : snapToGrid(rawHeight))
  if (yMatch) guides.push({ axis: 'h', pos: yMatch.guide })
  return { width, height, guides }
}

function ChatPreview({
  draft,
  placeholder,
  history,
  previewMode,
  running,
  className,
  onDraftChange,
  onSend,
}: {
  draft: string
  placeholder: string
  history: ChatMessage[]
  previewMode: boolean
  running: boolean
  className: string
  onDraftChange: (value: string) => void
  onSend: () => void
}) {
  const messagesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight })
  }, [history.length])

  if (!previewMode) return <div className="canvas-placeholder">Chat (bind an event-triggered workflow, then Preview to talk to it)</div>

  return (
    <div className={`chat-widget ${className}`} onClick={(event) => event.stopPropagation()}>
      <div className="chat-messages" ref={messagesRef}>
        {history.length === 0 && <p className="chat-empty">Say something to start the conversation.</p>}
        {history.map((message, index) => (
          <div key={index} className={`chat-bubble chat-bubble-${message.role}`}>{message.content}</div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && !running && onSend()}
        />
        <button type="button" className="btn-3d chat-send" onClick={onSend} disabled={running || !draft.trim()}>{running ? '…' : 'Send'}</button>
      </div>
    </div>
  )
}

function ComponentPreview({
  component,
  liveProps,
  previewMode,
  running,
  chatHistory,
  onTrigger,
  onValueChange,
}: {
  component: CircuitComponent
  liveProps: Record<string, unknown>
  previewMode: boolean
  running: boolean
  chatHistory: ChatMessage[]
  onTrigger: () => void
  onValueChange: (value: string) => void
}) {
  const effectClasses = effectClassNames(component.style)

  switch (component.type) {
    case 'label': {
      const fontSize = Number(liveProps.fontSize ?? 16)
      // Padding/border-radius on the effect presets read this scale (default
      // 1 for every other component kind) so a bigger label gets a
      // proportionally chunkier box instead of the same fixed-size padding.
      const style = { fontSize, '--effect-scale': fontSize / 16 } as CSSProperties
      return (
        <span className={`canvas-label-box ${effectClasses}`} style={style}>
          {String(liveProps.text ?? '')}
        </span>
      )
    }
    case 'button':
      return (
        <button
          type="button"
          className={effectClasses}
          disabled={previewMode && running}
          onClick={previewMode ? (event) => { event.stopPropagation(); onTrigger() } : undefined}
        >
          {running ? 'Running…' : String(liveProps.text ?? 'Button')}
        </button>
      )
    case 'text_input':
      return previewMode ? (
        <input
          className={effectClasses}
          placeholder={String(liveProps.placeholder ?? '')}
          value={String(liveProps.value ?? '')}
          onChange={(event) => onValueChange(event.target.value)}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <input className={effectClasses} readOnly placeholder={String(liveProps.placeholder ?? '')} defaultValue={String(liveProps.value ?? '')} />
      )
    case 'image':
      return liveProps.src ? (
        <img className={effectClasses} src={String(liveProps.src)} alt={String(liveProps.alt ?? '')} />
      ) : (
        <div className={`canvas-placeholder ${effectClasses}`}>Image</div>
      )
    case 'table': {
      const rows = Array.isArray(liveProps.rows) ? (liveProps.rows as Record<string, unknown>[]) : []
      if (rows.length === 0) return <div className={`canvas-placeholder ${effectClasses}`}>Table (bind a workflow to populate rows)</div>
      const columns = Object.keys(rows[0])
      return (
        <div className="canvas-table-box">
          <table className={`canvas-table ${effectClasses}`}>
            <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>{columns.map((column) => <td key={column}>{String(row[column] ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'container': {
      const showLabel = liveProps.showLabel !== false
      return (
        <div className={`canvas-container-box ${effectClasses}`}>
          {showLabel && <span className="canvas-container-label">{component.name}</span>}
        </div>
      )
    }
    case 'message': {
      // `role` is a plain string field (not a fixed dropdown) so a List
      // template can set it to "{{item.role}}" and have it resolve per row.
      const role = liveProps.role === 'user' ? 'user' : 'assistant'
      return (
        <div className={`canvas-message-row canvas-message-row-${role}`}>
          <span className={`chat-bubble chat-bubble-${role} ${effectClasses}`}>{String(liveProps.text ?? '')}</span>
        </div>
      )
    }
    case 'list':
      return (
        <div className={`canvas-container-box ${effectClasses}`}>
          {!previewMode && <span className="canvas-container-label">{component.name} (drop the row template inside)</span>}
        </div>
      )
    case 'chat':
      return (
        <ChatPreview
          draft={String(liveProps.draft ?? '')}
          placeholder={String(liveProps.placeholder ?? '')}
          history={chatHistory}
          previewMode={previewMode}
          running={running}
          className={effectClasses}
          onDraftChange={onValueChange}
          onSend={onTrigger}
        />
      )
  }
}

export default function Canvas({
  screen,
  selectedId,
  onSelect,
  onAddComponent,
  onMoveComponent,
  previewMode = false,
  runtimeValues = {},
  variables = {},
  runningIds = new Set(),
  runErrors = {},
  chatHistories = {},
  onTrigger,
  onValueChange,
  onResize,
}: {
  screen: Screen
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAddComponent: (kind: ComponentKind, position: { x: number; y: number }, parentId: string | null) => void
  onMoveComponent: (id: string, position: { x: number; y: number }, parentId: string | null) => void
  previewMode?: boolean
  runtimeValues?: Record<string, unknown>
  variables?: Record<string, unknown>
  runningIds?: Set<string>
  runErrors?: Record<string, string>
  chatHistories?: Record<string, ChatMessage[]>
  onTrigger?: (componentId: string) => void
  onValueChange?: (componentId: string, value: string) => void
  onResize?: (componentId: string, size: { width: number; height: number }) => void
}) {
  const artboardRef = useRef<HTMLDivElement>(null)
  const screenSize = screen.size ?? defaultScreenSize
  const byId = new Map(screen.components.map((component) => [component.id, component]))

  const [livePreview, setLivePreview] = useState<LivePreview | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])

  // Stable refs so add/removeEventListener always target the same function
  // identity across re-renders, and so the drag handlers (created once) can
  // still see the latest screen/callback data instead of a stale closure.
  const dragRef = useRef<DragState | null>(null)
  const screenComponentsRef = useRef(screen.components)
  const byIdRef = useRef(byId)
  const screenSizeRef = useRef(screenSize)
  useEffect(() => {
    screenComponentsRef.current = screen.components
    byIdRef.current = byId
    screenSizeRef.current = screenSize
  })

  const onMoveComponentRef = useRef(onMoveComponent)
  useEffect(() => { onMoveComponentRef.current = onMoveComponent }, [onMoveComponent])
  const onResizeRef = useRef(onResize)
  useEffect(() => { onResizeRef.current = onResize }, [onResize])

  const handlePointerMoveRef = useRef((event: globalThis.MouseEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startClientX
    const dy = event.clientY - drag.startClientY
    const components = screenComponentsRef.current
    const byIdMap = byIdRef.current
    const screenSz = screenSizeRef.current

    if (drag.mode === 'move') {
      const excluded = collectDescendantIds(drag.id, components)
      excluded.add(drag.id)
      const { targetsX, targetsY } = buildSnapTargets(components, byIdMap, excluded, screenSz)
      const snapped = computeMoveSnap(drag.startAbsX + dx, drag.startAbsY + dy, drag.width, drag.height, targetsX, targetsY)
      setLivePreview({ id: drag.id, x: snapped.x, y: snapped.y, width: drag.width, height: drag.height })
      setGuides(snapped.guides)
    } else {
      const { targetsX, targetsY } = buildSnapTargets(components, byIdMap, new Set([drag.id]), screenSz)
      const snapped = computeResizeSnap(drag.startAbsX, drag.startAbsY, drag.startWidth + dx, drag.startHeight + dy, targetsX, targetsY)
      setLivePreview({ id: drag.id, x: drag.startAbsX, y: drag.startAbsY, width: snapped.width, height: snapped.height })
      setGuides(snapped.guides)
    }
  })

  const handlePointerUpRef = useRef((event: globalThis.MouseEvent) => {
    const drag = dragRef.current
    if (drag) {
      const dx = event.clientX - drag.startClientX
      const dy = event.clientY - drag.startClientY
      const components = screenComponentsRef.current
      const byIdMap = byIdRef.current
      const screenSz = screenSizeRef.current

      if (drag.mode === 'move') {
        const excluded = collectDescendantIds(drag.id, components)
        excluded.add(drag.id)
        const { targetsX, targetsY } = buildSnapTargets(components, byIdMap, excluded, screenSz)
        const snapped = computeMoveSnap(drag.startAbsX + dx, drag.startAbsY + dy, drag.width, drag.height, targetsX, targetsY)
        const target = findDropContainer(components, byIdMap, snapped.x + drag.width / 2, snapped.y + drag.height / 2, excluded)
        if (target) {
          onMoveComponentRef.current(drag.id, { x: snapped.x - target.abs.x, y: snapped.y - target.abs.y }, target.container.id)
        } else {
          onMoveComponentRef.current(drag.id, { x: snapped.x, y: snapped.y }, null)
        }
      } else {
        const { targetsX, targetsY } = buildSnapTargets(components, byIdMap, new Set([drag.id]), screenSz)
        const snapped = computeResizeSnap(drag.startAbsX, drag.startAbsY, drag.startWidth + dx, drag.startHeight + dy, targetsX, targetsY)
        onResizeRef.current?.(drag.id, { width: snapped.width, height: snapped.height })
      }
    }
    dragRef.current = null
    setLivePreview(null)
    setGuides([])
    window.removeEventListener('mousemove', handlePointerMoveRef.current)
    window.removeEventListener('mouseup', handlePointerUpRef.current)
  })

  useEffect(() => () => {
    window.removeEventListener('mousemove', handlePointerMoveRef.current)
    window.removeEventListener('mouseup', handlePointerUpRef.current)
  }, [])

  const handleMoveStart = (event: ReactMouseEvent, component: CircuitComponent) => {
    event.stopPropagation()
    onSelect(component.id)
    if (isFillScreen(component)) return
    const abs = getAbsolutePosition(component, byId)
    dragRef.current = {
      mode: 'move',
      id: component.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startAbsX: abs.x,
      startAbsY: abs.y,
      width: component.size.width,
      height: component.size.height,
    }
    window.addEventListener('mousemove', handlePointerMoveRef.current)
    window.addEventListener('mouseup', handlePointerUpRef.current)
  }

  const handleResizeStart = (event: ReactMouseEvent, component: CircuitComponent) => {
    event.preventDefault()
    event.stopPropagation()
    const abs = getAbsolutePosition(component, byId)
    dragRef.current = {
      mode: 'resize',
      id: component.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startAbsX: abs.x,
      startAbsY: abs.y,
      startWidth: component.size.width,
      startHeight: component.size.height,
    }
    window.addEventListener('mousemove', handlePointerMoveRef.current)
    window.addEventListener('mouseup', handlePointerUpRef.current)
  }

  // New components dropped from the palette still use native HTML5 DnD
  // (the drag source lives in ComponentPalette); moving an existing canvas
  // component is handled above via mousedown/mousemove instead.
  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    const newKind = event.dataTransfer.getData('application/circuitui-new-component') as ComponentKind | ''
    if (!newKind) return
    const artboardRect = artboardRef.current!.getBoundingClientRect()
    const size = defaultSize[newKind]
    const rawX = event.clientX - artboardRect.left - size.width / 2
    const rawY = event.clientY - artboardRect.top - size.height / 2
    const { targetsX, targetsY } = buildSnapTargets(screen.components, byId, new Set(), screenSize)
    const snapped = computeMoveSnap(rawX, rawY, size.width, size.height, targetsX, targetsY)
    const target = findDropContainer(screen.components, byId, snapped.x + size.width / 2, snapped.y + size.height / 2, new Set())
    if (target) {
      onAddComponent(newKind, { x: snapped.x - target.abs.x, y: snapped.y - target.abs.y }, target.container.id)
    } else {
      onAddComponent(newKind, { x: snapped.x, y: snapped.y }, null)
    }
  }

  return (
    <div className={`builder-canvas ${previewMode ? 'builder-canvas-preview' : ''}`}>
      <div
        ref={artboardRef}
        className={`builder-artboard ${previewMode ? 'builder-artboard-preview' : ''}`}
        style={{ width: screenSize.width, height: screenSize.height }}
        onDragOver={previewMode ? undefined : (event) => event.preventDefault()}
        onDrop={previewMode ? undefined : handleDrop}
        onClick={() => !previewMode && onSelect(null)}
      >
        {screen.components.map((component) => {
          // A List's own children are its per-row template, authored once at
          // its base position - in Preview they're rendered N times inside
          // the List's own overlay below instead of once here.
          const parent = component.parent_id ? byId.get(component.parent_id) : undefined
          if (previewMode && parent?.type === 'list') return null
          if (previewMode && !evaluateVisibility(component.visibility_expression, screen, runtimeValues, variables)) return null
          const liveProps = component.id in runtimeValues
            ? { ...component.props, ...outputOverrideProps(component.type, runtimeValues[component.id]) }
            : component.props
          const fillScreen = isFillScreen(component)
          const preview = livePreview && livePreview.id === component.id ? livePreview : null
          const abs = fillScreen ? { x: 0, y: 0 } : preview ? { x: preview.x, y: preview.y } : getAbsolutePosition(component, byId)
          const size = fillScreen ? screenSize : preview ? { width: preview.width, height: preview.height } : component.size
          const depth = fillScreen ? 0 : getDepth(component, byId)
          return (
            <div
              key={component.id}
              className={`canvas-component ${selectedId === component.id ? 'canvas-component-selected' : ''} ${component.type === 'chat' ? 'canvas-component-chat' : ''}`}
              style={{
                left: abs.x,
                top: abs.y,
                width: size.width,
                height: size.height,
                // Containers/Lists always sit behind whatever's grouped
                // inside them (or inside other containers), regardless of
                // drop order. A fill-screen container is always the backmost
                // thing on the screen.
                zIndex: fillScreen ? -1 : component.type === 'container' || component.type === 'list' ? depth * 2 : depth * 2 + 1,
              }}
              onMouseDown={previewMode ? undefined : (event) => handleMoveStart(event, component)}
              onClick={previewMode ? undefined : (event) => event.stopPropagation()}
            >
              <ComponentPreview
                component={component}
                liveProps={liveProps}
                previewMode={previewMode}
                running={runningIds.has(component.id)}
                chatHistory={chatHistories[component.id] ?? []}
                onTrigger={() => onTrigger?.(component.id)}
                onValueChange={(value) => onValueChange?.(component.id, value)}
              />
              {previewMode && component.type === 'list' && (() => {
                const items = getListItems(component, runtimeValues, variables)
                const templateChildren = screen.components.filter((child) => child.parent_id === component.id)
                const rowHeight = Number(component.props.row_height ?? 72)
                return (
                  <div className="canvas-list-rows">
                    {items.map((item, index) => templateChildren.map((child) => {
                      if (!evaluateVisibility(child.visibility_expression, screen, runtimeValues, variables, item)) return null
                      const childLiveProps = resolveItemProps(
                        child.id in runtimeValues
                          ? { ...child.props, ...outputOverrideProps(child.type, runtimeValues[child.id]) }
                          : child.props,
                        screen,
                        runtimeValues,
                        item,
                      )
                      return (
                        <div
                          key={`${index}-${child.id}`}
                          className="canvas-list-row-item"
                          style={{ left: child.position.x, top: child.position.y + index * rowHeight, width: child.size.width, height: child.size.height }}
                        >
                          <ComponentPreview
                            component={child}
                            liveProps={childLiveProps}
                            previewMode={previewMode}
                            running={runningIds.has(child.id)}
                            chatHistory={chatHistories[child.id] ?? []}
                            onTrigger={() => onTrigger?.(child.id)}
                            onValueChange={(value) => onValueChange?.(child.id, value)}
                          />
                        </div>
                      )
                    }))}
                  </div>
                )
              })()}
              {!previewMode && component.binding && (
                <span className="canvas-binding-badge">⚡ {component.binding.workflow_name || 'bound'}</span>
              )}
              {!previewMode && component.visibility_expression?.trim() && (
                <span className="canvas-visibility-badge" title={component.visibility_expression}>👁 conditional</span>
              )}
              {previewMode && runErrors[component.id] && (
                <span className="canvas-error-badge">{runErrors[component.id]}</span>
              )}
              {!previewMode && selectedId === component.id && !fillScreen && (
                <div
                  className="canvas-resize-handle"
                  onMouseDown={(event) => handleResizeStart(event, component)}
                />
              )}
            </div>
          )
        })}
        {!previewMode && guides.map((guide, index) => (
          <div
            key={index}
            className={`canvas-guide ${guide.axis === 'v' ? 'canvas-guide-v' : 'canvas-guide-h'}`}
            style={guide.axis === 'v' ? { left: guide.pos } : { top: guide.pos }}
          />
        ))}
      </div>
    </div>
  )
}
