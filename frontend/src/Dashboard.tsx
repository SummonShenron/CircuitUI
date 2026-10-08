import { useEffect, useState, type MouseEvent } from 'react'
import { AppWindow, Clock3, FilePlus2, LayoutPanelTop, Trash2 } from 'lucide-react'
import { createApp, deleteApp, listApps } from './api/apps'
import type { CircuitAppSummary } from './types'
import Logo from './Logo'
import './Dashboard.css'

export default function Dashboard({ onOpen }: { onOpen: (appId: string) => void }) {
  const [apps, setApps] = useState<CircuitAppSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newAppName, setNewAppName] = useState('')

  const refresh = () => {
    setLoading(true)
    listApps()
      .then(setApps)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const handleCreate = async () => {
    if (!newAppName.trim()) return
    const app = await createApp(newAppName.trim(), '')
    setNewAppName('')
    refresh()
    onOpen(app.id)
  }

  const handleDelete = async (event: MouseEvent, appId: string) => {
    event.stopPropagation()
    await deleteApp(appId)
    refresh()
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <div className="dashboard-brand"><Logo /></div>
      </header>

      <div className="dashboard-body">
        <div className="dashboard-heading">
          <div className="dashboard-heading-copy">
            <span>APPS</span>
            <h1>Design, bind, ship.</h1>
            <p>Apps that put a screen in front of your Circuit workflows, saved to your workspace and ready to pick up where you left off.</p>
          </div>
          <div className="glass-panel dashboard-create">
            <span>NEW APP</span>
            <div className="dashboard-create-form">
              <input
                value={newAppName}
                onChange={(event) => setNewAppName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
                placeholder="App name"
              />
              <button className="btn-3d" onClick={handleCreate}><FilePlus2 size={16} /> Create</button>
            </div>
          </div>
        </div>

        {error && <p className="dashboard-error">{error}</p>}

        {loading ? (
          <p className="dashboard-empty">Loading apps…</p>
        ) : apps.length === 0 ? (
          <section className="dashboard-empty">
            <AppWindow size={28} />
            <strong>Start with an app</strong>
            <span>Create a blank screen, then bind components to a workflow.</span>
          </section>
        ) : (
          <section className="app-grid">
            {apps.map((app) => (
              <button className="glass-card app-card" key={app.id} onClick={() => onOpen(app.id)}>
                <div className="app-card-top">
                  <span className="app-card-icon"><AppWindow size={18} /></span>
                  <span className="app-card-delete" role="button" tabIndex={0} title="Delete app" onClick={(event) => void handleDelete(event, app.id)}>
                    <Trash2 size={15} />
                  </span>
                </div>
                <strong>{app.name}</strong>
                <p>{app.description || 'No description yet.'}</p>
                <div className="app-card-meta">
                  <span><LayoutPanelTop size={13} /> {app.screen_count} screen{app.screen_count === 1 ? '' : 's'}</span>
                  <span><Clock3 size={13} /> {new Date(app.updated_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}
