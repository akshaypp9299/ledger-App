import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Pencil, Plus, Search } from 'lucide-react'
import { post, put } from '../api/client'
import type { Flat } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { applyApiError, EmptyState, ErrorState, Field, FormActions, Loading, Modal, PageHead, Pill, useRefresh, useToast, ExportButton } from '../components/ui'
import { useAddParam, useBuildings, useFlats } from '../lib/hooks'

interface FlatForm { buildingId: string; flatNumber: string; floorNo: string; areaSqft: string; occupancy: string; ownerName: string; ownerPhone: string; ownerEmail: string }

function FlatModal({ flat, onClose }: { flat?: Flat; onClose: () => void }) {
  const { data: buildings } = useBuildings()
  const toast = useToast()
  const refresh = useRefresh()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FlatForm>({
    defaultValues: {
      buildingId: flat?.buildingId ?? '', flatNumber: flat?.flatNumber ?? '', floorNo: flat?.floorNo?.toString() ?? '', areaSqft: flat?.areaSqft?.toString() ?? '',
      occupancy: flat?.occupancy ?? 'OWNER', ownerName: flat?.ownerName ?? '', ownerPhone: flat?.ownerPhone ?? '', ownerEmail: flat?.ownerEmail ?? '',
    },
  })
  const onSubmit = handleSubmit(async (v) => {
    const body = { ...v, floorNo: v.floorNo ? Number(v.floorNo) : null, areaSqft: v.areaSqft ? Number(v.areaSqft) : null, ownerPhone: v.ownerPhone || null, ownerEmail: v.ownerEmail || null }
    try {
      if (flat) await put(`/flats/${flat.id}`, body); else await post('/flats', body)
      toast.ok(flat ? 'Flat updated' : 'Flat added')
      await refresh('flats', 'maintenance', 'dashboard')
      onClose()
    } catch (e) { applyApiError(e, setError, toast.err) }
  })
  return (
    <Modal title={flat ? `Edit flat ${flat.building}-${flat.flatNumber}` : 'Add flat'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="form-grid">
        <Field label="Building" required error={errors.buildingId?.message}>
          <select {...register('buildingId', { required: 'Choose a building' })}><option value="">Select...</option>{buildings?.map((b) => <option key={b.id} value={b.id}>{b.name} Building</option>)}</select>
        </Field>
        <Field label="Flat number" required error={errors.flatNumber?.message}><input {...register('flatNumber', { required: 'Enter the flat number' })} placeholder="e.g. 302" /></Field>
        <Field label="Floor" error={errors.floorNo?.message}><input type="number" inputMode="numeric" {...register('floorNo')} /></Field>
        <Field label="Area (sq ft)" error={errors.areaSqft?.message}><input type="number" step="0.01" inputMode="decimal" {...register('areaSqft')} /></Field>
        <Field label="Occupancy" error={errors.occupancy?.message}>
          <select {...register('occupancy')}><option value="OWNER">Owner-occupied</option><option value="TENANT">Tenant</option><option value="VACANT">Vacant</option></select>
        </Field>
        <Field label="Owner name" required error={errors.ownerName?.message}><input {...register('ownerName', { required: 'Enter the owner name' })} /></Field>
        <Field label="Owner phone" error={errors.ownerPhone?.message}><input type="tel" inputMode="tel" {...register('ownerPhone')} /></Field>
        <Field label="Owner email" error={errors.ownerEmail?.message}><input type="email" {...register('ownerEmail')} /></Field>
        <div className="span"><FormActions onCancel={onClose} pending={isSubmitting} submitLabel={flat ? 'Save changes' : 'Add flat'} /></div>
      </form>
    </Modal>
  )
}

export default function Flats() {
  const { canWrite } = useAuth()
  const flats = useFlats()
  const [q, setQ] = useState('')
  const [b, setB] = useState('All')
  const [editing, setEditing] = useState<Flat | 'new' | null>(null)
  const [addParam, clearAdd] = useAddParam()

  const buildings = useMemo(() => ['All', ...Array.from(new Set((flats.data ?? []).map((f) => f.building)))], [flats.data])
  const rows = useMemo(() => (flats.data ?? []).filter((f) =>
    (b === 'All' || f.building === b) && (q === '' || `${f.building}-${f.flatNumber} ${f.ownerName}`.toLowerCase().includes(q.toLowerCase()))), [flats.data, q, b])

  const showAdd = editing === 'new' || (addParam != null && canWrite)
  return (
    <>
      <PageHead title="Flats" sub="All flats, owners and occupancy.">
        <ExportButton module="flats" file="flats.csv" label="Export" />
        {canWrite && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Add flat</button>}
      </PageHead>

      <div className="card">
        <div className="toolbar">
          <label className="search inline"><Search size={16} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search flat or owner" aria-label="Search flats" /></label>
          <div className="seg" role="group" aria-label="Building">
            {buildings.map((x) => <button key={x} className={b === x ? 'on' : ''} onClick={() => setB(x)}>{x === 'All' ? 'All' : x + ' Bldg'}</button>)}
          </div>
        </div>

        {flats.isLoading ? <Loading /> : flats.error ? <ErrorState error={flats.error} retry={() => flats.refetch()} /> : rows.length === 0 ? (
          <EmptyState title="No flats match" text="Try clearing the search or filters." action={<button className="btn" onClick={() => { setQ(''); setB('All') }}>Clear filters</button>} />
        ) : (
          <>
            <div className="table-wrap only-desktop-block">
              <table>
                <thead><tr><th>Flat</th><th>Owner</th><th>Phone</th><th>Occupancy</th><th>Floor</th>{canWrite && <th />}</tr></thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.id}>
                      <td><b>{f.building}-{f.flatNumber}</b></td><td>{f.ownerName}</td><td>{f.ownerPhone ?? '-'}</td>
                      <td><Pill tone={f.occupancy === 'TENANT' ? 'info' : f.occupancy === 'VACANT' ? 'muted' : 'ok'}>{f.occupancy === 'OWNER' ? 'Owner' : f.occupancy === 'TENANT' ? 'Tenant' : 'Vacant'}</Pill></td>
                      <td>{f.floorNo ?? '-'}</td>
                      {canWrite && <td className="num"><button className="icon-btn" onClick={() => setEditing(f)} aria-label={`Edit ${f.building}-${f.flatNumber}`}><Pencil size={16} /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="cards only-mobile-block">
              {rows.map((f) => (
                <li key={f.id} className="flat-card">
                  <div className="flat-top"><b>{f.building}-{f.flatNumber}</b><Pill tone={f.occupancy === 'TENANT' ? 'info' : f.occupancy === 'VACANT' ? 'muted' : 'ok'}>{f.occupancy.toLowerCase()}</Pill></div>
                  <div>{f.ownerName}</div><small>{f.ownerPhone ?? 'No phone'}</small>
                  {canWrite && <button className="btn" onClick={() => setEditing(f)}><Pencil size={14} /> Edit</button>}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="table-foot muted">{rows.length} of {flats.data?.length ?? 0} flats</div>
      </div>

      {showAdd && <FlatModal onClose={() => { setEditing(null); clearAdd() }} />}
      {editing && editing !== 'new' && <FlatModal flat={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
