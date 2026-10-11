import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Download, Plus } from 'lucide-react'
import { api, download, patch, post } from '../api/client'
import type { AppUser, AuditEvent } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { applyApiError, EmptyState, ErrorState, Field, FormActions, Loading, Modal, PageHead, Pill, useRefresh, useToast, ExportButton } from '../components/ui'

const roleName = { ADMIN: 'Admin', MANAGER: 'Manager', VIEWER: 'Viewer' }
const roleHelp = { ADMIN: 'Everything, including users and deletes', MANAGER: 'Enter and edit records', VIEWER: 'Read-only' }

function UserModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { fullName: '', email: '', role: 'MANAGER', password: '' } })
  return (
    <Modal title="Add user" onClose={onClose}>
      <form noValidate className="form-grid" onSubmit={handleSubmit(async (v) => {
        try { await post('/users', v); toast.ok('User created. Share the password with them securely.'); await refresh('users'); onClose() } catch (e) { applyApiError(e, setError, toast.err) }
      })}>
        <Field label="Full name" required error={errors.fullName?.message}><input {...register('fullName', { required: 'Enter the name' })} /></Field>
        <Field label="Email" required error={errors.email?.message}><input type="email" autoComplete="off" {...register('email', { required: 'Enter an email', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} /></Field>
        <Field label="Role"><select {...register('role')}>{(Object.keys(roleName) as (keyof typeof roleName)[]).map((r) => <option key={r} value={r}>{roleName[r]} - {roleHelp[r]}</option>)}</select></Field>
        <Field label="Temporary password" required error={errors.password?.message} hint="At least 10 characters.">
          <input type="password" autoComplete="new-password" {...register('password', { required: 'Set a password', minLength: { value: 10, message: 'Use at least 10 characters' } })} />
        </Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel="Create user" /></div>
      </form>
    </Modal>
  )
}

export function Users() {
  const { isAdmin, user } = useAuth()
  const toast = useToast()
  const refresh = useRefresh()
  const [adding, setAdding] = useState(false)
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['users'], queryFn: () => api<AppUser[]>('/users'), enabled: isAdmin })
  if (!isAdmin) return <><PageHead title="Users & Roles" /><div className="card"><EmptyState title="Admins only" text="Ask your society administrator to manage users." /></div></>
  return (
    <>
      <PageHead title="Users & Roles" sub="Who can sign in and what they can do."><button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> Add user</button></PageHead>
      <div className="card">
        {isLoading ? <Loading /> : error ? <ErrorState error={error} retry={() => refetch()} /> : (
          <ul className="list">{data?.map((u) => (
            <li key={u.id} className="doc-row"><span className="avatar sm">{u.fullName[0]}</span>
              <span className="grow"><b>{u.fullName}{u.id === user?.id && ' (you)'}</b><small>{u.email}</small></span>
              <Pill tone={u.role === 'ADMIN' ? 'info' : u.role === 'MANAGER' ? 'ok' : 'muted'}>{roleName[u.role]}</Pill>
              {u.id !== user?.id && <button className="btn sm" onClick={async () => { try { await patch(`/users/${u.id}/active`, { active: !u.active }); await refresh('users') } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed') } }}>{u.active ? 'Deactivate' : 'Activate'}</button>}
              {!u.active && <Pill tone="bad">Inactive</Pill>}
            </li>))}</ul>)}
      </div>
      {adding && <UserModal onClose={() => setAdding(false)} />}
    </>
  )
}

export function Audit() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['audit'], queryFn: () => api<AuditEvent[]>('/audit?limit=200') })
  return (
    <>
      <PageHead title="Audit Log" sub="Every change: who did what, and when."><ExportButton module="audit" file="audit-log.csv" label="Export" /></PageHead>
      <div className="card">
        {isLoading ? <Loading /> : error ? <ErrorState error={error} retry={() => refetch()} /> : !data?.length ? <EmptyState title="No activity yet" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Detail</th></tr></thead>
            <tbody>{data.map((e) => <tr key={e.id}><td>{new Date(e.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{e.userName}</td><td><Pill tone="info">{e.action}</Pill></td><td>{e.entityType}</td><td>{e.detail ?? ''}</td></tr>)}</tbody>
          </table></div>)}
      </div>
    </>
  )
}

const EXPORTS = [
  ['flats', 'Flats & owners'], ['receipts', 'Maintenance receipts'], ['ledger', 'Cashbook (income & expenses)'], ['vendors', 'Vendors & balances'],
  ['agreements', 'Tenancy agreements'], ['attendance', 'Staff attendance'], ['audit', 'Audit log'],
]

export function Exports() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  if (!canWrite) return <><PageHead title="Data Export" /><div className="card"><EmptyState title="Not available" text="Exports are for admins and managers." /></div></>
  return (
    <>
      <PageHead title="Data Export" sub="Your data is yours. Download any register as a spreadsheet file that opens in Excel." />
      <div className="card"><ul className="list">{EXPORTS.map(([k, label]) => (
        <li key={k} className="doc-row"><span className="grow"><b>{label}</b><small>CSV - opens in Excel</small></span>
          <button className="btn" disabled={busy === k} onClick={async () => { setBusy(k); try { await download(`/export/${k}.csv`, `shivranjan-${k}.csv`) } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed') } setBusy(null) }}><Download size={16} /> {busy === k ? 'Preparing...' : 'Download'}</button></li>))}</ul></div>
    </>
  )
}
