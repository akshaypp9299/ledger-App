import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Settings2, Undo2 } from 'lucide-react'
import { api, post } from '../api/client'
import type { Fund, FlatDues, PayMode, Statement } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ConfirmDialog, applyApiError, EmptyState, ErrorState, Field, FormActions, Loading, Modal, PageHead, Pill, useRefresh, useToast, ExportButton } from '../components/ui'
import { usePeriod } from '../components/Shell'
import { fmtDate, fundLabel, inr, modeLabel, periodLabel, todayIso } from '../lib/format'
import { useAddParam } from '../lib/hooks'

const FUNDS: Fund[] = ['MAINTENANCE', 'SINKING', 'REPAIR']
const short: Record<Fund, string> = { MAINTENANCE: 'M', SINKING: 'S', REPAIR: 'R' }
const tone = { PAID: 'ok', PARTIAL: 'warn', UNPAID: 'bad', NONE: 'muted' } as const
const word = { PAID: 'Paid', PARTIAL: 'Part', UNPAID: 'Due', NONE: '-' } as const

function FundChips({ f }: { f: FlatDues }) {
  return <div className="funds">{FUNDS.map((x) => <Pill key={x} tone={tone[f.funds[x].status]}><span title={fundLabel[x]}>{short[x]} {word[f.funds[x].status]}</span></Pill>)}</div>
}

function GenerateModal({ period, onClose }: { period: string; onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { maintenance: '', sinking: '', repair: '' } })
  const onSubmit = handleSubmit(async (v) => {
    const n = (s: string) => (s === '' ? 0 : Number(s))
    if (n(v.maintenance) + n(v.sinking) + n(v.repair) === 0) { setError('maintenance', { message: 'Enter at least one amount' }); return }
    try {
      const r = await post<{ created: number }>('/charges/generate', { period, maintenance: n(v.maintenance), sinking: n(v.sinking), repair: n(v.repair) })
      toast.ok(r.created === 0 ? 'Charges already exist for this month' : `${r.created} charges created`)
      await refresh('maintenance', 'dashboard')
      onClose()
    } catch (e) { applyApiError(e, setError, toast.err) }
  })
  return (
    <Modal title={`Generate charges - ${periodLabel(period)}`} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="form-grid">
        <p className="muted span">Sets the amount due from every flat for this month. Flats that already have a charge are left unchanged.</p>
        <Field label="Maintenance (₹ per flat)" error={errors.maintenance?.message}><input type="number" inputMode="decimal" min="0" step="0.01" {...register('maintenance')} /></Field>
        <Field label="Sinking fund (₹)" error={errors.sinking?.message}><input type="number" inputMode="decimal" min="0" step="0.01" {...register('sinking')} /></Field>
        <Field label="Repair fund (₹)" error={errors.repair?.message}><input type="number" inputMode="decimal" min="0" step="0.01" {...register('repair')} /></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Generate" /></div>
      </form>
    </Modal>
  )
}

interface ReceiptForm { flatId: string; fund: Fund; amount: string; paidOn: string; mode: PayMode; reference: string; note: string }

function ReceiptModal({ period, dues, initialFlat, onClose }: { period: string; dues: FlatDues[]; initialFlat?: string; onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { register, control, handleSubmit, setError, setValue, formState: { errors, isSubmitting } } =
    useForm<ReceiptForm>({ defaultValues: { flatId: initialFlat ?? '', fund: 'MAINTENANCE', amount: '', paidOn: todayIso(), mode: 'CASH', reference: '', note: '' } })
  const [flatId, fund, mode] = useWatch({ control, name: ['flatId', 'fund', 'mode'] })
  const row = dues.find((d) => d.flatId === flatId)
  const st = row?.funds[fund]
  const remaining = st && st.charged != null ? st.charged - st.paid : null

  const onSubmit = handleSubmit(async (v) => {
    try {
      await post('/receipts', { flatId: v.flatId, fund: v.fund, period, amount: Number(v.amount), paidOn: v.paidOn, mode: v.mode, reference: v.reference || null, note: v.note || null })
      toast.ok('Receipt recorded')
      await refresh('maintenance', 'ledger', 'dashboard', 'statement')
      onClose()
    } catch (e) { applyApiError(e, setError, toast.err) }
  })
  return (
    <Modal title={`Record receipt - ${periodLabel(period)}`} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="form-grid">
        <Field label="Flat" required error={errors.flatId?.message} span>
          <select {...register('flatId', { required: 'Choose a flat' })}><option value="">Select flat...</option>{dues.map((d) => <option key={d.flatId} value={d.flatId}>{d.building}-{d.flatNumber} - {d.ownerName}</option>)}</select>
        </Field>
        <Field label="Fund" required><select {...register('fund')}>{FUNDS.map((f) => <option key={f} value={f}>{fundLabel[f]}</option>)}</select></Field>
        <Field label="Amount (₹)" required error={errors.amount?.message}
          hint={remaining == null ? (flatId ? 'No charge generated for this fund this month' : undefined) : remaining > 0 ? `Balance due: ${inr(remaining)}` : 'Already fully paid'}>
          <input type="number" inputMode="decimal" step="0.01" {...register('amount', { required: 'Enter the amount', validate: (x) => Number(x) > 0 || 'Must be greater than 0' })} />
        </Field>
        {remaining != null && remaining > 0 && <button type="button" className="link-btn span" onClick={() => setValue('amount', String(remaining))}>Pay full balance ({inr(remaining)})</button>}
        <Field label="Date received" required error={errors.paidOn?.message}><input type="date" max={todayIso()} {...register('paidOn', { required: 'Choose a date' })} /></Field>
        <Field label="Mode"><select {...register('mode')}>{Object.entries(modeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {mode !== 'CASH' && <Field label={mode === 'CHEQUE' ? 'Cheque number' : 'Reference / UTR'} span><input {...register('reference')} /></Field>}
        <Field label="Note" span><input {...register('note')} placeholder="Optional" /></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Record receipt" /></div>
      </form>
    </Modal>
  )
}

function StatementModal({ flat, onClose }: { flat: FlatDues; onClose: () => void }) {
  const { canWrite } = useAuth()
  const toast = useToast()
  const refresh = useRefresh()
  const [revId, setRevId] = useState<string | null>(null)
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['statement', flat.flatId], queryFn: () => api<Statement>(`/flats/${flat.flatId}/statement`) })
  return (
    <Modal title={`Statement - ${flat.building}-${flat.flatNumber}`} onClose={onClose} wide>
      <p className="muted">{flat.ownerName}</p>
      {isLoading ? <Loading /> : error ? <ErrorState error={error} retry={() => refetch()} /> : data && (
        <>
          <h3>Receipts</h3>
          {data.receipts.length === 0 ? <EmptyState title="No receipts yet" /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Date</th><th>Fund</th><th>Month</th><th>Mode</th><th className="num">Amount</th>{canWrite && <th />}</tr></thead>
              <tbody>{data.receipts.map((r) => (
                <tr key={r.id} className={r.reversed ? 'struck' : ''}>
                  <td>{fmtDate(r.paidOn)}</td><td>{fundLabel[r.fund]}</td><td>{periodLabel(r.period)}</td><td>{modeLabel[r.mode]}</td><td className="num">{inr(r.amount)}</td>
                  {canWrite && <td className="num">{r.reversed ? <Pill tone="muted">Reversed</Pill> : <button className="btn sm" onClick={() => setRevId(r.id)}><Undo2 size={14} /> Reverse</button>}</td>}
                </tr>))}</tbody>
            </table></div>
          )}
          <h3>Charges</h3>
          {data.charges.length === 0 ? <EmptyState title="No charges generated yet" /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Month</th><th>Fund</th><th className="num">Amount</th></tr></thead>
              <tbody>{data.charges.map((c, i) => <tr key={i}><td>{periodLabel(c.period)}</td><td>{fundLabel[c.fund]}</td><td className="num">{inr(c.amount)}</td></tr>)}</tbody>
            </table></div>
          )}
        </>
      )}
      {revId && <ConfirmDialog title="Reverse this receipt?" message="The receipt stays in the history marked as reversed, the amount becomes due again, and a matching entry is posted to the cashbook." confirmLabel="Reverse receipt" danger
        onClose={() => setRevId(null)} onConfirm={async () => {
          try { await post(`/receipts/${revId}/reverse`); toast.ok('Receipt reversed'); await refresh('maintenance', 'ledger', 'dashboard', 'statement'); setRevId(null) }
          catch (e) { toast.err(e instanceof Error ? e.message : 'Failed'); setRevId(null) }
        }} />}
    </Modal>
  )
}

export default function Maintenance() {
  const { canWrite } = useAuth()
  const { key, label } = usePeriod()
  const [q, setQ] = useState('')
  const [b, setB] = useState('All')
  const [onlyDue, setOnlyDue] = useState(false)
  const [modal, setModal] = useState<'generate' | 'receipt' | null>(null)
  const [stmt, setStmt] = useState<FlatDues | null>(null)
  const [addParam, clearAdd] = useAddParam()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['maintenance', key], queryFn: () => api<FlatDues[]>(`/maintenance?period=${key}`) })

  const totals = useMemo(() => {
    let charged = 0, paid = 0
    for (const d of data ?? []) for (const f of FUNDS) { charged += d.funds[f].charged ?? 0; paid += d.funds[f].charged != null ? Math.min(d.funds[f].paid, d.funds[f].charged ?? 0) : 0 }
    return { charged, paid, due: charged - paid }
  }, [data])
  const buildings = useMemo(() => ['All', ...Array.from(new Set((data ?? []).map((d) => d.building)))], [data])
  const rows = useMemo(() => (data ?? []).filter((d) => (b === 'All' || d.building === b) && (!onlyDue || d.due > 0) &&
    (q === '' || `${d.building}-${d.flatNumber} ${d.ownerName}`.toLowerCase().includes(q.toLowerCase()))), [data, b, onlyDue, q])
  const noCharges = !!data && totals.charged === 0
  const showReceipt = modal === 'receipt' || (addParam === 'receipt' && canWrite && !!data)

  return (
    <>
      <PageHead title="Maintenance" sub={`Fund-wise dues for ${label}. M = Maintenance, S = Sinking, R = Repair.`}>
        <ExportButton module="receipts" file="receipts.csv" label="Export receipts" />
        {canWrite && <button className="btn" onClick={() => setModal('generate')}><Settings2 size={16} /> Generate charges</button>}
        {canWrite && <button className="btn primary" onClick={() => setModal('receipt')} disabled={noCharges}><Plus size={16} /> Record receipt</button>}
      </PageHead>

      <section className="grid kpis three">
        <div className="card kpi"><span>Charged</span><b>{inr(totals.charged)}</b></div>
        <div className="card kpi"><span>Collected</span><b>{inr(totals.paid)}</b></div>
        <div className="card kpi"><span>Outstanding</span><b>{inr(totals.due)}</b></div>
      </section>

      <div className="card">
        <div className="toolbar">
          <label className="search inline"><Search size={16} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search flat or owner" aria-label="Search flats" /></label>
          <div className="seg" role="group" aria-label="Building">{buildings.map((x) => <button key={x} className={b === x ? 'on' : ''} onClick={() => setB(x)}>{x === 'All' ? 'All' : x + ' Bldg'}</button>)}</div>
          <label className="check"><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Only with dues</label>
        </div>

        {isLoading ? <Loading /> : error ? <ErrorState error={error} retry={() => refetch()} /> : noCharges ? (
          <EmptyState title={`No charges for ${label} yet`} text="Set the monthly amounts once and every flat gets its charge." action={canWrite ? <button className="btn primary" onClick={() => setModal('generate')}>Generate charges</button> : undefined} />
        ) : rows.length === 0 ? <EmptyState title="No flats match" text="Try clearing the filters." /> : (
          <>
            <div className="table-wrap only-desktop-block"><table>
              <thead><tr><th>Flat</th><th>Owner</th><th>Funds</th><th className="num">Due</th></tr></thead>
              <tbody>{rows.map((d) => (
                <tr key={d.flatId} className="clickable" tabIndex={0} onClick={() => setStmt(d)} onKeyDown={(e) => e.key === 'Enter' && setStmt(d)}>
                  <td><b>{d.building}-{d.flatNumber}</b></td><td>{d.ownerName}</td><td><FundChips f={d} /></td><td className="num">{d.due ? inr(d.due) : <Pill tone="ok">Settled</Pill>}</td>
                </tr>))}</tbody>
            </table></div>
            <ul className="cards only-mobile-block">{rows.map((d) => (
              <li key={d.flatId} className="flat-card" onClick={() => setStmt(d)}>
                <div className="flat-top"><b>{d.building}-{d.flatNumber}</b><span className="num">{d.due ? inr(d.due) : 'Settled'}</span></div>
                <div className="muted">{d.ownerName}</div><FundChips f={d} />
              </li>))}</ul>
          </>
        )}
      </div>

      {modal === 'generate' && <GenerateModal period={key} onClose={() => setModal(null)} />}
      {showReceipt && data && <ReceiptModal period={key} dues={data} onClose={() => { setModal(null); clearAdd() }} />}
      {stmt && <StatementModal flat={stmt} onClose={() => setStmt(null)} />}
    </>
  )
}
