import { useEffect, useState } from 'react'
import { getApp, updateApp } from '../api/apps'
import { listWorkflows } from '../api/workflows'
import type { CircuitApp, CircuitComponent, ComponentKind, Screen, WorkflowSummary } from '../types'
import { defaultProps, defaultSize } from '../componentCatalog'
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

  useEffect(() => {
    getApp(appId).then((loaded) => {
      setApp(loaded)
      setActiveScreenId(loaded.screens[0]?.id ?? null)
    })
    listWorkflows().then(setWorkflows).catch(() => setWorkflows([]))
  }, [appId])

  if (!app || !activeScreenId) return <p className="builder-loading">Loading app…</p>

  const activeScreen = app.screens.find((screen) => screen.id === activeScreenId)!
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

  return (
    <div className="builder">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}>← Apps</button>
        <input
          className="builder-app-name"
          value={app.name}
          onChange={(event) => setApp({ ...app, name: event.target.value })}
        />
        <button className="builder-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
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
        <button className="builder-screen-tab-add" onClick={addScreen}>+ Screen</button>
      </div>

      <div className="builder-body">
        <ComponentPalette />
        <Canvas
          screen={activeScreen}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddComponent={addComponent}
          onMoveComponent={(id, position) => patchComponent(id, { position })}
        />
        <PropertiesPanel
          component={selectedComponent}
          workflows={workflows}
          onChange={(patch) => selectedComponent && patchComponent(selectedComponent.id, patch)}
          onDelete={() => selectedComponent && removeComponent(selectedComponent.id)}
        />
      </div>
    </div>
  )
}
