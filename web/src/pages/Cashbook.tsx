import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Plus, Undo2 } from 'lucide-react'
import { api, post, put } from '../api/client'
import type { LedgerEntry, LedgerMonth, PayMode, Vendor } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ConfirmDialog, applyApiError, EmptyState, ErrorState, Field, FormActions, Loading, Modal, PageHead, Pill, useRefresh, useToast, ExportButton } from '../components/ui'
import { usePeriod } from '../components/Shell'
import { fmtDate, inr, modeLabel, periodLabel, todayIso } from '../lib/format'
import { useAddParam } from '../lib/hooks'

interface EntryForm { type: 'CREDIT' | 'DEBIT'; entryDate: string; category: string; amount: string; mode: PayMode; chequeNo: string; vendorId: string; description: string }

function EntryModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api<string[]>('/ledger/categories'), staleTime: Infinity })
  const { data: vendors } = useQuery({ queryKey: ['vendors'], queryFn: () => api<Vendor[]>('/vendors') })
  const { register, control, handleSubmit, setError, setValue, formState: { errors, isSubmitting } } =
    useForm<EntryForm>({ defaultValues: { type: 'DEBIT', entryDate: todayIso(), category: '', amount: '', mode: 'CASH', chequeNo: '', vendorId: '', description: '' } })
  const [type, mode] = useWatch({ control, name: ['type', 'mode'] })
  const onSubmit = handleSubmit(async (v) => {
    try {
      await post('/ledger', { type: v.type, entryDate: v.entryDate, category: v.category, amount: Number(v.amount), mode: v.mode,
        chequeNo: v.mode === 'CHEQUE' ? v.chequeNo || null : null, vendorId: v.vendorId || null, description: v.description || null })
      toast.ok('Entry added to the cashbook')
      await refresh('ledger', 'vendors', 'vendor', 'dashboard')
      onClose()
    } catch (e) { applyApiError(e, setError, toast.err) }
  })
  return (
    <Modal title="Add cashbook entry" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="form-grid">
        <div className="span seg big" role="group" aria-label="Entry type">
          <button type="button" className={type === 'DEBIT' ? 'on' : ''} onClick={() => setValue('type', 'DEBIT')}>Expense (money out)</button>
          <button type="button" className={type === 'CREDIT' ? 'on' : ''} onClick={() => setValue('type', 'CREDIT')}>Income (money in)</button>
        </div>
        <Field label="Date" required error={errors.entryDate?.message}><input type="date" {...register('entryDate', { required: 'Choose a date' })} /></Field>
        <Field label="Amount (₹)" required error={errors.amount?.message}>
          <input type="number" inputMode="decimal" step="0.01" {...register('amount', { required: 'Enter the amount', validate: (x) => Number(x) > 0 || 'Must be greater than 0' })} />
        </Field>
        <Field label="Category" required error={errors.category?.message} span>
          <input list="cats" {...register('category', { required: 'Enter or pick a category' })} placeholder="e.g. Stationery & office" />
          <datalist id="cats">{categories?.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Mode"><select {...register('mode')}>{Object.entries(modeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {mode === 'CHEQUE' ? <Field label="Cheque number" error={errors.chequeNo?.message}><input {...register('chequeNo')} /></Field> : <span />}
        {type === 'DEBIT' && (
          <Field label="Vendor (optional)" span hint="Linking a vendor updates their outstanding balance.">
            <select {...register('vendorId')}><option value="">No vendor</option>{vendors?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          </Field>
        )}
        <Field label="Description" span><input {...register('description')} placeholder="What was this for?" /></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Add entry" /></div>
      </form>
    </Modal>
  )
}

function OpeningModal({ current, onClose }: { current: number; onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { openingBalance: String(current) } })
  return (
    <Modal title="Opening balance" onClose={onClose}>
      <form noValidate className="form-grid" onSubmit={handleSubmit(async (v) => {
        try { await put('/society/opening-balance', { openingBalance: Number(v.openingBalance) }); toast.ok('Opening balance updated'); await refresh('ledger', 'dashboard'); onClose() }
        catch (e) { applyApiError(e, setError, toast.err) }
      })}>
        <p className="muted span">The cash in hand before the first entry in this system. All later balances are calculated from it.</p>
        <Field label="Amount (₹)" required error={errors.openingBalance?.message} span><input type="number" step="0.01" {...register('openingBalance', { required: 'Enter an amount' })} /></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Save" /></div>
      </form>
    </Modal>
  )
}

export default function Cashbook() {
  const { canWrite, isAdmin } = useAuth()
  const { key, label } = usePeriod()
  const toast = useToast()
  const refresh = useRefresh()
  const [modal, setModal] = useState<'entry' | 'opening' | null>(null)
  const [rev, setRev] = useState<LedgerEntry | null>(null)
  const [addParam, clearAdd] = useAddParam()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['ledger', key], queryFn: () => api<LedgerMonth>(`/ledger?month=${key}`) })

  return (
    <>
      <PageHead title="Income & Expenses" sub={`Cashbook for ${label}. Entries are never edited - mistakes are fixed with a reversal.`}>
        <ExportButton module="ledger" file="cashbook.csv" label="Export" />
        {isAdmin && <button className="btn" onClick={() => setModal('opening')}>Opening balance</button>}
        {canWrite && <button className="btn primary" onClick={() => setModal('entry')}><Plus size={16} /> Add entry</button>}
      </PageHead>

      {data && (
        <section className="grid kpis">
          <div className="card kpi"><span>Opening balance</span><b>{inr(data.openingBalance)}</b></div>
          <div className="card kpi tint-ok"><span>Money in</span><b>{inr(data.credits)}</b></div>
          <div className="card kpi tint-bad"><span>Money out</span><b>{inr(data.debits)}</b></div>
          <div className="card kpi tint-info"><span>Closing balance</span><b>{inr(data.closingBalance)}</b><small>Opening + in - out</small></div>
        </section>
      )}

      <div className="card">
        {isLoading ? <Loading /> : error ? <ErrorState error={error} retry={() => refetch()} /> : !data || data.entries.length === 0 ? (
          <EmptyState title={`No entries in ${periodLabel(key)}`} text="Receipts from flats appear here automatically. Add expenses and other income below."
            action={canWrite ? <button className="btn primary" onClick={() => setModal('entry')}>Add entry</button> : undefined} />
        ) : (
          <>
            <div className="table-wrap only-desktop-block"><table>
              <thead><tr><th>Date</th><th>Category</th><th>Details</th><th>Mode</th><th className="num">In</th><th className="num">Out</th>{canWrite && <th />}</tr></thead>
              <tbody>{data.entries.map((e) => (
                <tr key={e.id} className={e.reversed || e.reversal ? 'struck' : ''}>
                  <td>{fmtDate(e.entryDate)}</td><td><b>{e.category}</b>{e.vendorName && <small>{e.vendorName}</small>}</td>
                  <td>{e.description ?? '-'}{e.chequeNo && <small>Cheque {e.chequeNo}</small>}</td><td>{e.mode ? modeLabel[e.mode] : '-'}</td>
                  <td className="num">{e.type === 'CREDIT' ? inr(e.amount) : ''}</td><td className="num">{e.type === 'DEBIT' ? inr(e.amount) : ''}</td>
                  {canWrite && <td className="num">{e.reversed ? <Pill tone="muted">Reversed</Pill> : e.reversal ? <Pill tone="muted">Reversal</Pill> : e.receiptLinked ? <small>via receipt</small> :
                    <button className="btn sm" onClick={() => setRev(e)}><Undo2 size={14} /> Reverse</button>}</td>}
                </tr>))}</tbody>
            </table></div>
            <ul className="cards only-mobile-block">{data.entries.map((e) => (
              <li key={e.id} className={'flat-card' + (e.reversed || e.reversal ? ' struck' : '')}>
                <div className="flat-top"><b>{e.category}</b><span className={'num ' + (e.type === 'CREDIT' ? 'pos' : 'neg')}>{e.type === 'CREDIT' ? '+' : '-'}{inr(e.amount)}</span></div>
                <div className="muted">{fmtDate(e.entryDate)} - {e.mode ? modeLabel[e.mode] : ''}{e.chequeNo ? ` #${e.chequeNo}` : ''}</div>
                {e.description && <div>{e.description}</div>}
                {canWrite && !e.reversed && !e.reversal && !e.receiptLinked && <button className="btn sm" onClick={() => setRev(e)}><Undo2 size={14} /> Reverse</button>}
                {(e.reversed || e.reversal) && <Pill tone="muted">{e.reversed ? 'Reversed' : 'Reversal'}</Pill>}
              </li>))}</ul>
          </>
        )}
      </div>

      {(modal === 'entry' || (addParam === 'entry' && canWrite)) && <EntryModal onClose={() => { setModal(null); clearAdd() }} />}
      {modal === 'opening' && <OpeningModal current={data?.openingBalance ?? 0} onClose={() => setModal(null)} />}
      {rev && <ConfirmDialog title="Reverse this entry?" message={`${rev.category} - ${inr(rev.amount)}. The original stays in the book; a matching opposite entry is posted so the balance corrects itself.`} confirmLabel="Reverse entry" danger
        onClose={() => setRev(null)} onConfirm={async () => {
          try { await post(`/ledger/${rev.id}/reverse`, {}); toast.ok('Entry reversed'); await refresh('ledger', 'vendors', 'vendor', 'dashboard') }
          catch (e) { toast.err(e instanceof Error ? e.message : 'Failed') }
          setRev(null)
        }} />}
    </>
  )
}
