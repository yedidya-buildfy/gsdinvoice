import Papa from 'papaparse'
import type { Transaction } from '@/types/database'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function fromAgorot(agorot: number): number {
  return agorot / 100
}

interface CSVRow {
  Date: string
  Description: string
  Amount: number
  'Is Income': string
  Type: string
  Reference: string
  'VAT Amount': number | string
  'VAT %': number | string
}

export function exportTransactionsToCSV(
  transactions: Transaction[],
  filenamePrefix = 'transactions'
) {
  const rows: CSVRow[] = transactions.map((tx) => {
    const hasVat = tx.has_vat ?? false
    const vatPct = tx.vat_percentage ?? 18
    const vatAmount = hasVat
      ? fromAgorot(Math.round(tx.amount_agorot * vatPct / (100 + vatPct)))
      : 0

    return {
      Date: formatDate(tx.date),
      Description: tx.description,
      Amount: fromAgorot(tx.amount_agorot),
      'Is Income': tx.is_income ? 'Yes' : 'No',
      Type: tx.transaction_type || 'bank_regular',
      Reference: tx.reference || '',
      'VAT Amount': hasVat ? vatAmount : '',
      'VAT %': hasVat ? vatPct : '',
    }
  })

  const csv = Papa.unparse(rows)

  // UTF-8 BOM for Excel compatibility
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })

  const today = new Date().toISOString().slice(0, 10)
  const filename = `${filenamePrefix}_${today}.csv`

  downloadBlob(blob, filename)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
