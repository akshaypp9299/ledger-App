import { useEffect, useState, createContext, useContext } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ChevronLeft, ChevronRight, Lock, Menu, Plus, Search, X, CalendarDays, LogOut, Building, Receipt, Users, Megaphone, FileText } from 'lucide-react'
import { navGroups, bottomTabs } from '../data/nav'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Period { month: number; year: number; key: string; label: string; prev: () => void; next: () => void }
const PeriodCtx = createContext<Period | null>(null)
export const usePeriod = () => {
  const p = useContext(PeriodCtx)
  if (!p) throw new Error('usePeriod outside Shell')
  return p
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { canWrite, isAdmin } = useAuth()
  const allowed = (min?: 'MANAGER' | 'ADMIN') => !min || (min === 'ADMIN' ? isAdmin : canWrite)
  return (
    <nav aria-label="Main">
      {navGroups.map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.minRole)) })).filter((g) => g.items.length > 0).map((g) => (
        <div className="nav-group" key={g.title}>
          <div className="nav-title">{g.title}</div>
          {g.items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.to === '/'} onClick={onNavigate}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <it.icon size={18} aria-hidden />
              <span>{it.label}</span>
              {it.locked && <Lock size={13} className="lock" aria-label="Locked" />}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

const quickAdd = [
  { icon: Receipt, label: 'Record receipt', hint: 'Maintenance payment from a flat', to: '/maintenance?add=receipt' },
  { icon: Receipt, label: 'Add expense / income', hint: 'Petty cash, cheque or vendor bill', to: '/cashbook?add=entry' },
  { icon: Users, label: 'Add tenant / agreement', hint: 'With expiry countdown', to: '/tenants?add=1' },
  { icon: Megaphone, label: 'New notice', hint: 'Share on WhatsApp', to: '/notices?add=1' },
  { icon: FileText, label: 'Upload document', hint: 'Agreement, receipt, minutes', to: '/documents?add=1' },
]

export default function Shell() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [drawer, setDrawer] = useState(false)
  const [add, setAdd] = useState(false)
  const [picker, setPicker] = useState(false)
  const [pickYear, setPickYear] = useState(now.getFullYear())
  const loc = useLocation()
  const nav = useNavigate()
  const { user, canWrite, logout } = useAuth()
  const [menu, setMenu] = useState(false)

  useEffect(() => { setDrawer(false); setAdd(false) }, [loc.pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawer(false); setAdd(false); setPicker(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const shift = (d: number) => {
    const m = month + d
    if (m < 0) { setMonth(11); setYear(year - 1) }
    else if (m > 11) { setMonth(0); setYear(year + 1) }
    else setMonth(m)
  }
  const period: Period = { month, year, key: `${year}-${String(month + 1).padStart(2, '0')}`, label: `${MONTHS[month]} ${year}`, prev: () => shift(-1), next: () => shift(1) }

  return (
    <PeriodCtx.Provider value={period}>
      <a href="#main" className="skip">Skip to content</a>
      <div className="app">
        <aside className="sidebar" aria-label="Sidebar">
          <div className="brand"><div className="logo"><Building size={18} /></div><div><b>SocietyOS</b><small>Back-office</small></div></div>
          <SidebarNav />
        </aside>

        {drawer && (
          <div className="overlay" onClick={() => setDrawer(false)}>
            <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Menu">
              <div className="drawer-head"><b>Menu</b><button className="icon-btn" onClick={() => setDrawer(false)} aria-label="Close menu"><X size={20} /></button></div>
              <SidebarNav onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}

        <div className="main-col">
          <header className="topbar">
            <button className="icon-btn only-mobile" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={22} /></button>
            <button className="society" title="Switch society (multi-tenant)">
              <span className="avatar sm">ST</span>
              <span className="society-name">{user?.societyName}</span>
            </button>
            <label className="search">
              <Search size={16} aria-hidden />
              <input placeholder="Search flat, person, vendor, cheque..." aria-label="Search" />
              <kbd>Ctrl K</kbd>
            </label>
            <div className="pp">
              <button className="period-btn" onClick={() => { setPickYear(year); setPicker(!picker) }} aria-haspopup="dialog" aria-expanded={picker}>
                <CalendarDays size={17} aria-hidden /> {period.label}
              </button>
              {picker && (
                <>
                  <div className="overlay" style={{ background: 'transparent', zIndex: 25 }} onClick={() => setPicker(false)} />
                  <div className="pp-pop" role="dialog" aria-label="Choose month and year">
                    <div className="pp-year">
                      <button className="icon-btn" onClick={() => setPickYear(pickYear - 1)} aria-label="Previous year"><ChevronLeft size={18} /></button>
                      <span>{pickYear}</span>
                      <button className="icon-btn" onClick={() => setPickYear(pickYear + 1)} aria-label="Next year"><ChevronRight size={18} /></button>
                    </div>
                    <div className="pp-grid">
                      {MONTHS.map((m, i) => (
                        <button key={m} className={(i === month && pickYear === year ? 'on ' : '') + (i === now.getMonth() && pickYear === now.getFullYear() ? 'now' : '')}
                          onClick={() => { setMonth(i); setYear(pickYear); setPicker(false) }}>{m}</button>
                      ))}
                    </div>
                    <div className="pp-foot">
                      <button onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()); setPicker(false) }}>This month</button>
                      <button onClick={() => setPicker(false)}>Close</button>
                    </div>
                  </div>
                </>
              )}
            </div>
            {canWrite && <button className="btn primary only-desktop" onClick={() => setAdd(true)}><Plus size={16} /> Add</button>}
            <div className="pp">
              <button className="avatar" onClick={() => setMenu(!menu)} aria-label="Account menu" aria-expanded={menu}>{(user?.name ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}</button>
              {menu && (
                <>
                  <div className="overlay" style={{ background: 'transparent', zIndex: 25 }} onClick={() => setMenu(false)} />
                  <div className="pp-pop acct" role="menu">
                    <b>{user?.name}</b><small>{user?.email}</small><small>Role: {user?.role}</small>
                    <button className="btn" onClick={logout}><LogOut size={16} /> Sign out</button>
                  </div>
                </>
              )}
            </div>
          </header>

          <main id="main" className="content"><Outlet /></main>
        </div>

        <nav className="bottombar" aria-label="Primary">
          {bottomTabs.slice(0, 2).map((t) => <Tab key={t.to} {...t} />)}
          {canWrite ? <button className="fab" onClick={() => setAdd(true)} aria-label="Quick add"><Plus size={26} /></button> : <span />}
          {bottomTabs.slice(2).map((t) => <Tab key={t.to} {...t} />)}
        </nav>

        {add && (
          <div className="overlay sheet-wrap" onClick={() => setAdd(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Quick add">
              <div className="drawer-head"><b>Quick add</b><button className="icon-btn" onClick={() => setAdd(false)} aria-label="Close"><X size={20} /></button></div>
              {quickAdd.map((q) => (
                <button className="qa" key={q.label} onClick={() => { setAdd(false); nav(q.to) }}>
                  <span className="qa-ic"><q.icon size={18} /></span>
                  <span><b>{q.label}</b><small>{q.hint}</small></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </PeriodCtx.Provider>
  )
}

function Tab({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Menu }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
      <Icon size={22} aria-hidden /><span>{label}</span>
    </NavLink>
  )
}
