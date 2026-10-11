import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Plus, Trash2 } from 'lucide-react'
import { api, del, post } from '../api/client'
import type { Notice } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ConfirmDialog, applyApiError, EmptyState, ErrorState, Field, FormActions, Loading, Modal, PageHead, Pill, useRefresh, useToast } from '../components/ui'
import { fmtDate, whatsappLink } from '../lib/format'
import { useAddParam } from '../lib/hooks'

const tone = { HIGH: 'bad', NORMAL: 'info', LOW: 'muted' } as const

function NoticeModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { register, handleSubmit, setError, watch, formState: { errors, isSubmitting } } = useForm({ defaultValues: { title: '', body: '', priority: 'NORMAL' } })
  const body = watch('body') ?? ''
  return (
    <Modal title="New notice" onClose={onClose}>
      <form noValidate className="form-grid" onSubmit={handleSubmit(async (v) => {
        try { await post('/notices', v); toast.ok('Notice published'); await refresh('notices'); onClose() } catch (e) { applyApiError(e, setError, toast.err) }
      })}>
        <Field label="Title" required error={errors.title?.message} span><input maxLength={200} {...register('title', { required: 'Enter a title' })} /></Field>
        <Field label="Message" required error={errors.body?.message} span hint={`${body.length}/4000`}><textarea rows={5} maxLength={4000} {...register('body', { required: 'Write the message' })} /></Field>
        <Field label="Priority"><select {...register('priority')}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option></select></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Publish notice" /></div>
      </form>
    </Modal>
  )
}

export default function Notices() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const refresh = useRefresh()
  const [adding, setAdding] = useState(false)
  const [rm, setRm] = useState<Notice | null>(null)
  const [addParam, clearAdd] = useAddParam()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['notices'], queryFn: () => api<Notice[]>('/notices') })
  return (
    <>
      <PageHead title="Notices" sub="Announcements for residents. Share any notice on WhatsApp in one tap.">
        {canWrite && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> New notice</button>}
      </PageHead>
      {isLoading ? <div className="card"><Loading /></div> : error ? <div className="card"><ErrorState error={error} retry={() => refetch()} /></div> : !data || data.length === 0 ? (
        <div className="card"><EmptyState title="No notices yet" text="Post meeting invitations, water-cut alerts and reminders." action={canWrite ? <button className="btn primary" onClick={() => setAdding(true)}>New notice</button> : undefined} /></div>
      ) : data.map((n) => (
        <article className="card notice" key={n.id}>
          <div className="notice-top"><h2>{n.title}</h2><Pill tone={tone[n.priority]}>{n.priority.toLowerCase()}</Pill></div>
          <p className="notice-body">{n.body}</p>
          <div className="notice-foot"><small>{fmtDate(n.createdAt)}</small>
            <span className="row-actions">
              <a className="btn sm" href={whatsappLink(null, `*${n.title}*\n\n${n.body}`)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Share on WhatsApp</a>
              {canWrite && <button className="icon-btn" onClick={() => setRm(n)} aria-label={`Delete ${n.title}`}><Trash2 size={16} /></button>}
            </span></div>
        </article>))}
      {(adding || (addParam != null && canWrite)) && <NoticeModal onClose={() => { setAdding(false); clearAdd() }} />}
      {rm && <ConfirmDialog title="Delete this notice?" message={rm.title} confirmLabel="Delete" danger onClose={() => setRm(null)}
        onConfirm={async () => { try { await del(`/notices/${rm.id}`); toast.ok('Notice deleted'); await refresh('notices') } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed') } setRm(null) }} />}
    </>
  )
}
