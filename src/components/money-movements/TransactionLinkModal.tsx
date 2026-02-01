/**
 * Modal for linking a transaction to an invoice line item
 * Opens from Bank/CC Purchases tabs when clicking "Link to Invoice"
 */

import { useState, useMemo, useEffect } from 'react'
import { XMarkIcon, MagnifyingGlassIcon, DocumentTextIcon, CheckIcon, AdjustmentsHorizontalIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import { Modal } from '@/components/ui/base/modal/modal'
import { RangeCalendarCard } from '@/components/ui/date-picker'
import { formatTransactionAmount, formatLineItemAmount } from '@/lib/currency'
import { formatDisplayDate } from '@/lib/utils/dateFormatter'
import {
  getMatchableLineItems,
  linkLineItemToTransaction,
  scoreMatch,
  type LineItemWithInvoice,
  type ScoringContext,
} from '@/lib/services/lineItemMatcher'
import { useVendorAliases } from '@/hooks/useVendorAliases'
import type { Transaction } from '@/types/database'

interface TransactionLinkModalProps {
  isOpen: boolean
  onClose: () => void
  transaction: Transaction | null
  onLinkComplete?: () => void
}

// Calculate date range around a given date
function calculateDateRange(dateStr: string, daysBefore: number, daysAfter: number): { from: string; to: string } {
  const date = new Date(dateStr)
  const from = new Date(date)
  from.setDate(from.getDate() - daysBefore)
  const to = new Date(date)
  to.setDate(to.getDate() + daysAfter)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

// Currency options commonly used
const CURRENCY_OPTIONS = ['ILS', 'USD', 'EUR', 'GBP']

// Amount tolerance presets
const TOLERANCE_OPTIONS = [
  { value: -1, label: 'Not relevant' },
  { value: 0, label: 'Exact' },
  { value: 5, label: '5%' },
  { value: 10, label: '10%' },
  { value: 20, label: '20%' },
  { value: 50, label: '50%' },
]

// Dropdown filter component matching app theme
function FilterDropdown({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  options: Array<{ value: string | number; label: string }>
  onChange: (value: string | number) => void
}) {
  const selectedOption = options.find(opt => opt.value === value)

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-sm"
      >
        <Icon className="w-4 h-4 text-text-muted" />
        <span>{label} {selectedOption?.label}</span>
      </button>
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-text-muted/20 rounded-lg shadow-lg min-w-[150px] overflow-y-auto">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`w-full text-start px-3 py-2 text-sm hover:bg-background/50 transition-colors ${
              opt.value === value ? 'text-primary bg-primary/10' : 'text-text'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TransactionLinkModal({
  isOpen,
  onClose,
  transaction,
  onLinkComplete,
}: TransactionLinkModalProps) {
  // Vendor aliases for scoring
  const { aliases: vendorAliases } = useVendorAliases()

  // State
  const [lineItems, setLineItems] = useState<LineItemWithInvoice[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters - with smart defaults
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [amountTolerance, setAmountTolerance] = useState(20)
  const [currencyFilter, setCurrencyFilter] = useState<string>('')

  // Initialize filters when modal opens with transaction data
  useEffect(() => {
    if (isOpen && transaction) {
      // Pre-populate date range based on transaction date (±14 days)
      const { from, to } = calculateDateRange(transaction.date, 14, 14)
      setFromDate(from)
      setToDate(to)

      // Reset other filters
      setSearchQuery('')
      setVendorFilter('')
      setCurrencyFilter('')
      setAmountTolerance(20)
    }
  }, [isOpen, transaction?.id]) // Only reset when modal opens with new transaction

  // Fetch line items when modal opens or filters change
  useEffect(() => {
    if (!isOpen || !transaction) {
      setLineItems([])
      return
    }

    async function fetchLineItems() {
      if (!transaction) return
      setIsLoading(true)
      setError(null)

      try {
        // Use a wide date range for initial fetch, then filter by date picker values
        // If tolerance is -1 (not relevant), use 100% to include all amounts
        const results = await getMatchableLineItems(transaction, {
          dateRangeDays: 90,
          amountTolerancePercent: amountTolerance === -1 ? 100 : amountTolerance,
          vendorName: vendorFilter || undefined,
          searchQuery: searchQuery || undefined,
        })

        // Apply date filters from date picker
        // Use transaction_date, or invoice_date as fallback
        let filtered = results

        if (fromDate || toDate) {
          filtered = filtered.filter(item => {
            const itemDate = item.transaction_date || item.invoice?.invoice_date
            // If no date at all, include the item (let user decide)
            if (!itemDate) return true
            if (fromDate && itemDate < fromDate) return false
            if (toDate && itemDate > toDate) return false
            return true
          })
        }

        // Apply currency filter
        if (currencyFilter) {
          filtered = filtered.filter(item => item.currency === currencyFilter)
        }

        setLineItems(filtered)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch line items')
      } finally {
        setIsLoading(false)
      }
    }

    fetchLineItems()
  }, [isOpen, transaction, fromDate, toDate, searchQuery, vendorFilter, amountTolerance, currencyFilter])

  // Score line items using new scoring algorithm
  const scoredLineItems = useMemo(() => {
    if (!transaction) return []

    return lineItems
      .map(item => {
        // Build scoring context for the new scorer
        const scoringContext: ScoringContext = {
          lineItem: item,
          invoice: item.invoice || null,
          extractedData: null, // Not available in this context
          vendorAliases: vendorAliases || [],
        }
        const score = scoreMatch(transaction, scoringContext)
        // Map to the expected format with confidence for backward compatibility
        return {
          lineItem: item,
          score: {
            confidence: score.isDisqualified ? 0 : score.total,
            matchReasons: score.matchReasons,
            warnings: score.warnings,
          },
        }
      })
      .filter(item => item.score.confidence > 0) // Filter out disqualified
      .sort((a, b) => b.score.confidence - a.score.confidence)
  }, [lineItems, transaction, vendorAliases])

  // Get unique vendors for filter dropdown
  const uniqueVendors = useMemo(() => {
    const vendors = new Set<string>()
    lineItems.forEach(item => {
      if (item.invoice?.vendor_name) {
        vendors.add(item.invoice.vendor_name)
      }
    })
    return Array.from(vendors).sort()
  }, [lineItems])

  // Get unique currencies from line items
  const uniqueCurrencies = useMemo(() => {
    const currencies = new Set<string>()
    lineItems.forEach(item => {
      if (item.currency) {
        currencies.add(item.currency)
      }
    })
    // Add common currencies that might not be in current results
    CURRENCY_OPTIONS.forEach(c => currencies.add(c))
    return Array.from(currencies).sort()
  }, [lineItems])

  // Handle link
  const handleLink = async (lineItemId: string) => {
    if (!transaction) return
    setIsLinking(true)
    setError(null)

    try {
      const result = await linkLineItemToTransaction(lineItemId, transaction.id, {
        matchMethod: 'manual',
      })

      if (!result.success) {
        setError(result.error || 'Failed to link')
        return
      }

      onLinkComplete?.()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link')
    } finally {
      setIsLinking(false)
    }
  }

  // Reset state when closing
  const handleClose = () => {
    setFromDate('')
    setToDate('')
    setSearchQuery('')
    setVendorFilter('')
    setAmountTolerance(20)
    setCurrencyFilter('')
    setError(null)
    onClose()
  }

  if (!transaction) return null

  return (
    <Modal.Overlay isOpen={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Modal.Content className="!w-[calc(90vw-4rem)] !max-w-4xl !h-[calc(85vh-4rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex-1">
            <Modal.Title>Link Transaction to Invoice Line Item</Modal.Title>
            <div className="text-sm text-text-muted mt-1" dir="auto">
              {transaction.description} - {formatTransactionAmount(transaction)}
              {' - '}{formatDisplayDate(transaction.date)}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-text-muted hover:text-text transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Date range picker - pre-populated */}
          <RangeCalendarCard
            startDate={fromDate}
            endDate={toDate}
            onChange={(start, end) => {
              setFromDate(start)
              setToDate(end)
            }}
          />

          {/* Amount tolerance */}
          <FilterDropdown
            icon={AdjustmentsHorizontalIcon}
            label="Tolerance"
            value={amountTolerance}
            options={TOLERANCE_OPTIONS}
            onChange={(val) => setAmountTolerance(val as number)}
          />

          {/* Currency filter */}
          <FilterDropdown
            icon={CurrencyDollarIcon}
            label="Currency"
            value={currencyFilter || 'all'}
            options={[
              { value: 'all', label: 'All' },
              ...uniqueCurrencies.map(c => ({ value: c, label: c })),
            ]}
            onChange={(val) => setCurrencyFilter(val === 'all' ? '' : val as string)}
          />

          {/* Vendor filter */}
          <FilterDropdown
            icon={DocumentTextIcon}
            label="Vendor"
            value={vendorFilter || 'all'}
            options={[
              { value: 'all', label: 'All' },
              ...uniqueVendors.map(v => ({ value: v, label: v })),
            ]}
            onChange={(val) => setVendorFilter(val === 'all' ? '' : val as string)}
          />

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search description..."
              className="w-full ps-9 pe-3 py-2 text-sm bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-3 py-2 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 min-h-0 overflow-y-auto border border-text-muted/20 rounded-lg">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              Loading...
            </div>
          ) : scoredLineItems.length === 0 ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              No matching line items found
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-text-muted/20">
                  <th className="text-start py-2 px-3 text-text-muted font-medium">Vendor</th>
                  <th className="text-start py-2 px-3 text-text-muted font-medium">Description</th>
                  <th className="text-start py-2 px-3 text-text-muted font-medium w-24">Invoice</th>
                  <th className="text-start py-2 px-3 text-text-muted font-medium w-24">Date</th>
                  <th className="text-end py-2 px-3 text-text-muted font-medium w-28">Amount</th>
                  <th className="text-center py-2 px-3 text-text-muted font-medium w-20">Match</th>
                  <th className="text-center py-2 px-3 text-text-muted font-medium w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {scoredLineItems.map(({ lineItem, score }) => (
                  <tr
                    key={lineItem.id}
                    className="border-b border-text-muted/10 hover:bg-background/30"
                  >
                    <td className="py-2 px-3">
                      <div className="font-medium text-text" dir="auto">
                        {lineItem.invoice?.vendor_name || '-'}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="text-text text-sm" dir="auto">
                        {lineItem.description || '-'}
                      </div>
                      {lineItem.reference_id && (
                        <div className="text-xs text-text-muted font-mono">
                          Ref: {lineItem.reference_id}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-text text-xs">
                      {lineItem.invoice?.invoice_number || '-'}
                    </td>
                    <td className="py-2 px-3 text-text">
                      {lineItem.transaction_date ? formatDisplayDate(lineItem.transaction_date) : '-'}
                    </td>
                    <td className="py-2 px-3 text-end text-text">
                      {formatLineItemAmount(lineItem)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          score.confidence >= 80
                            ? 'bg-green-500/10 text-green-400'
                            : score.confidence >= 50
                              ? 'bg-yellow-500/10 text-yellow-400'
                              : 'bg-text-muted/10 text-text-muted'
                        }`}
                      >
                        {score.confidence}%
                      </div>
                      {score.matchReasons.length > 0 && (
                        <div className="text-[10px] text-text-muted mt-0.5">
                          {score.matchReasons[0]}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleLink(lineItem.id)}
                        disabled={isLinking}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 text-xs"
                      >
                        <CheckIcon className="w-3.5 h-3.5" />
                        Link
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 text-xs text-text-muted">
          <div>
            {scoredLineItems.length} line item{scoredLineItems.length !== 1 ? 's' : ''} found
          </div>
          <div className="flex items-center gap-1">
            <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
            <span>
              {amountTolerance === -1 ? 'Any amount' : amountTolerance === 0 ? 'Exact match' : `${amountTolerance}% tolerance`}
              {currencyFilter && ` | ${currencyFilter}`}
              {vendorFilter && ` | ${vendorFilter}`}
            </span>
          </div>
        </div>
      </Modal.Content>
    </Modal.Overlay>
  )
}
