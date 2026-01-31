/**
 * Modal for linking a line item to a bank/CC transaction
 * Opens from Invoices page when clicking "Link" on a line item
 */

import { useState, useMemo, useEffect } from 'react'
import { XMarkIcon, MagnifyingGlassIcon, BanknotesIcon, CreditCardIcon, CheckIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { Modal } from '@/components/ui/base/modal/modal'
import { RangeCalendarCard } from '@/components/ui/date-picker'
import { formatTransactionAmount, formatLineItemAmount } from '@/lib/currency'
import { formatDisplayDate } from '@/lib/utils/dateFormatter'
import { parseDescriptionParts } from '@/lib/utils/merchantParser'
import {
  getMatchableTransactions,
  linkLineItemToTransaction,
  scoreTransactionCandidate,
  type TransactionWithCard,
} from '@/lib/services/lineItemMatcher'
import { useCreditCards } from '@/hooks/useCreditCards'
import { useSettingsStore } from '@/stores/settingsStore'
import type { InvoiceRow } from '@/types/database'

// Calculate date range around a given date
function calculateDateRange(dateStr: string | null, daysBefore: number, daysAfter: number): { from: string; to: string } {
  const date = dateStr ? new Date(dateStr) : new Date()
  const from = new Date(date)
  from.setDate(from.getDate() - daysBefore)
  const to = new Date(date)
  to.setDate(to.getDate() + daysAfter)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

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

interface LineItemLinkModalProps {
  isOpen: boolean
  onClose: () => void
  lineItem: InvoiceRow | null
  onLinkComplete?: () => void
}

// Card multi-select component
function CardMultiSelect({
  cards,
  value,
  onChange,
}: {
  cards: Array<{ id: string; card_last_four: string; card_name: string | null }>
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const toggleCard = (cardId: string) => {
    if (value.includes(cardId)) {
      onChange(value.filter((id) => id !== cardId))
    } else {
      onChange([...value, cardId])
    }
  }

  const getCardDisplay = (card: { card_name: string | null; card_last_four: string }) => {
    return card.card_name || `-${card.card_last_four}`
  }

  const displayText =
    value.length === 0
      ? 'All Cards'
      : value.length === 1
        ? getCardDisplay(cards.find((c) => c.id === value[0])!)
        : `${value.length} cards`

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-xs"
      >
        <CreditCardIcon className="w-4 h-4 text-text-muted" />
        <span>{displayText}</span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange([])
            }}
            className="p-0.5 rounded hover:bg-background/50"
          >
            <XMarkIcon className="w-3.5 h-3.5 text-text-muted hover:text-text" />
          </button>
        )}
      </button>
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-text-muted/20 rounded-lg shadow-lg min-w-[200px] max-h-[300px] overflow-y-auto">
        <label className="flex items-center gap-2 px-3 py-2 hover:bg-background/50 cursor-pointer text-sm border-b border-text-muted/10">
          <input
            type="checkbox"
            checked={value.length === 0}
            onChange={() => onChange([])}
            className="checkbox-dark"
          />
          <span className="text-text font-medium">All Cards</span>
        </label>
        {cards.map((card) => (
          <label
            key={card.id}
            className="flex items-center gap-2 px-3 py-2 hover:bg-background/50 cursor-pointer text-sm"
          >
            <input
              type="checkbox"
              checked={value.includes(card.id)}
              onChange={() => toggleCard(card.id)}
              className="checkbox-dark"
            />
            <div className="flex flex-col">
              <span className="text-text">{card.card_name || 'Unnamed Card'}</span>
              <span className="text-xs text-text-muted">*{card.card_last_four}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

// Transaction type filter
function TypeFilter({
  value,
  onChange,
}: {
  value: 'all' | 'bank' | 'cc'
  onChange: (value: 'all' | 'bank' | 'cc') => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted">Type:</span>
      <div className="flex rounded-lg border border-text-muted/20 overflow-hidden">
        <button
          type="button"
          onClick={() => onChange('all')}
          className={`px-3 py-1.5 text-xs transition-colors ${
            value === 'all'
              ? 'bg-primary/20 text-primary'
              : 'text-text-muted hover:bg-surface/50'
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => onChange('bank')}
          className={`px-3 py-1.5 text-xs transition-colors border-s border-text-muted/20 ${
            value === 'bank'
              ? 'bg-primary/20 text-primary'
              : 'text-text-muted hover:bg-surface/50'
          }`}
        >
          <BanknotesIcon className="w-3.5 h-3.5 inline-block me-1" />
          Bank
        </button>
        <button
          type="button"
          onClick={() => onChange('cc')}
          className={`px-3 py-1.5 text-xs transition-colors border-s border-text-muted/20 ${
            value === 'cc'
              ? 'bg-primary/20 text-primary'
              : 'text-text-muted hover:bg-surface/50'
          }`}
        >
          <CreditCardIcon className="w-3.5 h-3.5 inline-block me-1" />
          CC
        </button>
      </div>
    </div>
  )
}


export function LineItemLinkModal({
  isOpen,
  onClose,
  lineItem,
  onLinkComplete,
}: LineItemLinkModalProps) {
  const { creditCards } = useCreditCards()

  // Settings store for defaults
  const {
    linkingDateRangeDays: defaultDateRangeDays,
    linkingAmountTolerance: defaultAmountTolerance,
  } = useSettingsStore()

  // State
  const [transactions, setTransactions] = useState<TransactionWithCard[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters with smart defaults
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<'all' | 'bank' | 'cc'>('all')
  const [amountTolerance, setAmountTolerance] = useState(20)

  // Initialize filters when modal opens with line item data
  useEffect(() => {
    if (isOpen && lineItem) {
      // Pre-populate date range based on line item date (using settings default)
      const { from, to } = calculateDateRange(lineItem.transaction_date, defaultDateRangeDays, defaultDateRangeDays)
      setFromDate(from)
      setToDate(to)

      // Reset other filters to user's configured defaults
      setSearchQuery('')
      setSelectedCardIds([])
      setTypeFilter('all')
      setAmountTolerance(defaultAmountTolerance)
    }
  }, [isOpen, lineItem?.id, defaultDateRangeDays, defaultAmountTolerance]) // Reset when modal opens with new line item or defaults change

  // Fetch transactions when modal opens or filters change
  useEffect(() => {
    if (!isOpen || !lineItem) {
      setTransactions([])
      return
    }

    async function fetchTransactions() {
      if (!lineItem) return
      setIsLoading(true)
      setError(null)

      try {
        const types =
          typeFilter === 'all'
            ? ['bank_regular', 'cc_purchase'] as const
            : typeFilter === 'bank'
              ? ['bank_regular'] as const
              : ['cc_purchase'] as const

        // Use a wide date range for initial fetch, then filter by date picker values
        // If tolerance is -1 (not relevant), use 100% to include all amounts
        const results = await getMatchableTransactions(lineItem, {
          dateRangeDays: 90,
          amountTolerancePercent: amountTolerance === -1 ? 100 : amountTolerance,
          transactionTypes: [...types],
          creditCardId: selectedCardIds.length === 1 ? selectedCardIds[0] : undefined,
          searchQuery: searchQuery || undefined,
        })

        // Apply additional filters
        let filtered = results

        // Filter by multiple cards
        if (selectedCardIds.length > 1) {
          filtered = filtered.filter(tx =>
            tx.credit_card_id && selectedCardIds.includes(tx.credit_card_id)
          )
        }

        // Filter by date range from date picker
        if (fromDate || toDate) {
          filtered = filtered.filter(tx => {
            if (fromDate && tx.date < fromDate) return false
            if (toDate && tx.date > toDate) return false
            return true
          })
        }

        setTransactions(filtered)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch transactions')
      } finally {
        setIsLoading(false)
      }
    }

    fetchTransactions()
  }, [isOpen, lineItem, fromDate, toDate, searchQuery, selectedCardIds, typeFilter, amountTolerance])

  // Score transactions
  const scoredTransactions = useMemo(() => {
    if (!lineItem) return []

    return transactions
      .map(tx => ({
        transaction: tx,
        score: scoreTransactionCandidate(lineItem, tx),
      }))
      .sort((a, b) => b.score.confidence - a.score.confidence)
  }, [transactions, lineItem])

  // Handle link
  const handleLink = async (transactionId: string) => {
    if (!lineItem) return
    setIsLinking(true)
    setError(null)

    try {
      const result = await linkLineItemToTransaction(lineItem.id, transactionId, {
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
    setSelectedCardIds([])
    setTypeFilter('all')
    setAmountTolerance(defaultAmountTolerance)
    setError(null)
    onClose()
  }

  if (!lineItem) return null

  return (
    <Modal.Overlay isOpen={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Modal.Content className="!w-[calc(90vw-4rem)] !max-w-4xl !h-[calc(85vh-4rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex-1">
            <Modal.Title>Link Line Item to Transaction</Modal.Title>
            <div className="text-sm text-text-muted mt-1">
              {lineItem.description || 'No description'} - {formatLineItemAmount(lineItem)}
              {lineItem.transaction_date && ` - ${formatDisplayDate(lineItem.transaction_date)}`}
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

          <TypeFilter value={typeFilter} onChange={setTypeFilter} />

          {creditCards.length > 0 && typeFilter !== 'bank' && (
            <CardMultiSelect
              cards={creditCards}
              value={selectedCardIds}
              onChange={setSelectedCardIds}
            />
          )}

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
          ) : scoredTransactions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              No matching transactions found
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-text-muted/20">
                  <th className="text-start py-2 px-3 text-text-muted font-medium w-16">Type</th>
                  <th className="text-start py-2 px-3 text-text-muted font-medium">Description</th>
                  <th className="text-start py-2 px-3 text-text-muted font-medium w-24">Date</th>
                  <th className="text-end py-2 px-3 text-text-muted font-medium w-28">Amount</th>
                  <th className="text-center py-2 px-3 text-text-muted font-medium w-20">Match</th>
                  <th className="text-center py-2 px-3 text-text-muted font-medium w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {scoredTransactions.map(({ transaction, score }) => {
                  const { merchantName } = parseDescriptionParts(transaction.description)
                  const isCC = transaction.transaction_type === 'cc_purchase'

                  return (
                    <tr
                      key={transaction.id}
                      className="border-b border-text-muted/10 hover:bg-background/30"
                    >
                      <td className="py-2 px-3">
                        {isCC ? (
                          <span className="inline-flex items-center gap-1 text-xs text-purple-400">
                            <CreditCardIcon className="w-3.5 h-3.5" />
                            CC
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-400">
                            <BanknotesIcon className="w-3.5 h-3.5" />
                            Bank
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-medium text-text" dir="auto">{merchantName}</div>
                        {isCC && transaction.credit_card && (
                          <div className="text-xs text-text-muted">
                            {transaction.credit_card.card_name || ''} *{transaction.credit_card.card_last_four}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-text">
                        {formatDisplayDate(transaction.date)}
                      </td>
                      <td className="py-2 px-3 text-end text-text">
                        {formatTransactionAmount(transaction)}
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
                          onClick={() => handleLink(transaction.id)}
                          disabled={isLinking}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 text-xs"
                        >
                          <CheckIcon className="w-3.5 h-3.5" />
                          Link
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 text-xs text-text-muted">
          <div>
            {scoredTransactions.length} transaction{scoredTransactions.length !== 1 ? 's' : ''} found
          </div>
          <div className="flex items-center gap-1">
            <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
            <span>
              {amountTolerance === -1 ? 'Any amount' : amountTolerance === 0 ? 'Exact match' : `${amountTolerance}% tolerance`}
              {typeFilter !== 'all' && ` | ${typeFilter === 'bank' ? 'Bank' : 'CC'} only`}
            </span>
          </div>
        </div>
      </Modal.Content>
    </Modal.Overlay>
  )
}
