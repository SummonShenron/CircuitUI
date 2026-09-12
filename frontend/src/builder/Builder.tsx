import { useEffect, useState } from 'react'
import { getApp, updateApp } from '../api/apps'
import { listWorkflows, runConsole, runWorkflow } from '../api/workflows'
import type { ChatMessage, CircuitApp, CircuitComponent, ComponentKind, Screen, WorkflowSummary } from '../types'
import { defaultProps, defaultSize } from '../componentCatalog'
import { buildWorkflowInputs, extractConsoleReply, findEventName } from './runtime'
import ComponentPalette from './ComponentPalette'
import Canvas from './Canvas'
import PropertiesPanel from './PropertiesPanel'
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

  const runChatBinding = async (component: CircuitComponent, binding: NonNullable<CircuitComponent['binding']>) => {
    const draft = String(runtimeValues[component.id] ?? '').trim()
    if (!draft) return
    const workflow = workflows.find((item) => item.id === binding.workflow_id)
    const eventName = findEventName(workflow)
    if (!eventName) {
      setRunErrors((prev) => ({ ...prev, [component.id]: "This workflow has no 'External event' trigger — add one in workflow_builder." }))
      return
    }
    const priorHistory = chatHistories[component.id] ?? []
    setChatHistories((prev) => ({ ...prev, [component.id]: [...priorHistory, { role: 'user', content: draft }] }))
    setRuntimeValues((prev) => ({ ...prev, [component.id]: '' }))
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

  const runBinding = async (component: CircuitComponent) => {
    const binding = component.binding
    if (!binding || !activeScreen) return
    if (component.type === 'chat') return runChatBinding(component, binding)
    setRunningIds((prev) => new Set(prev).add(component.id))
    setRunErrors((prev) => { const next = { ...prev }; delete next[component.id]; return next })
    try {
      const workflow = workflows.find((item) => item.id === binding.workflow_id)
      const inputs = buildWorkflowInputs(binding.input_mapping, workflow?.inputs ?? [], activeScreen, runtimeValues)
      const result = await runWorkflow(binding.workflow_id, inputs)
      if (result.context.errors.length > 0) throw new Error(result.context.errors.join('; '))
      if (binding.output_key) {
        setRuntimeValues((prev) => ({ ...prev, [component.id]: result.context.outputs[binding.output_key!] }))
      }
    } catch (error) {
      setRunErrors((prev) => ({ ...prev, [component.id]: String(error instanceof Error ? error.message : error) }))
    } finally {
      setRunningIds((prev) => { const next = new Set(prev); next.delete(component.id); return next })
    }
  }

  // Fire every on_load-bound component on the active screen whenever preview mode opens on it.
  useEffect(() => {
    if (!previewMode || !activeScreen) return
    for (const component of activeScreen.components) {
      if (component.binding?.trigger === 'on_load') void runBinding(component)
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

  const addComponent = (kind: ComponentKind, position: { x: number; y: number }) => {
    const component: CircuitComponent = {
      id: crypto.randomUUID(),
      type: kind,
      name: `${kind} ${activeScreen.components.length + 1}`,
      position,
      size: defaultSize[kind],
      props: { ...defaultProps[kind] },
    }
    updateScreen({ components: [...activeScreen.components, component] })
    setSelectedId(component.id)
  }

  const patchComponent = (id: string, patch: Partial<CircuitComponent>) => {
    updateScreen({
      components: activeScreen.components.map((component) => (component.id === id ? { ...component, ...patch } : component)),
    })
  }

  const removeComponent = (id: string) => {
    updateScreen({ components: activeScreen.components.filter((component) => component.id !== id) })
    setSelectedId(null)
  }

  const addScreen = () => {
    const screen: Screen = { id: crypto.randomUUID(), name: `Screen ${app.screens.length + 1}`, components: [] }
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
    setRuntimeValues({})
    setRunErrors({})
    setChatHistories({})
    setPreviewMode((value) => !value)
  }

  return (
    <div className="builder">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}>← Apps</button>
        <input
          className="builder-app-name"
          value={app.name}
          disabled={previewMode}
          onChange={(event) => setApp({ ...app, name: event.target.value })}
        />
        <button className="builder-preview-toggle" onClick={togglePreview}>
          {previewMode ? 'Exit preview' : '▶ Preview'}
        </button>
        {!previewMode && (
          <button className="builder-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        )}
      </header>

      <div className="builder-screen-tabs">
        {app.screens.map((screen) => (
          <button
            key={screen.id}
            className={screen.id === activeScreenId ? 'builder-screen-tab-active' : 'builder-screen-tab'}
            onClick={() => { setActiveScreenId(screen.id); setSelectedId(null) }}
          >
            {screen.name}
          </button>
        ))}
        {!previewMode && <button className="builder-screen-tab-add" onClick={addScreen}>+ Screen</button>}
      </div>

      <div className={`builder-body ${previewMode ? 'builder-body-preview' : ''}`}>
        {!previewMode && <ComponentPalette />}
        <Canvas
          screen={activeScreen}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddComponent={addComponent}
          onMoveComponent={(id, position) => patchComponent(id, { position })}
          previewMode={previewMode}
          runtimeValues={runtimeValues}
          runningIds={runningIds}
          runErrors={runErrors}
          chatHistories={chatHistories}
          onTrigger={(id) => {
            const component = activeScreen.components.find((item) => item.id === id)
            if (component) void runBinding(component)
          }}
          onValueChange={(id, value) => setRuntimeValues((prev) => ({ ...prev, [id]: value }))}
        />
        {!previewMode && (
          <PropertiesPanel
            component={selectedComponent}
            workflows={workflows}
            workflowsLoading={workflowsLoading}
            onRefreshWorkflows={refreshWorkflows}
            screenComponents={activeScreen.components}
            onChange={(patch) => selectedComponent && patchComponent(selectedComponent.id, patch)}
            onDelete={() => selectedComponent && removeComponent(selectedComponent.id)}
          />
        )}
      </div>
    </div>
  )
}
