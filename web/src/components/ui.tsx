import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { FieldValues, UseFormSetError, Path } from 'react-hook-form'
import { CheckCircle2, AlertCircle, X, Loader2, Download } from 'lucide-react'
import { ApiError, download } from '../api/client'
import { useAuth } from '../auth/AuthContext'

/* ---------- Toasts ---------- */
interface ToastItem { id: number; kind: 'ok' | 'err'; text: string }
const ToastCtx = createContext<{ ok: (t: string) => void; err: (t: string) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((kind: 'ok' | 'err', text: string) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, kind, text }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'err' ? 6000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={{ ok: (t) => push('ok', t), err: (t) => push('err', t) }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={'toast ' + t.kind}>
            {t.kind === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export function useToast() {
  const c = useContext(ToastCtx)
  if (!c) throw new Error('useToast outside ToastProvider')
  return c
}

/* ---------- Modal (centered on desktop, bottom sheet on mobile) ---------- */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button.primary')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus() }
  }, [onClose])
  return (
    <div className="overlay modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void> | void; onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{message}</p>
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={'btn ' + (danger ? 'danger' : 'primary')} disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>{busy ? 'Working...' : confirmLabel}</button>
      </div>
    </Modal>
  )
}

/* ---------- Form pieces ---------- */
export function Field({ label, error, hint, required, children, span }: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; span?: boolean }) {
  return (
    <label className={'field' + (span ? ' span' : '') + (error ? ' has-error' : '')}>
      <span className="field-label">{label}{required && <i aria-hidden> *</i>}</span>
      {children}
      {error ? <small className="field-error" role="alert">{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  )
}

export function FormActions({ onCancel, pending, submitLabel }: { onCancel: () => void; pending: boolean; submitLabel: string }) {
  return (
    <div className="form-actions">
      <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      <button type="submit" className="btn primary" disabled={pending}>{pending ? <><Loader2 size={16} className="spin" /> Saving...</> : submitLabel}</button>
    </div>
  )
}

/** Maps a server error onto form fields where possible, otherwise shows a toast. */
export function applyApiError<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>, toastErr: (m: string) => void) {
  if (e instanceof ApiError) {
    const entries = Object.entries(e.fields)
    if (entries.length) { entries.forEach(([k, m]) => setError(k as Path<T>, { message: m })); return }
    toastErr(e.message)
    return
  }
  toastErr('Something went wrong. Please try again.')
}

/** Runs a mutation, then refreshes the listed query keys. */
export function useRefresh() {
  const qc = useQueryClient()
  return useCallback((...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] }))), [qc])
}

/* ---------- Small display pieces ---------- */
export function Loading({ label = 'Loading...' }: { label?: string }) {
  return <div className="empty"><Loader2 className="spin muted" /><span className="muted">{label}</span></div>
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="empty">
      <AlertCircle className="muted" />
      <b>Could not load this</b>
      <p className="muted">{error instanceof ApiError ? error.message : 'Please try again.'}</p>
      {retry && <button className="btn" onClick={retry}>Try again</button>}
    </div>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{text && <p className="muted">{text}</p>}{action}</div>
}

export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info' | 'muted'; children: ReactNode }) {
  return <span className={'pill t-' + tone}>{children}</span>
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      {children && <div className="actions">{children}</div>}
    </div>
  )
}

/** CSV export. Only admins and managers can export, so viewers never see the button. */
export function ExportButton({ module, file, label = 'Export' }: { module: string; file: string; label?: string }) {
  const { canWrite } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  if (!canWrite) return null
  return (
    <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await download(`/export/${module}.csv`, file) } catch (e) { toast.err(e instanceof Error ? e.message : 'Export failed') } setBusy(false) }}>
      <Download size={16} /> {busy ? 'Preparing...' : label}
    </button>
  )
}
