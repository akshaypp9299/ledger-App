import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, del, post, put } from '../api/client'
import type { Agreement } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ConfirmDialog, applyApiError, EmptyState, ErrorState, Field, FormActions, Loading, Modal, PageHead, Pill, useRefresh, useToast, ExportButton } from '../components/ui'
import { fmtDate, inr, whatsappLink } from '../lib/format'
import { useAddParam, useFlats } from '../lib/hooks'

interface Form { flatId: string; tenantName: string; tenantPhone: string; startDate: string; endDate: string; rent: string; deposit: string; notes: string }

const status = (d: number) => d < 0 ? { tone: 'bad' as const, text: `Expired ${-d} day${d === -1 ? '' : 's'} ago` } : d <= 30 ? { tone: 'bad' as const, text: `${d} day${d === 1 ? '' : 's'} left` } : d <= 90 ? { tone: 'warn' as const, text: `${d} days left` } : { tone: 'ok' as const, text: `${d} days left` }

function AgreementModal({ item, onClose }: { item?: Agreement; onClose: () => void }) {
  const { data: flats } = useFlats()
  const toast = useToast()
  const refresh = useRefresh()
  const { register, handleSubmit, setError, getValues, formState: { errors, isSubmitting } } = useForm<Form>({
    defaultValues: { flatId: item?.flatId ?? '', tenantName: item?.tenantName ?? '', tenantPhone: item?.tenantPhone ?? '', startDate: item?.startDate ?? '', endDate: item?.endDate ?? '',
      rent: item?.rent?.toString() ?? '', deposit: item?.deposit?.toString() ?? '', notes: item?.notes ?? '' } })
  return (
    <Modal title={item ? 'Edit agreement' : 'Add tenancy agreement'} onClose={onClose}>
      <form noValidate className="form-grid" onSubmit={handleSubmit(async (v) => {
        const body = { ...v, tenantPhone: v.tenantPhone || null, rent: v.rent ? Number(v.rent) : null, deposit: v.deposit ? Number(v.deposit) : null, notes: v.notes || null }
        try { if (item) await put(`/agreements/${item.id}`, body); else await post('/agreements', body); toast.ok('Agreement saved'); await refresh('agreements', 'flats', 'dashboard'); onClose() }
        catch (e) { applyApiError(e, setError, toast.err) }
      })}>
        <Field label="Flat" required error={errors.flatId?.message} span>
          <select {...register('flatId', { required: 'Choose a flat' })}><option value="">Select flat...</option>{flats?.map((f) => <option key={f.id} value={f.id}>{f.building}-{f.flatNumber} - {f.ownerName}</option>)}</select>
        </Field>
        <Field label="Tenant name" required error={errors.tenantName?.message}><input {...register('tenantName', { required: 'Enter the tenant name' })} /></Field>
        <Field label="Tenant phone" error={errors.tenantPhone?.message}><input type="tel" inputMode="tel" {...register('tenantPhone')} /></Field>
        <Field label="Start date" required error={errors.startDate?.message}><input type="date" {...register('startDate', { required: 'Choose the start date' })} /></Field>
        <Field label="End date" required error={errors.endDate?.message}>
          <input type="date" {...register('endDate', { required: 'Choose the end date', validate: (x) => !getValues('startDate') || x >= getValues('startDate') || 'Must be after the start date' })} />
        </Field>
        <Field label="Monthly rent (₹)"><input type="number" inputMode="decimal" {...register('rent')} /></Field>
        <Field label="Deposit (₹)"><input type="number" inputMode="decimal" {...register('deposit')} /></Field>
        <Field label="Notes" span><input {...register('notes')} /></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Save agreement" /></div>
      </form>
    </Modal>
  )
}

export default function Tenants() {
  const { canWrite, isAdmin } = useAuth()
  const toast = useToast()
  const refresh = useRefresh()
  const [edit, setEdit] = useState<Agreement | 'new' | null>(null)
  const [rm, setRm] = useState<Agreement | null>(null)
  const [addParam, clearAdd] = useAddParam()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['agreements'], queryFn: () => api<Agreement[]>('/agreements') })
  const soon = (data ?? []).filter((a) => a.daysLeft >= 0 && a.daysLeft <= 30).length
  const expired = (data ?? []).filter((a) => a.daysLeft < 0).length
  const remind = (a: Agreement) => whatsappLink(a.tenantPhone, `Dear ${a.tenantName}, this is a reminder from the society office: your rent agreement for flat ${a.building}-${a.flatNumber} ends on ${fmtDate(a.endDate)}. Please arrange the renewal and share the new agreement copy with the office.`)

  return (
    <>
      <PageHead title="Tenants & Agreements" sub="Rent agreements by flat, with an expiry countdown.">
        <ExportButton module="agreements" file="agreements.csv" label="Export" />
        {canWrite && <button className="btn primary" onClick={() => setEdit('new')}><Plus size={16} /> Add agreement</button>}
      </PageHead>
      {data && data.length > 0 && <section className="grid kpis three">
        <div className="card kpi"><span>Active tenancies</span><b>{data.length - expired}</b></div>
        <div className="card kpi tint-bad"><span>Expiring in 30 days</span><b>{soon}</b></div>
        <div className="card kpi tint-warn"><span>Expired</span><b>{expired}</b></div></section>}
      <div className="card">
        {isLoading ? <Loading /> : error ? <ErrorState error={error} retry={() => refetch()} /> : !data || data.length === 0 ? (
          <EmptyState title="No agreements yet" text="Add tenancy agreements to see who is expiring and remind them in one tap." action={canWrite ? <button className="btn primary" onClick={() => setEdit('new')}>Add agreement</button> : undefined} />
        ) : (
          <ul className="list">{data.map((a) => { const s = status(a.daysLeft); return (
            <li key={a.id} className="agr">
              <span className="grow"><b>{a.building}-{a.flatNumber} - {a.tenantName}</b>
                <small>{fmtDate(a.startDate)} to {fmtDate(a.endDate)}{a.rent != null ? ` - Rent ${inr(a.rent)}` : ''}</small></span>
              <Pill tone={s.tone}>{s.text}</Pill>
              <span className="row-actions">
                {a.tenantPhone && <a className="icon-btn" href={remind(a)} target="_blank" rel="noopener noreferrer" aria-label={`Send WhatsApp reminder to ${a.tenantName}`}><MessageCircle size={17} /></a>}
                {canWrite && <button className="icon-btn" onClick={() => setEdit(a)} aria-label="Edit"><Pencil size={16} /></button>}
                {isAdmin && <button className="icon-btn" onClick={() => setRm(a)} aria-label="Delete"><Trash2 size={16} /></button>}
              </span>
            </li>) })}</ul>
        )}
      </div>
      {(edit === 'new' || (addParam != null && canWrite)) && <AgreementModal onClose={() => { setEdit(null); clearAdd() }} />}
      {edit && edit !== 'new' && <AgreementModal item={edit} onClose={() => setEdit(null)} />}
      {rm && <ConfirmDialog title="Delete this agreement?" message={`${rm.tenantName} - ${rm.building}-${rm.flatNumber}. This cannot be undone (the deletion is recorded in the audit log).`} confirmLabel="Delete" danger onClose={() => setRm(null)}
        onConfirm={async () => { try { await del(`/agreements/${rm.id}`); toast.ok('Agreement deleted'); await refresh('agreements', 'dashboard') } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed') } setRm(null) }} />}
    </>
  )
}
