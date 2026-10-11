import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, Plus } from 'lucide-react'
import { api, download, post } from '../api/client'
import type { Doc } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { applyApiError, EmptyState, ErrorState, Field, FormActions, Loading, Modal, PageHead, Pill, useRefresh, useToast } from '../components/ui'
import { fileSize, fmtDate } from '../lib/format'
import { useAddParam, useFlats } from '../lib/hooks'

const CATEGORIES = ['Agreement', 'Receipt', 'Bank statement', 'Minutes', 'NOC', 'Invoice', 'Share certificate', 'Other']
const MAX = 10 * 1024 * 1024

function UploadModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { data: flats } = useFlats()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<{ title: string; category: string; flatId: string; file: FileList }>({ defaultValues: { title: '', category: 'Agreement', flatId: '' } })
  return (
    <Modal title="Upload document" onClose={onClose}>
      <form noValidate className="form-grid" onSubmit={handleSubmit(async (v) => {
        const fd = new FormData()
        fd.append('title', v.title); fd.append('category', v.category); if (v.flatId) fd.append('flatId', v.flatId); fd.append('file', v.file[0])
        try { await post('/documents', fd); toast.ok('Document uploaded'); await refresh('documents'); onClose() } catch (e) { applyApiError(e, setError, toast.err) }
      })}>
        <Field label="Title" required error={errors.title?.message} span><input {...register('title', { required: 'Enter a title' })} placeholder="e.g. Rent agreement - A-302" /></Field>
        <Field label="Category"><select {...register('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Flat (optional)"><select {...register('flatId')}><option value="">Society-wide</option>{flats?.map((f) => <option key={f.id} value={f.id}>{f.building}-{f.flatNumber}</option>)}</select></Field>
        <Field label="File" required error={errors.file?.message as string | undefined} span hint="PDF, image, Word or Excel. Max 10 MB.">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" {...register('file', {
            validate: (f) => (!f || f.length === 0) ? 'Choose a file' : f[0].size > MAX ? 'File is larger than 10 MB' : true })} />
        </Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Upload" /></div>
      </form>
    </Modal>
  )
}

export default function Documents() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [addParam, clearAdd] = useAddParam()
  const [cat, setCat] = useState('All')
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['documents'], queryFn: () => api<Doc[]>('/documents') })
  const rows = (data ?? []).filter((d) => cat === 'All' || d.category === cat)
  return (
    <>
      <PageHead title="Documents" sub="Agreements, receipts, minutes and statements - stored securely and linked to a flat.">
        {canWrite && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> Upload</button>}
      </PageHead>
      <div className="card">
        <div className="toolbar"><div className="seg scroll" role="group" aria-label="Category">{['All', ...CATEGORIES].map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div></div>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} retry={() => refetch()} /> : rows.length === 0 ? (
          <EmptyState title={data?.length ? 'Nothing in this category' : 'No documents yet'} text="Upload agreements and receipts so they are never lost." action={canWrite && !data?.length ? <button className="btn primary" onClick={() => setAdding(true)}>Upload document</button> : undefined} />
        ) : (
          <ul className="list">{rows.map((d) => (
            <li key={d.id} className="doc-row">
              <span className="doc-ic"><FileText size={18} /></span>
              <span className="grow"><b>{d.title}</b><small>{d.filename} - {fileSize(d.sizeBytes)} - {fmtDate(d.createdAt)}</small></span>
              <Pill tone="info">{d.category}</Pill>{d.flatLabel && <Pill tone="muted">{d.flatLabel}</Pill>}
              <button className="icon-btn" aria-label={`Download ${d.title}`} onClick={() => download(`/documents/${d.id}/file`, d.filename).catch((e) => toast.err(e.message))}><Download size={17} /></button>
            </li>))}</ul>
        )}
      </div>
      {(adding || (addParam != null && canWrite)) && <UploadModal onClose={() => { setAdding(false); clearAdd() }} />}
    </>
  )
}
