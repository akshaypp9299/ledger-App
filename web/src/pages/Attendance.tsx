import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { api, post, put } from '../api/client'
import type { Mark, Staff } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { usePeriod } from '../components/Shell'
import { applyApiError, EmptyState, ErrorState, Field, FormActions, Loading, Modal, PageHead, Pill, useRefresh, useToast, ExportButton } from '../components/ui'
import { fmtDate, todayIso } from '../lib/format'
import { useAddParam } from '../lib/hooks'

type Status = Mark['status']
const OPTS: { s: Status; label: string; cls: string }[] = [{ s: 'PRESENT', label: 'Present', cls: 'p' }, { s: 'ABSENT', label: 'Absent', cls: 'a' }, { s: 'LEAVE', label: 'Leave', cls: 'l' }]
const roleLabel = { SECURITY: 'Security', HOUSEKEEPING: 'Housekeeping', OTHER: 'Other' }

function StaffModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { name: '', role: 'SECURITY', shift: '', phone: '' } })
  return (
    <Modal title="Add staff member" onClose={onClose}>
      <form noValidate className="form-grid" onSubmit={handleSubmit(async (v) => {
        try { await post('/staff', { ...v, shift: v.shift || null, phone: v.phone || null }); toast.ok('Staff member added'); await refresh('staff'); onClose() }
        catch (e) { applyApiError(e, setError, toast.err) }
      })}>
        <Field label="Name" required error={errors.name?.message} span><input {...register('name', { required: 'Enter the name' })} /></Field>
        <Field label="Role"><select {...register('role')}><option value="SECURITY">Security</option><option value="HOUSEKEEPING">Housekeeping</option><option value="OTHER">Other</option></select></Field>
        <Field label="Shift"><input {...register('shift')} placeholder="Morning / Evening" /></Field>
        <Field label="Phone" span><input type="tel" inputMode="tel" {...register('phone')} /></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Add staff" /></div>
      </form>
    </Modal>
  )
}

export default function Attendance() {
  const { canWrite } = useAuth()
  const { key, label } = usePeriod()
  const toast = useToast()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [addParam, clearAdd] = useAddParam()
  const [day, setDay] = useState(todayIso())
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api<Staff[]>('/staff') })
  const marks = useQuery({ queryKey: ['attendance', key], queryFn: () => api<Mark[]>(`/attendance?month=${key}`) })

  // The marking day follows the selected month; default to today when it is inside it.
  const inMonth = day.startsWith(key)
  const markDay = inMonth ? day : `${key}-01`
  const [yy, mm] = key.split('-').map(Number)
  const lastOfMonth = `${key}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`
  const maxDay = lastOfMonth > todayIso() ? todayIso() : lastOfMonth

  const mark = useMutation({
    mutationFn: (v: { staffId: string; status: Status | 'CLEAR' }) => put('/attendance', { staffId: v.staffId, date: markDay, status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
    onError: (e: Error) => toast.err(e.message),
  })
  const byKey = useMemo(() => new Map((marks.data ?? []).map((m) => [`${m.staffId}|${m.date}`, m.status])), [marks.data])
  const summary = (id: string) => {
    const c = { PRESENT: 0, ABSENT: 0, LEAVE: 0 }
    for (const m of marks.data ?? []) if (m.staffId === id) c[m.status]++
    return c
  }
  const allPresent = async () => {
    for (const s of staff.data ?? []) if (!byKey.has(`${s.id}|${markDay}`)) await mark.mutateAsync({ staffId: s.id, status: 'PRESENT' })
    toast.ok('Everyone not yet marked is now Present')
  }
  const future = markDay > todayIso()

  return (
    <>
      <PageHead title="Staff Attendance" sub={`Daily register for ${label}.`}>
        <ExportButton module="attendance" file="attendance.csv" label="Export" />
        {canWrite && <button className="btn" onClick={() => setAdding(true)}><Plus size={16} /> Add staff</button>}
      </PageHead>

      <div className="card">
        <div className="toolbar">
          <label className="field inline-field"><span className="field-label">Marking for</span>
            <input type="date" value={markDay} min={`${key}-01`} max={maxDay} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </label>
          {canWrite && <button className="btn" onClick={allPresent} disabled={future || !staff.data?.length}>Mark all unmarked as Present</button>}
        </div>
        {future && <p className="form-error">You cannot mark attendance for a future date.</p>}
        {staff.isLoading || marks.isLoading ? <Loading /> : staff.error ? <ErrorState error={staff.error} retry={() => staff.refetch()} /> : !staff.data?.length ? (
          <EmptyState title="No staff added yet" text="Add guards and housekeeping staff to start marking attendance." action={canWrite ? <button className="btn primary" onClick={() => setAdding(true)}>Add staff</button> : undefined} />
        ) : (
          <ul className="list">{staff.data.map((s) => {
            const cur = byKey.get(`${s.id}|${markDay}`)
            return (
              <li key={s.id} className="att-row">
                <span className="grow"><b>{s.name}</b><small>{roleLabel[s.role]}{s.shift ? ` - ${s.shift}` : ''}</small></span>
                <div className="att-btns" role="group" aria-label={`Attendance for ${s.name} on ${fmtDate(markDay)}`}>
                  {OPTS.map((o) => (
                    <button key={o.s} className={'att ' + o.cls + (cur === o.s ? ' on' : '')} disabled={!canWrite || future} aria-pressed={cur === o.s}
                      onClick={() => mark.mutate({ staffId: s.id, status: cur === o.s ? 'CLEAR' : o.s })}>{o.label}</button>
                  ))}
                </div>
              </li>)})}</ul>
        )}
      </div>

      {!!staff.data?.length && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head"><h2>Monthly summary - {label}</h2></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Staff</th><th className="num">Present</th><th className="num">Absent</th><th className="num">Leave</th></tr></thead>
            <tbody>{staff.data.map((s) => { const c = summary(s.id); return <tr key={s.id}><td><b>{s.name}</b></td><td className="num"><Pill tone="ok">{c.PRESENT}</Pill></td><td className="num"><Pill tone={c.ABSENT ? 'bad' : 'muted'}>{c.ABSENT}</Pill></td><td className="num"><Pill tone={c.LEAVE ? 'warn' : 'muted'}>{c.LEAVE}</Pill></td></tr> })}</tbody>
          </table></div>
        </div>
      )}
      {(adding || (addParam != null && canWrite)) && <StaffModal onClose={() => { setAdding(false); clearAdd() }} />}
    </>
  )
}
