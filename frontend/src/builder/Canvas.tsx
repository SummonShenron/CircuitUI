import { useEffect, useRef, type DragEvent } from 'react'
import type { CircuitComponent, ChatMessage, Screen, ComponentKind } from '../types'
import { defaultSize } from '../componentCatalog'
import { outputOverrideProps } from './runtime'

function ChatPreview({
  draft,
  placeholder,
  history,
  previewMode,
  running,
  onDraftChange,
  onSend,
}: {
  draft: string
  placeholder: string
  history: ChatMessage[]
  previewMode: boolean
  running: boolean
  onDraftChange: (value: string) => void
  onSend: () => void
}) {
  const messagesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight })
  }, [history.length])

  if (!previewMode) return <div className="canvas-placeholder">Chat (bind an event-triggered workflow, then Preview to talk to it)</div>

  return (
    <div className="chat-widget" onClick={(event) => event.stopPropagation()}>
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
        <button type="button" onClick={onSend} disabled={running || !draft.trim()}>{running ? '…' : 'Send'}</button>
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
  switch (component.type) {
    case 'label':
      return <span>{String(liveProps.text ?? '')}</span>
    case 'button':
      return (
        <button
          type="button"
          disabled={previewMode && running}
          onClick={previewMode ? (event) => { event.stopPropagation(); onTrigger() } : undefined}
        >
          {running ? 'Running…' : String(liveProps.text ?? 'Button')}
        </button>
      )
    case 'text_input':
      return previewMode ? (
        <input
          placeholder={String(liveProps.placeholder ?? '')}
          value={String(liveProps.value ?? '')}
          onChange={(event) => onValueChange(event.target.value)}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <input readOnly placeholder={String(liveProps.placeholder ?? '')} defaultValue={String(liveProps.value ?? '')} />
      )
    case 'image':
      return liveProps.src ? (
        <img src={String(liveProps.src)} alt={String(liveProps.alt ?? '')} />
      ) : (
        <div className="canvas-placeholder">Image</div>
      )
    case 'table': {
      const rows = Array.isArray(liveProps.rows) ? (liveProps.rows as Record<string, unknown>[]) : []
      if (rows.length === 0) return <div className="canvas-placeholder">Table (bind a workflow to populate rows)</div>
      const columns = Object.keys(rows[0])
      return (
        <table className="canvas-table">
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>{columns.map((column) => <td key={column}>{String(row[column] ?? '')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )
    }
    case 'container':
      return <div className="canvas-placeholder">Container</div>
    case 'chat':
      return (
        <ChatPreview
          draft={String(liveProps.draft ?? '')}
          placeholder={String(liveProps.placeholder ?? '')}
          history={chatHistory}
          previewMode={previewMode}
          running={running}
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
  runningIds = new Set(),
  runErrors = {},
  chatHistories = {},
  onTrigger,
  onValueChange,
}: {
  screen: Screen
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAddComponent: (kind: ComponentKind, position: { x: number; y: number }) => void
  onMoveComponent: (id: string, position: { x: number; y: number }) => void
  previewMode?: boolean
  runtimeValues?: Record<string, unknown>
  runningIds?: Set<string>
  runErrors?: Record<string, string>
  chatHistories?: Record<string, ChatMessage[]>
  onTrigger?: (componentId: string) => void
  onValueChange?: (componentId: string, value: string) => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    const canvasRect = canvasRef.current!.getBoundingClientRect()
    const newKind = event.dataTransfer.getData('application/circuitui-new-component') as ComponentKind | ''
    const movedId = event.dataTransfer.getData('application/circuitui-move-component')

    if (newKind) {
      const size = defaultSize[newKind]
      onAddComponent(newKind, {
        x: event.clientX - canvasRect.left - size.width / 2,
        y: event.clientY - canvasRect.top - size.height / 2,
      })
    } else if (movedId) {
      onMoveComponent(movedId, {
        x: event.clientX - canvasRect.left - dragOffset.current.x,
        y: event.clientY - canvasRect.top - dragOffset.current.y,
      })
    }
  }

  return (
    <div
      ref={canvasRef}
      className={`builder-canvas ${previewMode ? 'builder-canvas-preview' : ''}`}
      onDragOver={previewMode ? undefined : (event) => event.preventDefault()}
      onDrop={previewMode ? undefined : handleDrop}
      onClick={() => !previewMode && onSelect(null)}
    >
      {screen.components.map((component) => {
        const liveProps = component.id in runtimeValues
          ? { ...component.props, ...outputOverrideProps(component.type, runtimeValues[component.id]) }
          : component.props
        return (
          <div
            key={component.id}
            className={`canvas-component ${selectedId === component.id ? 'canvas-component-selected' : ''} ${component.type === 'chat' ? 'canvas-component-chat' : ''}`}
            style={{
              left: component.position.x,
              top: component.position.y,
              width: component.size.width,
              height: component.size.height,
            }}
            draggable={!previewMode}
            onDragStart={previewMode ? undefined : (event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
              event.dataTransfer.setData('application/circuitui-move-component', component.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onClick={previewMode ? undefined : (event) => {
              event.stopPropagation()
              onSelect(component.id)
            }}
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
            {!previewMode && component.binding && (
              <span className="canvas-binding-badge">⚡ {component.binding.workflow_name || 'bound'}</span>
            )}
            {previewMode && runErrors[component.id] && (
              <span className="canvas-error-badge">{runErrors[component.id]}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
