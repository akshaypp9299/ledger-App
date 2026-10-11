import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Phone, Plus, Trash2 } from 'lucide-react'
import { api, del, post } from '../api/client'
import type { Contact } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ConfirmDialog, applyApiError, EmptyState, ErrorState, Field, FormActions, Loading, Modal, PageHead, useRefresh, useToast } from '../components/ui'

const NATIONAL = [
  { name: 'Police', phone: '112', note: 'Universal emergency number' }, { name: 'Ambulance', phone: '108', note: 'Medical emergency' },
  { name: 'Fire brigade', phone: '101', note: 'Fire & rescue' }, { name: 'Women helpline', phone: '181', note: 'Women safety' }, { name: 'Child helpline', phone: '1098', note: 'Children in distress' },
]

function ContactModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { name: '', role: '', phone: '', note: '' } })
  return (
    <Modal title="Add contact" onClose={onClose}>
      <form noValidate className="form-grid" onSubmit={handleSubmit(async (v) => {
        try { await post('/emergency-contacts', { ...v, role: v.role || null, note: v.note || null }); toast.ok('Contact added'); await refresh('contacts'); onClose() } catch (e) { applyApiError(e, setError, toast.err) }
      })}>
        <Field label="Name" required error={errors.name?.message}><input {...register('name', { required: 'Enter the name' })} /></Field>
        <Field label="Role"><input {...register('role')} placeholder="Plumber, Electrician..." /></Field>
        <Field label="Phone" required error={errors.phone?.message} span><input type="tel" inputMode="tel" {...register('phone', { required: 'Enter the phone number' })} /></Field>
        <Field label="Note" span><input {...register('note')} /></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Add contact" /></div>
      </form>
    </Modal>
  )
}

const CallCard = ({ name, phone, note, onDelete }: { name: string; phone: string; note?: string | null; onDelete?: () => void }) => (
  <div className="call-card">
    <div className="grow"><b>{name}</b><small>{note ?? ''}</small></div>
    <a className="btn primary" href={`tel:${phone}`}><Phone size={16} /> {phone}</a>
    {onDelete && <button className="icon-btn" onClick={onDelete} aria-label={`Delete ${name}`}><Trash2 size={16} /></button>}
  </div>
)

export default function Emergency() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const refresh = useRefresh()
  const [adding, setAdding] = useState(false)
  const [rm, setRm] = useState<Contact | null>(null)
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['contacts'], queryFn: () => api<Contact[]>('/emergency-contacts') })
  return (
    <>
      <PageHead title="Emergency Contacts" sub="One tap to call. Keep this list up to date.">{canWrite && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> Add contact</button>}</PageHead>
      <div className="card"><div className="card-head"><h2>National emergency numbers</h2></div><div className="call-grid">{NATIONAL.map((n) => <CallCard key={n.phone} {...n} />)}</div></div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><h2>Society contacts</h2></div>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} retry={() => refetch()} /> : !data?.length ? <EmptyState title="No society contacts yet" text="Add the gate, manager, plumber, electrician and committee." /> :
          <div className="call-grid">{data.map((c) => <CallCard key={c.id} name={c.name} phone={c.phone} note={c.role ?? c.note} onDelete={canWrite ? () => setRm(c) : undefined} />)}</div>}
      </div>
      {adding && <ContactModal onClose={() => setAdding(false)} />}
      {rm && <ConfirmDialog title="Delete contact?" message={rm.name} confirmLabel="Delete" danger onClose={() => setRm(null)}
        onConfirm={async () => { try { await del(`/emergency-contacts/${rm.id}`); toast.ok('Contact deleted'); await refresh('contacts') } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed') } setRm(null) }} />}
    </>
  )
}
