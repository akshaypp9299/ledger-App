import {
  LayoutDashboard, Building2, Users, Wallet, Receipt, Store, CalendarCheck,
  Phone, FileText, Megaphone, ShieldCheck, ScrollText, Download, ScanLine,
  Landmark, MessageCircle, Droplets, Wrench, ParkingSquare, Home, Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  locked?: boolean
  minRole?: 'MANAGER' | 'ADMIN' // hidden for lower roles
}
export interface NavGroup {
  title: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  { title: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    title: 'Flats & People',
    items: [
      { to: '/flats', label: 'Flats', icon: Building2 },
      { to: '/tenants', label: 'Tenants & Agreements', icon: Users },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/maintenance', label: 'Maintenance', icon: Wallet },
      { to: '/cashbook', label: 'Income & Expenses', icon: Receipt },
      { to: '/vendors', label: 'Vendors', icon: Store },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/attendance', label: 'Staff Attendance', icon: CalendarCheck },
      { to: '/emergency', label: 'Emergency Contacts', icon: Phone },
    ],
  },
  {
    title: 'Records',
    items: [
      { to: '/documents', label: 'Documents', icon: FileText },
      { to: '/notices', label: 'Notices', icon: Megaphone },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/users', label: 'Users & Roles', icon: ShieldCheck, minRole: 'ADMIN' },
      { to: '/audit', label: 'Audit Log', icon: ScrollText, minRole: 'MANAGER' },
      { to: '/exports', label: 'Data Export', icon: Download, minRole: 'MANAGER' },
    ],
  },
  {
    title: 'Upgrade',
    items: [
      { to: '/locked/ocr', label: 'Receipt OCR', icon: ScanLine, locked: true },
      { to: '/locked/reconciliation', label: 'Bank Reconciliation', icon: Landmark, locked: true },
      { to: '/locked/whatsapp', label: 'WhatsApp Reminders', icon: MessageCircle, locked: true },
      { to: '/locked/water', label: 'Water & Tanker', icon: Droplets, locked: true },
      { to: '/locked/assets', label: 'Lift & Generator', icon: Wrench, locked: true },
      { to: '/locked/parking', label: 'Parking Allotment', icon: ParkingSquare, locked: true },
      { to: '/locked/portal', label: 'Resident Portal', icon: Home, locked: true },
      { to: '/locked/ai', label: 'AI Assistant', icon: Sparkles, locked: true },
    ],
  },
]

export const bottomTabs: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/flats', label: 'Flats', icon: Building2 },
  { to: '/maintenance', label: 'Money', icon: Wallet },
  { to: '/notices', label: 'Notices', icon: Megaphone },
]

export const lockedModules: Record<string, { title: string; pitch: string; bullets: string[]; icon: LucideIcon }> = {
  ocr: {
    title: 'Receipt & Statement OCR',
    icon: ScanLine,
    pitch: 'Snap a receipt and the entry fills itself. You review and confirm - nothing posts automatically.',
    bullets: ['Photo to ledger entry in seconds', 'Original receipt stored beside the entry', 'Bank statement import (CSV, Excel, PDF)'],
  },
  reconciliation: {
    title: 'Bank Reconciliation',
    icon: Landmark,
    pitch: 'Match bank transactions against your ledger and see exactly what does not add up.',
    bullets: ['Suggested matches by amount, date and reference', 'Unmatched and duplicate report', 'Month-end close with locked period'],
  },
  whatsapp: {
    title: 'Automated WhatsApp Reminders',
    icon: MessageCircle,
    pitch: 'Dues, agreement expiry and meeting invites go out on schedule, with delivery tracking.',
    bullets: ['Scheduled and one-tap triggers', 'Recipient and message preview', 'Delivery history per flat'],
  },
  water: {
    title: 'Water & Tanker Register',
    icon: Droplets,
    pitch: 'Daily tanker log with vendor, volume and cost, plus building-wise bill split.',
    bullets: ['Quick daily entry', 'Vendor ledger link', 'Monthly building-wise bill'],
  },
  assets: {
    title: 'Lift & Generator Servicing',
    icon: Wrench,
    pitch: 'Every asset, every service visit, and a reminder before the next one is due.',
    bullets: ['Per-building lift register', 'Generator run and service history', 'Overdue visit alerts'],
  },
  parking: {
    title: 'Parking Allotment',
    icon: ParkingSquare,
    pitch: 'Flat-wise parking roster with slot map and downloadable layouts.',
    bullets: ['Open and covered slots', 'Search by flat or slot', 'Printable layout'],
  },
  portal: {
    title: 'Resident Portal',
    icon: Home,
    pitch: 'Residents see their own dues, receipts and notices, and pay by UPI.',
    bullets: ['Own dues and receipts', 'UPI payment links', 'Fewer calls to the manager'],
  },
  ai: {
    title: 'AI Assistant',
    icon: Sparkles,
    pitch: 'Ask questions about your minutes, rules and records and get answers with sources.',
    bullets: ['Read-only and permission-aware', 'Cites the source document', 'Monthly committee summary'],
  },
}
