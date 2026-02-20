// Transaction table (Bank + CC Charges)
export type TransactionColumnKey =
  | 'date'
  | 'amount'
  | 'vat'
  | 'vatPercent'
  | 'vatAmount'
  | 'reference'
  | 'invoice'
  | 'matchPercent'
  | 'matched'

// Credit card purchases table
export type CreditCardColumnKey =
  | 'date'
  | 'amount'
  | 'currency'
  | 'vat'
  | 'vatPercent'
  | 'vatAmount'
  | 'billing'
  | 'status'
  | 'card'
  | 'link'
  | 'invoice'

// Documents table
export type DocumentColumnKey =
  | 'type'
  | 'size'
  | 'vendor'
  | 'total'
  | 'vatAmount'
  | 'added'
  | 'items'
  | 'confidence'
  | 'bankLink'
  | 'aiStatus'
  | 'approval'
  | 'source'

export interface ColumnDef<K extends string> {
  key: K
  label: string
}

export const TRANSACTION_COLUMNS: ColumnDef<TransactionColumnKey>[] = [
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'vat', label: 'VAT' },
  { key: 'vatPercent', label: 'VAT %' },
  { key: 'vatAmount', label: 'VAT Amt' },
  { key: 'reference', label: 'Reference' },
  { key: 'invoice', label: 'Invoice' },
  { key: 'matchPercent', label: 'Match %' },
  { key: 'matched', label: 'Matched' },
]

export const CREDIT_CARD_COLUMNS: ColumnDef<CreditCardColumnKey>[] = [
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'currency', label: 'Currency' },
  { key: 'vat', label: 'VAT' },
  { key: 'vatPercent', label: 'VAT %' },
  { key: 'vatAmount', label: 'VAT Amt' },
  { key: 'billing', label: 'Billing' },
  { key: 'status', label: 'Status' },
  { key: 'card', label: 'Card' },
  { key: 'link', label: 'Link' },
  { key: 'invoice', label: 'Invoice' },
]

export const DOCUMENT_COLUMNS: ColumnDef<DocumentColumnKey>[] = [
  { key: 'type', label: 'Type' },
  { key: 'size', label: 'Size' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'total', label: 'Total' },
  { key: 'vatAmount', label: 'VAT' },
  { key: 'added', label: 'Added' },
  { key: 'items', label: 'Items' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'bankLink', label: 'Link to Transaction' },
  { key: 'aiStatus', label: 'AI Status' },
  { key: 'approval', label: 'Approved' },
  { key: 'source', label: 'Source' },
]

export type ColumnVisibilityState = {
  transaction: Record<TransactionColumnKey, boolean>
  creditCard: Record<CreditCardColumnKey, boolean>
  document: Record<DocumentColumnKey, boolean>
}
