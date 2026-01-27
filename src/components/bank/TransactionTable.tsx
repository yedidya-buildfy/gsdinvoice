import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import type { Transaction } from '@/types/database'
import { formatShekel } from '@/lib/utils/currency'

interface TransactionTableProps {
  transactions: Transaction[]
  isLoading?: boolean
  sortColumn: keyof Transaction
  sortDirection: 'asc' | 'desc'
  onSort: (column: keyof Transaction) => void
}

interface SortHeaderProps {
  column: keyof Transaction
  label: string
  sortColumn: keyof Transaction
  sortDirection: 'asc' | 'desc'
  onSort: (column: keyof Transaction) => void
  align?: 'start' | 'center' | 'end'
}

function SortHeader({ column, label, sortColumn, sortDirection, onSort, align = 'start' }: SortHeaderProps) {
  const isActive = sortColumn === column
  const alignClass = align === 'end' ? 'text-end' : align === 'center' ? 'text-center' : 'text-start'

  return (
    <th
      onClick={() => onSort(column)}
      className={`cursor-pointer select-none px-4 py-3 ${alignClass} text-xs font-medium text-text-muted uppercase tracking-wider`}
    >
      <div className={`flex items-center gap-1 ${align === 'end' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
        {label}
        {isActive && (
          sortDirection === 'asc'
            ? <ChevronUpIcon className="w-4 h-4" />
            : <ChevronDownIcon className="w-4 h-4" />
        )}
      </div>
    </th>
  )
}

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateString))
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3 text-end">
        <div className="h-4 w-32 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-end">
        <div className="h-4 w-20 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-end">
        <div className="h-4 w-24 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-end">
        <div className="h-4 w-24 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-end">
        <div className="h-4 w-20 bg-surface rounded inline-block" />
      </td>
    </tr>
  )
}

export function TransactionTable({ transactions, isLoading, sortColumn, sortDirection, onSort }: TransactionTableProps) {
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-text-muted/20">
        <table className="w-full">
          <thead className="bg-surface/50">
            <tr>
              <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider">Description</th>
              <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-28">Date</th>
              <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-32">Amount</th>
              <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-32">Balance</th>
              <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-28">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-text-muted/10">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (transactions.length === 0) {
    return null
  }

  return (
    <div className="overflow-hidden rounded-lg border border-text-muted/20">
      <table className="w-full">
        <thead className="bg-surface/50">
          <tr>
            <SortHeader
              column="description"
              label="Description"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="end"
            />
            <SortHeader
              column="date"
              label="Date"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="end"
            />
            <SortHeader
              column="amount_agorot"
              label="Amount"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="end"
            />
            <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-32">
              Balance
            </th>
            <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-28">
              Reference
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-text-muted/10">
          {transactions.map((tx) => {
            const amountColor = tx.is_income ? 'text-green-400' : 'text-red-400'

            return (
              <tr key={tx.id} className="hover:bg-surface/30 transition-colors">
                <td className="px-4 py-3 text-end text-sm text-text" dir="auto">
                  {tx.description}
                </td>
                <td className="px-4 py-3 text-end text-sm text-text-muted whitespace-nowrap">
                  {formatDate(tx.date)}
                </td>
                <td className={`px-4 py-3 text-end text-sm font-medium ${amountColor} whitespace-nowrap`}>
                  {formatShekel(tx.amount_agorot)}
                </td>
                <td className="px-4 py-3 text-end text-sm text-text-muted whitespace-nowrap">
                  {tx.balance_agorot !== null ? formatShekel(tx.balance_agorot) : '-'}
                </td>
                <td className="px-4 py-3 text-end text-sm text-text-muted">
                  {tx.reference || '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
