import { ChevronUpIcon, ChevronDownIcon, CheckCircleIcon, ClockIcon, CheckIcon, XMarkIcon, LinkIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import type { TransactionWithCard } from '@/hooks/useCreditCards'
import type { Transaction } from '@/types/database'
import { calculateVatFromTotal } from '@/lib/utils/vatCalculator'
import { formatShekel, formatTransactionAmount } from '@/lib/currency'
import { formatDisplayDate } from '@/lib/utils/dateFormatter'
import { parseDescriptionParts } from '@/lib/utils/merchantParser'
import { getVendorDisplayInfo } from '@/lib/utils/vendorResolver'
import { useVendorAliases } from '@/hooks/useVendorAliases'
import { useVendorResolverSettings } from '@/hooks/useVendorResolverSettings'
import { TransactionMatchBadge } from '@/components/money-movements/TransactionMatchBadge'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { CreditCardColumnKey } from '@/types/columnVisibility'


// Sort column type includes actual fields plus synthetic columns
export type CCSortColumn = keyof TransactionWithCard | 'vat_amount' | 'linked_bank_transaction_id'

interface CreditCardTableProps {
  transactions: TransactionWithCard[]
  isLoading?: boolean
  sortColumn: CCSortColumn
  sortDirection: 'asc' | 'desc'
  onSort: (column: CCSortColumn) => void
  selectedIds?: Set<string>
  onSelectionChange?: (selectedIds: Set<string>) => void
  onBankChargeClick?: (bankTransactionId: string) => void
  onLinkCCTransaction?: (ccTransactionId: string) => void
  // Line item link data
  lineItemLinkCounts?: Map<string, number>
  onLineItemLinkClick?: (transaction: Transaction) => void
}

interface HeaderTooltipProps {
  tooltip: string
}

function HeaderTooltip({ tooltip }: HeaderTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    setPosition({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    })
  }, [isOpen])

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex cursor-help"
      >
        <InformationCircleIcon className="w-3.5 h-3.5 text-text-muted/50 hover:text-text-muted" />
      </span>

      {isOpen &&
        createPortal(
          <div
            className="fixed z-[9999] px-2 py-1 text-xs normal-case tracking-normal font-normal text-text bg-surface border border-text-muted/20 rounded shadow-lg whitespace-nowrap pointer-events-none -translate-x-1/2 -translate-y-full"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
            }}
          >
            {tooltip}
          </div>,
          document.body
        )}
    </>
  )
}

interface SortHeaderProps {
  column: CCSortColumn
  label: string
  sortColumn: CCSortColumn
  sortDirection: 'asc' | 'desc'
  onSort: (column: CCSortColumn) => void
  align?: 'start' | 'center' | 'end'
  tooltip?: string
}

function SortHeader({ column, label, sortColumn, sortDirection, onSort, align = 'start', tooltip }: SortHeaderProps) {
  const isActive = sortColumn === column
  const alignClass = align === 'end' ? 'text-end' : align === 'center' ? 'text-center' : 'text-start'

  return (
    <th
      onClick={() => onSort(column)}
      className={`cursor-pointer select-none px-4 py-3 ${alignClass} text-xs font-medium text-text-muted uppercase tracking-wider`}
    >
      <div className={`flex items-center gap-1 ${align === 'end' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
        {label}
        {tooltip && <HeaderTooltip tooltip={tooltip} />}
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

function SkeletonRow({ isVisible }: { isVisible: (col: CreditCardColumnKey) => boolean }) {
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
      {(isVisible('amount') || isVisible('currency')) && (
        <td className="ps-4 pe-1 py-3 text-end" colSpan={isVisible('amount') && isVisible('currency') ? 2 : 1}>
          <div className="h-4 w-16 bg-surface rounded inline-block" />
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
      {isVisible('billing') && (
        <td className="px-4 py-3 text-center">
          <div className="h-4 w-16 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('status') && (
        <td className="px-4 py-3 text-center">
          <div className="h-4 w-4 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('card') && (
        <td className="px-4 py-3 text-center">
          <div className="h-4 w-12 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('link') && (
        <td className="px-4 py-3 text-center">
          <div className="h-4 w-4 bg-surface rounded inline-block" />
        </td>
      )}
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
  onBankChargeClick,
  onLinkCCTransaction,
  lineItemLinkCounts,
  onLineItemLinkClick,
}: CreditCardTableProps) {
  // Vendor resolution settings and aliases
  const { enableInCreditCardTable } = useVendorResolverSettings()
  const { aliases } = useVendorAliases()
  const { isVisible } = useColumnVisibility('creditCard')

  // Check if we should show line item link column (only when handler is provided)
  const showLineItemLinkColumn = !!onLineItemLinkClick
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
              <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">Merchant</th>
              {isVisible('date') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">Date</th>}
              {isVisible('amount') && <th className="ps-4 pe-1 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider">Amount</th>}
              {isVisible('currency') && <th className="ps-1 pe-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider w-12">Cur</th>}
              {isVisible('vat') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-14">VAT</th>}
              {isVisible('vatPercent') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">VAT %</th>}
              {isVisible('vatAmount') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">VAT Amt</th>}
              {isVisible('billing') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">Billing</th>}
              {isVisible('status') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-14">Status</th>}
              {isVisible('card') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">Card</th>}
              {isVisible('link') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-14">Link</th>}
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
              label="Merchant"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="start"
              tooltip="From CC statement"
            />
            {isVisible('date') && (
              <SortHeader
                column="date"
                label="Date"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
                tooltip="Transaction date"
              />
            )}
            {isVisible('amount') && (
              <SortHeader
                column="amount_agorot"
                label="Amount"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="end"
                tooltip="In foreign currency if applicable"
              />
            )}
            {isVisible('currency') && (
              <SortHeader
                column="foreign_currency"
                label="Cur"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="start"
                tooltip="Original transaction currency"
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
                tooltip="Has VAT deduction"
              />
            )}
            {isVisible('vatPercent') && (
              <SortHeader
                column="vat_percentage"
                label="VAT %"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
                tooltip="VAT rate (default 18%)"
              />
            )}
            {isVisible('vatAmount') && (
              <SortHeader
                column="vat_amount"
                label="VAT Amt"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
                tooltip="Calculated from ILS amount"
              />
            )}
            {isVisible('billing') && (
              <SortHeader
                column="value_date"
                label="Billing"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
                tooltip="Date charged to bank"
              />
            )}
            {isVisible('status') && (
              <SortHeader
                column="linked_bank_transaction_id"
                label="Status"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
                tooltip="Matched to the credit card in column Card"
              />
            )}
            {isVisible('card') && (
              <SortHeader
                column="credit_card_id"
                label="Card"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
                tooltip="Last 4 digits"
              />
            )}
            {isVisible('link') && (
              <SortHeader
                column="cc_bank_link_id"
                label="Link"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
                tooltip="This expense connected to a credit card charge"
              />
            )}
            {showLineItemLinkColumn && isVisible('invoice') && (
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">
                Invoice
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-text-muted/10">
          {transactions.map((tx) => {
            const isSelected = selectedIds.has(tx.id)

            // Get card last four from joined credit_card relation
            const cardLastFour = tx.credit_card?.card_last_four || '-';

            // Linked status - check if this CC transaction is linked to a bank charge
            const isLinked = tx.credit_card_id !== null;

            // Determine amount to display using the centralized formatter
            // formatTransactionAmount handles foreign currency logic automatically
            const displayAmount = formatTransactionAmount(tx)

            // VAT state
            const hasVat = tx.has_vat ?? false
            const vatPercentage = tx.vat_percentage ?? 18
            const vatAmount = hasVat
              ? calculateVatFromTotal(tx.amount_agorot, vatPercentage)
              : null

            // Parse description into merchant name and reference
            // Use vendor resolver when enabled, otherwise fall back to basic parsing
            const { reference } = parseDescriptionParts(tx.description)
            const merchantName = enableInCreditCardTable
              ? getVendorDisplayInfo(tx.description, aliases).displayName
              : parseDescriptionParts(tx.description).merchantName

            return (
              <tr
                key={tx.id}
                onClick={() => handleSelectOne(tx.id)}
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
                  <span className="text-text font-medium">{merchantName}</span>
                  {reference && (
                    <span className="text-text-muted/50 ml-1 text-xs">{reference}</span>
                  )}
                </td>
                {isVisible('date') && (
                  <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                    {formatDisplayDate(tx.date)}
                  </td>
                )}
                {(isVisible('amount') || isVisible('currency')) && (
                  <td
                    className="ps-4 pe-1 py-3 text-end text-sm font-medium text-red-400 whitespace-nowrap"
                    colSpan={isVisible('amount') && isVisible('currency') ? 2 : 1}
                  >
                    {displayAmount}
                  </td>
                )}
                {isVisible('vat') && (
                  <td className="px-4 py-3 text-center">
                    {hasVat ? (
                      <CheckIcon className="w-4 h-4 text-green-400 inline-block" />
                    ) : (
                      <XMarkIcon className="w-4 h-4 text-text-muted/30 inline-block" />
                    )}
                  </td>
                )}
                {isVisible('vatPercent') && (
                  <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                    {hasVat ? `${vatPercentage}%` : '-'}
                  </td>
                )}
                {isVisible('vatAmount') && (
                  <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                    {vatAmount !== null ? formatShekel(vatAmount) : '-'}
                  </td>
                )}
                {isVisible('billing') && (
                  <td className="px-4 py-3 text-center text-sm text-text-muted whitespace-nowrap">
                    {formatDisplayDate(tx.value_date)}
                  </td>
                )}
                {isVisible('status') && (
                  <td className="px-4 py-3 text-center">
                    {isLinked ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-400 inline-block" />
                    ) : (
                      <ClockIcon className="w-5 h-5 text-text-muted/50 inline-block" />
                    )}
                  </td>
                )}
                {isVisible('card') && (
                  <td className="px-4 py-3 text-center text-sm text-text-muted font-mono">
                    {cardLastFour}
                  </td>
                )}
                {isVisible('link') && (
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        if (tx.cc_bank_link_id) {
                          onBankChargeClick?.(tx.cc_bank_link_id)
                        } else {
                          onLinkCCTransaction?.(tx.id)
                        }
                      }}
                      className="cursor-pointer hover:text-primary transition-colors"
                      title={tx.cc_bank_link_id ? 'View linked bank charge' : 'Link to bank charge'}
                    >
                      <LinkIcon className={`w-5 h-5 inline-block ${tx.cc_bank_link_id ? 'text-green-400 hover:text-green-300' : 'text-text-muted/50 hover:text-primary'}`} />
                    </button>
                  </td>
                )}
                {showLineItemLinkColumn && isVisible('invoice') && (
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <TransactionMatchBadge
                      linkedCount={lineItemLinkCounts?.get(tx.id) || 0}
                      onClick={() => onLineItemLinkClick?.(tx as Transaction)}
                    />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
