import { useState } from 'react'
import Dashboard from './Dashboard'
import Builder from './builder/Builder'

export default function App() {
  const [openAppId, setOpenAppId] = useState<string | null>(null)

  if (openAppId) {
    return <Builder appId={openAppId} onClose={() => setOpenAppId(null)} />
  }
  return <Dashboard onOpen={setOpenAppId} />
}
