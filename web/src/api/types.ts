export type Role = 'ADMIN' | 'MANAGER' | 'VIEWER'
export type Fund = 'MAINTENANCE' | 'SINKING' | 'REPAIR'
export type PayMode = 'CASH' | 'CHEQUE' | 'UPI' | 'BANK_TRANSFER'

export interface UserInfo { id: string; name: string; email: string; role: Role; societyId: string; societyName: string }
export interface Building { id: string; name: string }
export interface Flat {
  id: string; buildingId: string; building: string; flatNumber: string; floorNo: number | null; areaSqft: number | null
  occupancy: 'OWNER' | 'TENANT' | 'VACANT'; ownerName: string; ownerPhone: string | null; ownerEmail: string | null
}
export interface FundStatus { charged: number | null; paid: number; status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'NONE' }
export interface FlatDues { flatId: string; building: string; flatNumber: string; ownerName: string; occupancy: string; funds: Record<Fund, FundStatus>; due: number }
export interface Statement {
  charges: { fund: Fund; period: string; amount: number }[]
  receipts: { id: string; fund: Fund; period: string; amount: number; paidOn: string; mode: PayMode; reference: string | null; note: string | null; reversed: boolean }[]
}
export interface LedgerEntry {
  id: string; entryDate: string; type: 'CREDIT' | 'DEBIT'; category: string; amount: number; description: string | null; mode: PayMode | null
  chequeNo: string | null; vendorId: string | null; vendorName: string | null; receiptLinked: boolean; reversal: boolean; reversed: boolean
}
export interface LedgerMonth { openingBalance: number; credits: number; debits: number; closingBalance: number; entries: LedgerEntry[] }
export interface Vendor { id: string; name: string; category: string | null; phone: string | null; email: string | null; gstNo: string | null; notes: string | null; invoiced: number; paid: number; outstanding: number }
export interface VendorDetail {
  vendor: Vendor
  invoices: { id: string; invoiceNo: string | null; invoiceDate: string; dueDate: string | null; amount: number; description: string | null }[]
  payments: { id: string; date: string; type: 'CREDIT' | 'DEBIT'; amount: number; mode: string | null; chequeNo: string | null; description: string | null; reversed: boolean }[]
}
export interface Agreement {
  id: string; flatId: string; building: string; flatNumber: string; tenantName: string; tenantPhone: string | null
  startDate: string; endDate: string; rent: number | null; deposit: number | null; notes: string | null; daysLeft: number
}
export interface Staff { id: string; name: string; role: 'SECURITY' | 'HOUSEKEEPING' | 'OTHER'; shift: string | null; phone: string | null }
export interface Mark { staffId: string; date: string; status: 'PRESENT' | 'ABSENT' | 'LEAVE' }
export interface Notice { id: string; title: string; body: string; priority: 'LOW' | 'NORMAL' | 'HIGH'; createdAt: string }
export interface Contact { id: string; name: string; role: string | null; phone: string; note: string | null }
export interface Doc { id: string; title: string; category: string; flatId: string | null; flatLabel: string | null; filename: string; sizeBytes: number; createdAt: string }
export interface AppUser { id: string; email: string; fullName: string; role: Role; active: boolean }
export interface AuditEvent { id: string; userName: string; action: string; entityType: string; detail: string | null; createdAt: string }
export interface Dashboard {
  expected: number; collected: number; outstanding: number; cashBalance: number; expenses: number; expenseCount: number; overdueFlats: number
  buildings: { name: string; flats: number; charged: number; paid: number }[]
  attention: { tone: 'danger' | 'warn' | 'info'; title: string; meta: string; to: string }[]
  activity: { who: string; action: string; entity: string; detail: string; at: string }[]
}
