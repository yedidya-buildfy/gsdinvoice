import { ChevronUpIcon, ChevronDownIcon, CheckCircleIcon, ClockIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { TransactionWithCard } from '@/hooks/useCreditCards'
import { calculateVatFromTotal } from '@/lib/utils/vatCalculator'
import { formatShekel } from '@/lib/utils/currency'
import { parseDescriptionParts } from '@/lib/utils/merchantParser'

// Format amount without currency symbol
function formatAmount(cents: number): string {
  const amount = Math.abs(cents) / 100
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(dateString))
}

// Checkbox styling: dark background with green border (uses custom CSS class)
const checkboxClass = 'checkbox-dark'

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {/* Columns: checkbox, merchant, date, amount, vat, vat%, vat amt, currency, card, billing, status */}
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-4 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-start">
        <div className="h-4 w-32 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-16 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-20 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-4 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-10 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-16 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-10 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-12 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-16 bg-surface rounded inline-block" />
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
              {/* Columns: checkbox, merchant, date, amount, vat, vat%, vat amt, currency, card, billing, status */}
              <th className="px-4 py-3 text-center w-12">
                <input type="checkbox" disabled className={checkboxClass} />
              </th>
              <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">Merchant</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">Date</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">Amount</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-14">VAT</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">VAT %</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">VAT Amt</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-14">Currency</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">Card</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">Billing</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-14">Status</th>
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
            {/* Columns: checkbox, merchant, date, amount, vat, vat%, vat amt, currency, card, billing, status */}
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
            <SortHeader
              column="description"
              label="Merchant"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="start"
            />
            <SortHeader
              column="date"
              label="Date"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="center"
            />
            <SortHeader
              column="amount_agorot"
              label="Amount"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="center"
            />
            <SortHeader
              column="has_vat"
              label="VAT"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="center"
            />
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">
              VAT %
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">
              VAT Amt
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-14">
              Currency
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">
              Card
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">
              Billing
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-14">
              Status
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

            // Determine amount and currency to display
            // If foreign currency exists, show that; otherwise show ILS
            const hasForeign = tx.foreign_amount_cents !== null && tx.foreign_currency !== null
            const displayAmount = hasForeign
              ? formatAmount(tx.foreign_amount_cents!)
              : formatAmount(tx.amount_agorot)
            const displayCurrency = hasForeign ? tx.foreign_currency : 'ILS'

            // VAT state
            const hasVat = tx.has_vat ?? false
            const vatPercentage = tx.vat_percentage ?? 18
            const vatAmount = hasVat
              ? calculateVatFromTotal(tx.amount_agorot, vatPercentage)
              : null

            // Parse description into merchant name and reference
            const { merchantName, reference } = parseDescriptionParts(tx.description)

            return (
              <tr
                key={tx.id}
                onClick={() => handleSelectOne(tx.id)}
                className={`hover:bg-surface/30 transition-colors cursor-pointer ${isSelected ? 'bg-primary/10' : ''}`}
              >
                {/* Columns: checkbox, merchant, date, amount, vat, vat%, vat amt, currency, card, billing, status */}
                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectOne(tx.id)}
                    className={checkboxClass}
                  />
                </td>
                <td className="px-4 py-3 text-start text-sm" dir="auto">
                  <span className="text-text font-medium">{merchantName}</span>
                  {reference && (
                    <span className="text-text-muted/50 ml-1 text-xs">{reference}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                  {formatDate(tx.date)}
                </td>
                <td className="px-4 py-3 text-center text-sm font-medium text-red-400 whitespace-nowrap">
                  {displayAmount}
                </td>
                <td className="px-4 py-3 text-center">
                  {hasVat ? (
                    <CheckIcon className="w-4 h-4 text-green-400 inline-block" />
                  ) : (
                    <XMarkIcon className="w-4 h-4 text-text-muted/30 inline-block" />
                  )}
                </td>
                <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                  {hasVat ? `${vatPercentage}%` : '-'}
                </td>
                <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                  {vatAmount !== null ? formatShekel(vatAmount) : '-'}
                </td>
                <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                  {displayCurrency}
                </td>
                <td className="px-4 py-3 text-center text-sm text-text-muted font-mono">
                  {cardLastFour}
                </td>
                <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                  {formatDate(tx.value_date)}
                </td>
                <td className="px-4 py-3 text-center">
                  {isLinked ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-400 inline-block" />
                  ) : (
                    <ClockIcon className="w-5 h-5 text-text-muted/50 inline-block" />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
