import { Link, useParams } from 'react-router-dom'
import { Construction, Lock } from 'lucide-react'
import { lockedModules } from '../data/nav'

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <>
      <div className="page-head"><div><h1>{title}</h1></div></div>
      <div className="card empty">
        <Construction size={28} className="muted" />
        <b>Layout approved first, screen next</b>
        <p className="muted">{note}</p>
      </div>
    </>
  )
}

export function Locked() {
  const { id = '' } = useParams()
  const m = lockedModules[id]
  if (!m) return <Placeholder title="Not found" note="This module does not exist." />
  return (
    <>
      <div className="page-head"><div><h1>{m.title}</h1><p className="muted">Available in a higher plan</p></div></div>
      <div className="card locked">
        <div className="locked-ic"><m.icon size={28} /></div>
        <span className="pill partial"><Lock size={12} /> Locked</span>
        <h2>{m.pitch}</h2>
        <ul>{m.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
        <div className="actions">
          <button className="btn primary">Request early access</button>
          <Link to="/" className="btn">Back to dashboard</Link>
        </div>
      </div>
    </>
  )
}
