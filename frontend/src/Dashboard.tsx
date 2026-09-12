import { useEffect, useState } from 'react'
import { createApp, deleteApp, listApps } from './api/apps'
import type { CircuitAppSummary } from './types'
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

  const handleDelete = async (appId: string) => {
    await deleteApp(appId)
    refresh()
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>CircUIt</h1>
        <p>Apps that put a screen in front of your Circuit workflows.</p>
      </header>

      <div className="dashboard-create">
        <input
          value={newAppName}
          onChange={(event) => setNewAppName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
          placeholder="New app name"
        />
        <button onClick={handleCreate}>Create app</button>
      </div>

      {loading && <p>Loading apps…</p>}
      {error && <p className="dashboard-error">{error}</p>}

      <ul className="dashboard-list">
        {apps.map((app) => (
          <li key={app.id} className="dashboard-card">
            <button className="dashboard-card-open" onClick={() => onOpen(app.id)}>
              <strong>{app.name}</strong>
              <span>{app.screen_count} screen{app.screen_count === 1 ? '' : 's'}</span>
            </button>
            <button className="dashboard-card-delete" onClick={() => handleDelete(app.id)}>Delete</button>
          </li>
        ))}
        {!loading && apps.length === 0 && <p>No apps yet. Create your first one above.</p>}
      </ul>
    </div>
  )
}
