import { ChevronUpIcon, ChevronDownIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { Transaction } from '@/types/database'
import { formatShekel, formatTransactionAmount } from '@/lib/currency'
import { formatDisplayDate } from '@/lib/utils/dateFormatter'
import { calculateVatFromTotal } from '@/lib/utils/vatCalculator'
import { parseDescriptionParts } from '@/lib/utils/merchantParser'
import { getVendorDisplayInfo } from '@/lib/utils/vendorResolver'
import { useVendorAliases } from '@/hooks/useVendorAliases'
import { useVendorResolverSettings } from '@/hooks/useVendorResolverSettings'
import { TransactionMatchBadge } from '@/components/money-movements/TransactionMatchBadge'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { TransactionColumnKey } from '@/types/columnVisibility'

interface TransactionTableProps {
  transactions: Transaction[]
  isLoading?: boolean
  sortColumn: keyof Transaction
  sortDirection: 'asc' | 'desc'
  onSort: (column: keyof Transaction) => void
  selectedIds?: Set<string>
  onSelectionChange?: (selectedIds: Set<string>) => void
  onCCChargeClick?: (transactionId: string) => void
  // Match data for CC charges (only shown when provided)
  ccChargeMatchData?: Map<string, { matchPercentage: number; matchedCount: number }>
  // Line item link data
  lineItemLinkCounts?: Map<string, number>
  onLineItemLinkClick?: (transaction: Transaction) => void
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

// Checkbox styling: dark background with green border (uses custom CSS class)
const checkboxClass = 'checkbox-dark'

function SkeletonRow({ isVisible }: { isVisible: (col: TransactionColumnKey) => boolean }) {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-4 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-start">
        <div className="h-4 w-32 bg-surface rounded inline-block" />
      </td>
      {isVisible('date') && (
        <td className="px-4 py-3 text-center">
          <div className="h-4 w-16 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('amount') && (
        <td className="px-4 py-3 text-center">
          <div className="h-4 w-24 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('vat') && (
        <td className="px-4 py-3 text-center">
          <div className="h-4 w-4 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('vatPercent') && (
        <td className="px-4 py-3 text-center">
          <div className="h-4 w-10 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('vatAmount') && (
        <td className="px-4 py-3 text-center">
          <div className="h-4 w-16 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('reference') && (
        <td className="px-4 py-3 text-center">
          <div className="h-4 w-16 bg-surface rounded inline-block" />
        </td>
      )}
    </tr>
  )
}

export function TransactionTable({
  transactions,
  isLoading,
  sortColumn,
  sortDirection,
  onSort,
  selectedIds = new Set(),
  onSelectionChange,
  onCCChargeClick,
  ccChargeMatchData,
  lineItemLinkCounts,
  onLineItemLinkClick,
}: TransactionTableProps) {
  // Vendor resolution settings and aliases
  const { enableInTransactionTable } = useVendorResolverSettings()
  const { aliases } = useVendorAliases()
  const { isVisible } = useColumnVisibility('transaction')

  // Check if we should show match columns (only when CC charge data is provided)
  const showMatchColumns = !!ccChargeMatchData
  // Check if we should show link column (only when handler is provided)
  const showLinkColumn = !!onLineItemLinkClick
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
              <th className="px-4 py-3 text-center w-12">
                <input type="checkbox" disabled className={checkboxClass} />
              </th>
              <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">Description</th>
              {isVisible('date') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">Date</th>}
              {isVisible('amount') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-28">Amount</th>}
              {isVisible('vat') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-14">VAT</th>}
              {isVisible('vatPercent') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">VAT %</th>}
              {isVisible('vatAmount') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">VAT Amt</th>}
              {isVisible('reference') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">Reference</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-text-muted/10">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} isVisible={isVisible} />
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
              label="Description"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="start"
            />
            {isVisible('date') && (
              <SortHeader
                column="date"
                label="Date"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
              />
            )}
            {isVisible('amount') && (
              <SortHeader
                column="amount_agorot"
                label="Amount"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
              />
            )}
            {isVisible('vat') && (
              <SortHeader
                column="has_vat"
                label="VAT"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
              />
            )}
            {isVisible('vatPercent') && (
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">
                VAT %
              </th>
            )}
            {isVisible('vatAmount') && (
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">
                VAT Amt
              </th>
            )}
            {isVisible('reference') && (
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">
                Reference
              </th>
            )}
            {showLinkColumn && isVisible('invoice') && (
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">
                Invoice
              </th>
            )}
            {showMatchColumns && isVisible('matchPercent') && (
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">
                Match %
              </th>
            )}
            {showMatchColumns && isVisible('matched') && (
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">
                Matched
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-text-muted/10">
          {transactions.map((tx) => {
            const amountColor = tx.is_income ? 'text-green-400' : 'text-red-400'
            const isSelected = selectedIds.has(tx.id)
            const hasVat = tx.has_vat ?? false
            const vatPercentage = tx.vat_percentage ?? 18
            const vatAmount = hasVat && !tx.is_income
              ? calculateVatFromTotal(tx.amount_agorot, vatPercentage)
              : null

            // Parse description into merchant name and reference
            // Use vendor resolver when enabled, otherwise fall back to basic parsing
            const { reference } = parseDescriptionParts(tx.description)
            const merchantName = enableInTransactionTable
              ? getVendorDisplayInfo(tx.description, aliases).displayName
              : parseDescriptionParts(tx.description).merchantName

            // For CC charges, clicking row opens modal; for regular transactions, clicking row selects it
            const isCCCharge = (tx.is_credit_card_charge || tx.transaction_type === 'bank_cc_charge') && onCCChargeClick

            const handleRowClick = () => {
              if (isCCCharge) {
                onCCChargeClick(tx.id)
              } else {
                handleSelectOne(tx.id)
              }
            }

            return (
              <tr
                key={tx.id}
                onClick={handleRowClick}
                className={`hover:bg-surface/30 transition-colors cursor-pointer ${isSelected ? 'bg-primary/10' : ''}`}
              >
                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectOne(tx.id)}
                    className={checkboxClass}
                  />
                </td>
                <td className="px-4 py-3 text-start text-sm" dir="auto">
                  {isCCCharge ? (
                    <span className="text-text font-medium hover:text-primary transition-colors">
                      {tx.description}
                    </span>
                  ) : (
                    <>
                      <span className="text-text font-medium">{merchantName}</span>
                      {reference && (
                        <span className="text-text-muted/50 ml-1 text-xs">{reference}</span>
                      )}
                    </>
                  )}
                </td>
                {isVisible('date') && (
                  <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                    {formatDisplayDate(tx.date)}
                  </td>
                )}
                {isVisible('amount') && (
                  <td className={`px-4 py-3 text-center text-sm font-medium ${amountColor} whitespace-nowrap`}>
                    {formatTransactionAmount(tx)}
                  </td>
                )}
                {isVisible('vat') && (
                  <td className="px-4 py-3 text-center">
                    {tx.is_income ? (
                      <span className="text-text-muted/30">-</span>
                    ) : hasVat ? (
                      <CheckIcon className="w-4 h-4 text-green-400 inline-block" />
                    ) : (
                      <XMarkIcon className="w-4 h-4 text-text-muted/30 inline-block" />
                    )}
                  </td>
                )}
                {isVisible('vatPercent') && (
                  <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                    {tx.is_income ? '-' : hasVat ? `${vatPercentage}%` : '-'}
                  </td>
                )}
                {isVisible('vatAmount') && (
                  <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                    {tx.is_income ? '-' : (vatAmount !== null ? formatShekel(vatAmount) : '-')}
                  </td>
                )}
                {isVisible('reference') && (
                  <td className="px-4 py-3 text-center text-sm text-text-muted">
                    {tx.reference || '-'}
                  </td>
                )}
                {showLinkColumn && isVisible('invoice') && (
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <TransactionMatchBadge
                      linkedCount={lineItemLinkCounts?.get(tx.id) || 0}
                      onClick={() => onLineItemLinkClick?.(tx)}
                    />
                  </td>
                )}
                {showMatchColumns && (() => {
                  const matchData = ccChargeMatchData?.get(tx.id)
                  return (
                    <>
                      {isVisible('matchPercent') && (
                        <td className="px-4 py-3 text-center text-sm whitespace-nowrap">
                          {matchData ? (
                            <span className={matchData.matchPercentage >= 100 ? 'text-green-400' : matchData.matchPercentage >= 90 ? 'text-yellow-400' : 'text-red-400'}>
                              {matchData.matchPercentage}%
                            </span>
                          ) : (
                            <span className="text-text-muted/30">-</span>
                          )}
                        </td>
                      )}
                      {isVisible('matched') && (
                        <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                          {matchData ? matchData.matchedCount : '-'}
                        </td>
                      )}
                    </>
                  )
                })()}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
