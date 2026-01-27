import { ChevronUpIcon, ChevronDownIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline'
import type { TransactionWithCard } from '@/hooks/useCreditCards'
import { formatShekel } from '@/lib/utils/currency'

// Format foreign currency amount
function formatForeignAmount(cents: number | null, currency: string | null): string | null {
  if (cents === null || currency === null) return null
  const amount = cents / 100
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency
  return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface CreditCardTableProps {
  transactions: TransactionWithCard[]
  isLoading?: boolean
  sortColumn: keyof TransactionWithCard
  sortDirection: 'asc' | 'desc'
  onSort: (column: keyof TransactionWithCard) => void
  selectedIds?: Set<string>
  onSelectionChange?: (selectedIds: Set<string>) => void
}

interface SortHeaderProps {
  column: keyof TransactionWithCard
  label: string
  sortColumn: keyof TransactionWithCard
  sortDirection: 'asc' | 'desc'
  onSort: (column: keyof TransactionWithCard) => void
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

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateString))
}

// Checkbox styling: dark background with green border (uses custom CSS class)
const checkboxClass = 'checkbox-dark'

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3 text-end">
        <div className="h-4 w-20 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-end">
        <div className="h-4 w-32 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-end">
        <div className="h-4 w-20 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-end">
        <div className="h-4 w-24 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-12 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-end">
        <div className="h-4 w-20 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-4 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-4 bg-surface rounded inline-block" />
      </td>
    </tr>
  )
}

export function CreditCardTable({
  transactions,
  isLoading,
  sortColumn,
  sortDirection,
  onSort,
  selectedIds = new Set(),
  onSelectionChange,
}: CreditCardTableProps) {
  const allSelected = transactions.length > 0 && selectedIds.size === transactions.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < transactions.length

  const handleSelectAll = () => {
    if (!onSelectionChange) return
    if (allSelected) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(transactions.map((tx) => tx.id)))
    }
  }

  const handleSelectOne = (id: string) => {
    if (!onSelectionChange) return
    const newSelection = new Set(selectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    onSelectionChange(newSelection)
  }

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-text-muted/20">
        <table className="w-full">
          <thead className="bg-surface/50">
            <tr>
              <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-28">תאריך</th>
              <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider">בית עסק</th>
              <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-24">מט״ח</th>
              <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-28">סכום ₪</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">כרטיס</th>
              <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-28">מועד חיוב</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">סטטוס</th>
              <th className="px-4 py-3 text-center w-12">
                <input type="checkbox" disabled className={checkboxClass} />
              </th>
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
              column="date"
              label="תאריך"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="end"
            />
            <SortHeader
              column="description"
              label="בית עסק"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="end"
            />
            <SortHeader
              column="foreign_amount_cents"
              label="מט״ח"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="end"
            />
            <SortHeader
              column="amount_agorot"
              label="סכום ₪"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="end"
            />
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">
              כרטיס
            </th>
            <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-28">
              מועד חיוב
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">
              סטטוס
            </th>
            <th className="px-4 py-3 text-center w-12">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected
                }}
                onChange={handleSelectAll}
                className={checkboxClass}
              />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-text-muted/10">
          {transactions.map((tx) => {
            const isSelected = selectedIds.has(tx.id)

            // Get card last four from joined credit_card relation
            const cardLastFour = tx.credit_card?.card_last_four || '-';

            // Linked status - check if this CC transaction has a credit card linked
            const isLinked = tx.linked_credit_card_id !== null;

            // Format foreign currency if present
            const foreignFormatted = formatForeignAmount(tx.foreign_amount_cents, tx.foreign_currency)

            return (
              <tr
                key={tx.id}
                className={`hover:bg-surface/30 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
              >
                <td className="px-4 py-3 text-end text-sm text-text-muted whitespace-nowrap">
                  {formatDate(tx.date)}
                </td>
                <td className="px-4 py-3 text-end text-sm text-text" dir="auto">
                  {tx.description}
                </td>
                <td className="px-4 py-3 text-end text-sm font-medium text-red-400 whitespace-nowrap">
                  {foreignFormatted || '-'}
                </td>
                <td className="px-4 py-3 text-end text-sm font-medium text-red-400 whitespace-nowrap">
                  {tx.amount_agorot !== 0 ? formatShekel(tx.amount_agorot) : '-'}
                </td>
                <td className="px-4 py-3 text-center text-sm text-text-muted font-mono">
                  {cardLastFour}
                </td>
                <td className="px-4 py-3 text-end text-sm text-text-muted whitespace-nowrap">
                  {formatDate(tx.value_date)}
                </td>
                <td className="px-4 py-3 text-center">
                  {isLinked ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-400 inline-block" />
                  ) : (
                    <ClockIcon className="w-5 h-5 text-text-muted/50 inline-block" />
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectOne(tx.id)}
                    className={checkboxClass}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
