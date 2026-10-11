const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
export const inr = (n: number | null | undefined) => (n == null ? '-' : (n < 0 ? '-' : '') + '₹' + inrFmt.format(Math.abs(n)))

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '-'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const periodLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export const fundLabel: Record<string, string> = { MAINTENANCE: 'Maintenance', SINKING: 'Sinking fund', REPAIR: 'Repair fund' }
export const modeLabel: Record<string, string> = { CASH: 'Cash', CHEQUE: 'Cheque', UPI: 'UPI', BANK_TRANSFER: 'Bank transfer' }

export const fileSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

/** Opens WhatsApp with a pre-filled message. Free: no WhatsApp Business API needed. */
export const whatsappLink = (phone: string | null | undefined, text: string) => {
  const digits = (phone ?? '').replace(/\D/g, '')
  const num = digits.length === 10 ? '91' + digits : digits
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`
}
