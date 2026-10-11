import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Banknote, Info, TrendingUp, Users, Wallet } from 'lucide-react'
import { api } from '../api/client'
import type { Dashboard as D } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { usePeriod } from '../components/Shell'
import { ErrorState, Loading } from '../components/ui'
import { inr } from '../lib/format'

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const entityWord: Record<string, string> = { LEDGER: 'cashbook entry', VENDOR_INVOICE: 'vendor bill', VENDOR_PAYMENT: 'vendor payment', RECEIPT: 'receipt', FLAT: 'flat', AGREEMENT: 'agreement', NOTICE: 'notice', STAFF: 'staff member', ATTENDANCE: 'attendance', DOCUMENT: 'document', CHARGE: 'charges', CONTACT: 'contact' }
const actionWord: Record<string, string> = { CREATE: 'added', UPDATE: 'updated', DELETE: 'deleted', REVERSE: 'reversed', MARK: 'marked', UPLOAD: 'uploaded', GENERATE: 'generated', EXPORT: 'exported', ACTIVATE: 'activated', DEACTIVATE: 'deactivated' }

export default function Dashboard() {
  const { user, canWrite } = useAuth()
  const { key, label } = usePeriod()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard', key], queryFn: () => api<D>(`/dashboard?period=${key}`) })
  const first = user?.name.split(' ')[0] ?? ''

  if (isLoading) return <Loading />
  if (error || !data) return <ErrorState error={error} retry={() => refetch()} />
  const pct = data.expected > 0 ? Math.min(100, Math.round((data.collected / data.expected) * 100)) : 0

  return (
    <>
      <div className="hero">
        <div><h1>{greeting()}, {first}</h1><p>{label}: {data.attention.length === 0 ? 'everything looks on track.' : `${data.attention.length} thing${data.attention.length > 1 ? 's' : ''} need your attention.`}</p></div>
        {canWrite && <Link to="/maintenance?add=receipt" className="btn">Record a receipt</Link>}
      </div>

      <section className="grid kpis" aria-label="Key figures">
        <div className="card kpi"><div className="kpi-ic teal"><TrendingUp size={18} /></div><span>Collected</span><b>{inr(data.collected)}</b>
          <div className="bar"><i style={{ width: pct + '%' }} /></div><small>{data.expected ? `${pct}% of ${inr(data.expected)}` : 'No charges generated yet'}</small></div>
        <div className="card kpi"><div className="kpi-ic red"><AlertTriangle size={18} /></div><span>Outstanding</span><b>{inr(data.outstanding)}</b><small>{data.overdueFlats} flat{data.overdueFlats === 1 ? '' : 's'} pending</small></div>
        <div className="card kpi"><div className="kpi-ic blue"><Wallet size={18} /></div><span>Cash balance</span><b>{inr(data.cashBalance)}</b><small>Calculated from the cashbook</small></div>
        <div className="card kpi"><div className="kpi-ic amber"><Banknote size={18} /></div><span>Expenses this month</span><b>{inr(data.expenses)}</b><small>{data.expenseCount} entr{data.expenseCount === 1 ? 'y' : 'ies'}</small></div>
      </section>

      <div className="grid two">
        <section className="card" aria-labelledby="att">
          <div className="card-head"><h2 id="att">Needs attention</h2></div>
          {data.attention.length === 0 ? <p className="muted">Nothing urgent right now.</p> : (
            <ul className="list">{data.attention.map((a, i) => (
              <li key={i}><Link to={a.to} className="row-link">
                <span className={'dot ' + a.tone}>{a.tone === 'info' ? <Info size={14} /> : <AlertTriangle size={14} />}</span>
                <span className="grow"><b>{a.title}</b><small>{a.meta}</small></span><ArrowRight size={16} className="muted" />
              </Link></li>))}</ul>)}
        </section>

        <section className="card" aria-labelledby="coll">
          <div className="card-head"><h2 id="coll">Collection by building</h2><Link to="/maintenance" className="link">View all</Link></div>
          {data.buildings.map((b) => { const p = b.charged > 0 ? Math.round((b.paid / b.charged) * 100) : 0; return (
            <div className="bld" key={b.name}><div className="bld-top"><b>{b.name} Building</b><span className="muted">{b.flats} flats - {b.charged > 0 ? p + '%' : 'no charges'}</span></div>
              <div className="bar"><i style={{ width: p + '%' }} /></div></div>) })}
        </section>
      </div>

      <div className="grid two">
        <section className="card" aria-labelledby="act">
          <div className="card-head"><h2 id="act">Recent activity</h2>{canWrite && <Link to="/audit" className="link">Audit log</Link>}</div>
          {data.activity.length === 0 ? <p className="muted">No activity yet.</p> : (
            <ul className="list">{data.activity.map((a, i) => (
              <li key={i} className="act-row"><span className="avatar sm">{a.who[0]}</span>
                <span className="grow"><b>{a.who}</b> {actionWord[a.action] ?? a.action.toLowerCase()} {entityWord[a.entity] ?? a.entity.toLowerCase().replace('_', ' ')}<small>{a.detail}</small></span>
                <small className="muted">{new Date(a.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</small></li>))}</ul>)}
        </section>
        <section className="card" aria-labelledby="qa">
          <div className="card-head"><h2 id="qa">Quick actions</h2></div>
          <div className="qa-grid">
            <Link to="/maintenance" className="qa-tile"><Wallet size={20} />Maintenance</Link>
            <Link to="/cashbook" className="qa-tile"><Banknote size={20} />Income & Expenses</Link>
            <Link to="/tenants" className="qa-tile"><Users size={20} />Agreements</Link>
            <Link to="/attendance" className="qa-tile"><TrendingUp size={20} />Attendance</Link>
          </div>
        </section>
      </div>
    </>
  )
}
