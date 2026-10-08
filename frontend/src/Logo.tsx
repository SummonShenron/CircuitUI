import { CircuitBoard } from 'lucide-react'
import './Logo.css'

export default function Logo() {
  return (
    <>
      <span className="logo-badge"><CircuitBoard size={18} strokeWidth={2.25} /></span>
      <span className="logo-text">Circ<span className="logo-accent">UI</span>t</span>
    </>
  )
}
