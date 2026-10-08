import { useEffect, useRef, useState } from 'react'
import { getApp, updateApp } from '../api/apps'
import { listWorkflows, runConsole, runWorkflow } from '../api/workflows'
import type { ActionStep, ChatMessage, CircuitApp, CircuitComponent, ComponentKind, Screen, WorkflowSummary } from '../types'
import { defaultProps, defaultScreenSize, defaultSize } from '../componentCatalog'
import { defaultStyleForKind } from '../effectPresets'
import { evaluateExpression } from './expressions'
import { buildWorkflowInputs, extractConsoleReply, findEventName, resolveTemplate } from './runtime'
import ComponentPalette from './ComponentPalette'
import Canvas from './Canvas'
import PropertiesPanel from './PropertiesPanel'
import Logo from '../Logo'
import './Builder.css'

export default function Builder({ appId, onClose }: { appId: string; onClose: () => void }) {
  const [app, setApp] = useState<CircuitApp | null>(null)
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [runtimeValues, setRuntimeValues] = useState<Record<string, unknown>>({})
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [runErrors, setRunErrors] = useState<Record<string, string>>({})
  const [workflowsLoading, setWorkflowsLoading] = useState(false)
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({})
  const [variables, setVariables] = useState<Record<string, unknown>>({})
  // Actions run sequentially and each one may need to see a variable (or a
  // runtime value, e.g. a run_workflow step's own output) a previous step in
  // the same run just set, before React re-renders with the new state -
  // these refs stay in lockstep with their state for that reason.
  const variablesRef = useRef<Record<string, unknown>>({})
  const runtimeValuesRef = useRef<Record<string, unknown>>({})

  const updateRuntimeValue = (id: string, value: unknown) => {
    runtimeValuesRef.current = { ...runtimeValuesRef.current, [id]: value }
    setRuntimeValues(runtimeValuesRef.current)
  }

  const refreshWorkflows = () => {
    setWorkflowsLoading(true)
    return listWorkflows()
      .then(setWorkflows)
      .catch(() => setWorkflows([]))
      .finally(() => setWorkflowsLoading(false))
  }

  useEffect(() => {
    getApp(appId).then((loaded) => {
      setApp(loaded)
      setActiveScreenId(loaded.screens[0]?.id ?? null)
    })
    void refreshWorkflows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId])

  const activeScreen = app?.screens.find((screen) => screen.id === activeScreenId) ?? null

  const runChatBinding = async (component: CircuitComponent, binding: NonNullable<CircuitComponent['binding']>, overrideMessage?: string) => {
    const draft = (overrideMessage ?? String(runtimeValuesRef.current[component.id] ?? '')).trim()
    if (!draft) return
    const workflow = workflows.find((item) => item.id === binding.workflow_id)
    const eventName = findEventName(workflow)
    if (!eventName) {
      setRunErrors((prev) => ({ ...prev, [component.id]: "This workflow has no 'External event' trigger — add one in workflow_builder." }))
      return
    }
    const priorHistory = chatHistories[component.id] ?? []
    setChatHistories((prev) => ({ ...prev, [component.id]: [...priorHistory, { role: 'user', content: draft }] }))
    updateRuntimeValue(component.id, '')
    setRunningIds((prev) => new Set(prev).add(component.id))
    setRunErrors((prev) => { const next = { ...prev }; delete next[component.id]; return next })
    try {
      const reply = await runConsole(binding.workflow_id, eventName, `circuitui-${component.id}`, draft, priorHistory)
      setChatHistories((prev) => ({ ...prev, [component.id]: [...(prev[component.id] ?? []), { role: 'assistant', content: extractConsoleReply(reply) }] }))
    } catch (error) {
      setRunErrors((prev) => ({ ...prev, [component.id]: String(error instanceof Error ? error.message : error) }))
    } finally {
      setRunningIds((prev) => { const next = new Set(prev); next.delete(component.id); return next })
    }
  }

  // Shared by the legacy single `binding` and the `run_workflow` action step -
  // both just need to run a workflow and (optionally) drop its output onto
  // whichever component owns the trigger.
  const runWorkflowStep = async (ownerId: string, workflowId: string, inputMapping: Record<string, string>, outputKey?: string | null) => {
    if (!activeScreen) return
    setRunningIds((prev) => new Set(prev).add(ownerId))
    setRunErrors((prev) => { const next = { ...prev }; delete next[ownerId]; return next })
    try {
      const workflow = workflows.find((item) => item.id === workflowId)
      const inputs = buildWorkflowInputs(inputMapping, workflow?.inputs ?? [], activeScreen, runtimeValuesRef.current)
      const result = await runWorkflow(workflowId, inputs)
      if (result.context.errors.length > 0) throw new Error(result.context.errors.join('; '))
      if (outputKey) {
        updateRuntimeValue(ownerId, result.context.outputs[outputKey])
      }
    } catch (error) {
      setRunErrors((prev) => ({ ...prev, [ownerId]: String(error instanceof Error ? error.message : error) }))
    } finally {
      setRunningIds((prev) => { const next = new Set(prev); next.delete(ownerId); return next })
    }
  }

  const runBinding = async (component: CircuitComponent) => {
    const binding = component.binding
    if (!binding || !activeScreen) return
    if (component.type === 'chat') return runChatBinding(component, binding)
    return runWorkflowStep(component.id, binding.workflow_id, binding.input_mapping, binding.output_key)
  }

  const runAction = async (owner: CircuitComponent, step: ActionStep) => {
    if (!activeScreen) return
    switch (step.type) {
      case 'run_workflow':
        await runWorkflowStep(owner.id, step.workflow_id, step.input_mapping, step.output_key)
        break
      case 'set_variable': {
        const value = evaluateExpression(step.value, activeScreen, runtimeValuesRef.current, variablesRef.current)
        variablesRef.current = { ...variablesRef.current, [step.name]: value }
        setVariables(variablesRef.current)
        break
      }
      case 'navigate':
        setActiveScreenId(step.screen_id)
        setSelectedId(null)
        break
      case 'send_chat_message': {
        const target = activeScreen.components.find((item) => item.id === step.target_component_id)
        if (target?.binding) {
          const message = resolveTemplate(step.message, activeScreen, runtimeValuesRef.current)
          await runChatBinding(target, target.binding, message)
        }
        break
      }
      case 'append_to_list': {
        const entry: Record<string, unknown> = {}
        for (const field of step.fields) {
          if (!field.key) continue
          entry[field.key] = evaluateExpression(field.value, activeScreen, runtimeValuesRef.current, variablesRef.current)
        }
        const current = variablesRef.current[step.variable]
        const nextList = Array.isArray(current) ? [...current, entry] : [entry]
        variablesRef.current = { ...variablesRef.current, [step.variable]: nextList }
        setVariables(variablesRef.current)
        break
      }
    }
  }

  const runComponent = async (component: CircuitComponent) => {
    if (component.binding) await runBinding(component)
    for (const step of component.actions ?? []) {
      await runAction(component, step)
    }
  }

  const effectiveTrigger = (component: CircuitComponent) => component.trigger ?? component.binding?.trigger ?? 'on_click'

  // Fire every on_load component on the active screen whenever preview mode opens on it.
  useEffect(() => {
    if (!previewMode || !activeScreen) return
    for (const component of activeScreen.components) {
      const hasTriggerable = component.binding || (component.actions?.length ?? 0) > 0
      if (hasTriggerable && effectiveTrigger(component) === 'on_load') void runComponent(component)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, activeScreenId])

  if (!app || !activeScreen) return <p className="builder-loading">Loading app…</p>

  const selectedComponent = activeScreen.components.find((component) => component.id === selectedId) ?? null

  const updateScreen = (patch: Partial<Screen>) => {
    setApp({
      ...app,
      screens: app.screens.map((screen) => (screen.id === activeScreenId ? { ...screen, ...patch } : screen)),
    })
  }

  const addComponent = (kind: ComponentKind, position: { x: number; y: number }, parentId: string | null = null) => {
    const component: CircuitComponent = {
      id: crypto.randomUUID(),
      type: kind,
      name: `${kind} ${activeScreen.components.length + 1}`,
      position,
      size: defaultSize[kind],
      props: { ...defaultProps[kind] },
      style: defaultStyleForKind[kind] ? { ...defaultStyleForKind[kind] } : null,
      parent_id: parentId,
    }
    updateScreen({ components: [...activeScreen.components, component] })
    setSelectedId(component.id)
  }

  const patchComponent = (id: string, patch: Partial<CircuitComponent>) => {
    updateScreen({
      components: activeScreen.components.map((component) => (component.id === id ? { ...component, ...patch } : component)),
    })
  }

  // Removing a container takes everything grouped inside it (and inside
  // those, recursively) along with it, rather than orphaning them.
  const removeComponent = (id: string) => {
    const childrenOf = new Map<string, string[]>()
    for (const component of activeScreen.components) {
      if (!component.parent_id) continue
      const list = childrenOf.get(component.parent_id) ?? []
      list.push(component.id)
      childrenOf.set(component.parent_id, list)
    }
    const toRemove = new Set([id])
    const stack = [id]
    while (stack.length > 0) {
      const current = stack.pop()!
      for (const childId of childrenOf.get(current) ?? []) {
        if (!toRemove.has(childId)) {
          toRemove.add(childId)
          stack.push(childId)
        }
      }
    }
    updateScreen({ components: activeScreen.components.filter((component) => !toRemove.has(component.id)) })
    setSelectedId(null)
  }

  const addScreen = () => {
    const screen: Screen = {
      id: crypto.randomUUID(),
      name: `Screen ${app.screens.length + 1}`,
      components: [],
      size: { ...defaultScreenSize },
    }
    setApp({ ...app, screens: [...app.screens, screen] })
    setActiveScreenId(screen.id)
  }

  const save = async () => {
    setSaving(true)
    try {
      const saved = await updateApp(app.id, { screens: app.screens, name: app.name, description: app.description })
      setApp(saved)
    } finally {
      setSaving(false)
    }
  }

  const togglePreview = () => {
    setSelectedId(null)
    runtimeValuesRef.current = {}
    setRuntimeValues({})
    setRunErrors({})
    setChatHistories({})
    variablesRef.current = {}
    setVariables({})
    setPreviewMode((value) => !value)
  }

  return (
    <div className="builder">
      <header className="builder-header">
        <div className="builder-header-left">
          <button className="builder-logo" onClick={onClose} title="Back to apps">
            <Logo />
          </button>
        </div>
        <div className="builder-header-center">
          <input
            className="builder-app-name"
            value={app.name}
            disabled={previewMode}
            onChange={(event) => setApp({ ...app, name: event.target.value })}
          />
        </div>
        <div className="builder-header-right">
          <button className="btn-3d builder-preview-toggle" onClick={togglePreview}>
            {previewMode ? 'Exit preview' : '▶ Preview'}
          </button>
          {!previewMode && (
            <button className="btn-3d" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          )}
        </div>
      </header>

      <div className="builder-screen-tabs">
        {app.screens.map((screen) => (
          <button
            key={screen.id}
            className={`btn-3d-quiet builder-screen-tab ${screen.id === activeScreenId ? 'active' : ''}`}
            onClick={() => { setActiveScreenId(screen.id); setSelectedId(null) }}
          >
            {screen.name}
          </button>
        ))}
        {!previewMode && <button className="btn-3d-quiet builder-screen-tab" onClick={addScreen}>+ Screen</button>}
      </div>

      <div className={`builder-body ${previewMode ? 'builder-body-preview' : ''}`}>
        {!previewMode && <ComponentPalette />}
        <Canvas
          screen={activeScreen}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddComponent={addComponent}
          onMoveComponent={(id, position, parentId) => patchComponent(id, { position, parent_id: parentId })}
          onResize={(id, size) => patchComponent(id, { size })}
          previewMode={previewMode}
          runtimeValues={runtimeValues}
          variables={variables}
          runningIds={runningIds}
          runErrors={runErrors}
          chatHistories={chatHistories}
          onTrigger={(id) => {
            const component = activeScreen.components.find((item) => item.id === id)
            if (component) void runComponent(component)
          }}
          onValueChange={(id, value) => updateRuntimeValue(id, value)}
        />
        {!previewMode && (
          <PropertiesPanel
            component={selectedComponent}
            screen={activeScreen}
            screens={app.screens}
            workflows={workflows}
            workflowsLoading={workflowsLoading}
            onRefreshWorkflows={refreshWorkflows}
            screenComponents={activeScreen.components}
            onChange={(patch) => selectedComponent && patchComponent(selectedComponent.id, patch)}
            onScreenChange={updateScreen}
            onDelete={() => selectedComponent && removeComponent(selectedComponent.id)}
          />
        )}
      </div>
    </div>
  )
}
