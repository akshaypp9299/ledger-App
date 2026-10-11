import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Plus, Phone } from 'lucide-react'
import { api, post, put } from '../api/client'
import type { PayMode, Vendor, VendorDetail } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { applyApiError, EmptyState, ErrorState, Field, FormActions, Loading, Modal, PageHead, Pill, useRefresh, useToast, ExportButton } from '../components/ui'
import { fmtDate, inr, modeLabel, todayIso } from '../lib/format'
import { useAddParam } from '../lib/hooks'

interface VendorForm { name: string; category: string; phone: string; email: string; gstNo: string; notes: string }

function VendorModal({ vendor, onClose }: { vendor?: Vendor; onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<VendorForm>({
    defaultValues: { name: vendor?.name ?? '', category: vendor?.category ?? '', phone: vendor?.phone ?? '', email: vendor?.email ?? '', gstNo: vendor?.gstNo ?? '', notes: vendor?.notes ?? '' } })
  return (
    <Modal title={vendor ? 'Edit vendor' : 'Add vendor'} onClose={onClose}>
      <form noValidate className="form-grid" onSubmit={handleSubmit(async (v) => {
        const body = { ...v, category: v.category || null, phone: v.phone || null, email: v.email || null, gstNo: v.gstNo || null, notes: v.notes || null }
        try { if (vendor) await put(`/vendors/${vendor.id}`, body); else await post('/vendors', body); toast.ok('Vendor saved'); await refresh('vendors', 'vendor'); onClose() }
        catch (e) { applyApiError(e, setError, toast.err) }
      })}>
        <Field label="Vendor name" required error={errors.name?.message} span><input {...register('name', { required: 'Enter the vendor name' })} /></Field>
        <Field label="Category" error={errors.category?.message}><input {...register('category')} placeholder="Lift, Housekeeping..." /></Field>
        <Field label="Phone" error={errors.phone?.message}><input type="tel" inputMode="tel" {...register('phone')} /></Field>
        <Field label="Email" error={errors.email?.message}><input type="email" {...register('email')} /></Field>
        <Field label="GST number" error={errors.gstNo?.message}><input {...register('gstNo')} /></Field>
        <Field label="Notes" span error={errors.notes?.message}><input {...register('notes')} /></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Save vendor" /></div>
      </form>
    </Modal>
  )
}

function InvoiceModal({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { invoiceNo: '', invoiceDate: todayIso(), dueDate: '', amount: '', description: '' } })
  return (
    <Modal title={`Add bill - ${vendor.name}`} onClose={onClose}>
      <form noValidate className="form-grid" onSubmit={handleSubmit(async (v) => {
        try {
          await post(`/vendors/${vendor.id}/invoices`, { invoiceNo: v.invoiceNo || null, invoiceDate: v.invoiceDate, dueDate: v.dueDate || null, amount: Number(v.amount), description: v.description || null })
          toast.ok('Bill added'); await refresh('vendors', 'vendor', 'dashboard'); onClose()
        } catch (e) { applyApiError(e, setError, toast.err) }
      })}>
        <Field label="Bill number" error={errors.invoiceNo?.message}><input {...register('invoiceNo')} /></Field>
        <Field label="Amount (₹)" required error={errors.amount?.message}><input type="number" step="0.01" inputMode="decimal" {...register('amount', { required: 'Enter the amount', validate: (x) => Number(x) > 0 || 'Must be greater than 0' })} /></Field>
        <Field label="Bill date" required error={errors.invoiceDate?.message}><input type="date" {...register('invoiceDate', { required: 'Choose a date' })} /></Field>
        <Field label="Due date"><input type="date" {...register('dueDate')} /></Field>
        <Field label="Description" span><input {...register('description')} /></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Add bill" /></div>
      </form>
    </Modal>
  )
}

function PaymentModal({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { register, watch, handleSubmit, setError, setValue, formState: { errors, isSubmitting } } =
    useForm<{ paidOn: string; amount: string; mode: PayMode; chequeNo: string; note: string }>({ defaultValues: { paidOn: todayIso(), amount: '', mode: 'CASH', chequeNo: '', note: '' } })
  const mode = watch('mode')
  return (
    <Modal title={`Pay ${vendor.name}`} onClose={onClose}>
      <form noValidate className="form-grid" onSubmit={handleSubmit(async (v) => {
        try {
          await post(`/vendors/${vendor.id}/payments`, { paidOn: v.paidOn, amount: Number(v.amount), mode: v.mode, chequeNo: v.mode === 'CHEQUE' ? v.chequeNo || null : null, note: v.note || null })
          toast.ok('Payment recorded in the cashbook'); await refresh('vendors', 'vendor', 'ledger', 'dashboard'); onClose()
        } catch (e) { applyApiError(e, setError, toast.err) }
      })}>
        <Field label="Amount (₹)" required error={errors.amount?.message} hint={vendor.outstanding > 0 ? `Outstanding: ${inr(vendor.outstanding)}` : undefined}>
          <input type="number" step="0.01" inputMode="decimal" {...register('amount', { required: 'Enter the amount', validate: (x) => Number(x) > 0 || 'Must be greater than 0' })} />
        </Field>
        <Field label="Date paid" required error={errors.paidOn?.message}><input type="date" {...register('paidOn', { required: 'Choose a date' })} /></Field>
        {vendor.outstanding > 0 && <button type="button" className="link-btn span" onClick={() => setValue('amount', String(vendor.outstanding))}>Pay full outstanding ({inr(vendor.outstanding)})</button>}
        <Field label="Mode"><select {...register('mode')}>{Object.entries(modeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {mode === 'CHEQUE' ? <Field label="Cheque number"><input {...register('chequeNo')} /></Field> : <span />}
        <Field label="Note" span><input {...register('note')} /></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Record payment" /></div>
      </form>
    </Modal>
  )
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { canWrite } = useAuth()
  const [sub, setSub] = useState<'bill' | 'pay' | 'edit' | null>(null)
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['vendor', id], queryFn: () => api<VendorDetail>(`/vendors/${id}`) })
  return (
    <Modal title={data?.vendor.name ?? 'Vendor'} onClose={onClose} wide>
      {isLoading ? <Loading /> : error ? <ErrorState error={error} retry={() => refetch()} /> : data && (
        <>
          <div className="grid kpis three">
            <div className="card kpi tint-info"><span>Billed</span><b>{inr(data.vendor.invoiced)}</b></div>
            <div className="card kpi tint-ok"><span>Paid</span><b>{inr(data.vendor.paid)}</b></div>
            <div className="card kpi tint-bad"><span>Outstanding</span><b>{inr(data.vendor.outstanding)}</b></div>
          </div>
          {canWrite && <div className="actions" style={{ margin: '4px 0 12px' }}>
            <button className="btn" onClick={() => setSub('bill')}>Add bill</button><button className="btn primary" onClick={() => setSub('pay')}>Record payment</button><button className="btn" onClick={() => setSub('edit')}>Edit details</button>
          </div>}
          <h3>Bills</h3>
          {data.invoices.length === 0 ? <EmptyState title="No bills recorded" /> : <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Bill no.</th><th>Due</th><th>Description</th><th className="num">Amount</th></tr></thead>
            <tbody>{data.invoices.map((i) => <tr key={i.id}><td>{fmtDate(i.invoiceDate)}</td><td>{i.invoiceNo ?? '-'}</td><td>{fmtDate(i.dueDate)}</td><td>{i.description ?? '-'}</td><td className="num">{inr(i.amount)}</td></tr>)}</tbody></table></div>}
          <h3>Payments</h3>
          {data.payments.length === 0 ? <EmptyState title="No payments yet" /> : <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Mode</th><th>Note</th><th className="num">Amount</th></tr></thead>
            <tbody>{data.payments.map((p) => <tr key={p.id} className={p.reversed ? 'struck' : ''}><td>{fmtDate(p.date)}</td><td>{p.mode ? modeLabel[p.mode] ?? p.mode : '-'}{p.chequeNo ? ` #${p.chequeNo}` : ''}</td><td>{p.description ?? '-'}</td>
              <td className="num">{p.type === 'CREDIT' ? '-' : ''}{inr(p.amount)}</td></tr>)}</tbody></table></div>}
          {sub === 'bill' && <InvoiceModal vendor={data.vendor} onClose={() => setSub(null)} />}
          {sub === 'pay' && <PaymentModal vendor={data.vendor} onClose={() => setSub(null)} />}
          {sub === 'edit' && <VendorModal vendor={data.vendor} onClose={() => setSub(null)} />}
        </>
      )}
    </Modal>
  )
}

export default function Vendors() {
  const { canWrite } = useAuth()
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [addParam, clearAdd] = useAddParam()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['vendors'], queryFn: () => api<Vendor[]>('/vendors') })
  const totalDue = (data ?? []).reduce((n, v) => n + Math.max(v.outstanding, 0), 0)
  return (
    <>
      <PageHead title="Vendors" sub="Who you pay, what you owe, and what you have paid.">
        <ExportButton module="vendors" file="vendors.csv" label="Export" />
        {canWrite && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> Add vendor</button>}
      </PageHead>
      {data && data.length > 0 && <section className="grid kpis three"><div className="card kpi"><span>Vendors</span><b>{data.length}</b></div><div className="card kpi tint-bad"><span>Total outstanding</span><b>{inr(totalDue)}</b></div></section>}
      <div className="card">
        {isLoading ? <Loading /> : error ? <ErrorState error={error} retry={() => refetch()} /> : !data || data.length === 0 ? (
          <EmptyState title="No vendors yet" text="Add the people and companies you pay regularly." action={canWrite ? <button className="btn primary" onClick={() => setAdding(true)}>Add vendor</button> : undefined} />
        ) : (
          <ul className="list">{data.map((v) => (
            <li key={v.id}><button className="row-link btn-reset" onClick={() => setOpen(v.id)}>
              <span className="grow"><b>{v.name}</b><small>{v.category ?? 'Uncategorised'}{v.phone ? ` - ${v.phone}` : ''}</small></span>
              {v.phone && <a href={`tel:${v.phone}`} className="icon-btn" onClick={(e) => e.stopPropagation()} aria-label={`Call ${v.name}`}><Phone size={16} /></a>}
              <span className="num">{v.outstanding > 0 ? <Pill tone="bad">{inr(v.outstanding)} due</Pill> : <Pill tone="ok">Settled</Pill>}</span>
            </button></li>))}</ul>
        )}
      </div>
      {(adding || (addParam != null && canWrite)) && <VendorModal onClose={() => { setAdding(false); clearAdd() }} />}
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
    </>
  )
}
