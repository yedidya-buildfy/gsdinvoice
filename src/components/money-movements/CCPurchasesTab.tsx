import { useState, useMemo, useEffect } from 'react'
import { ArrowPathIcon, LinkIcon, TrashIcon, ReceiptPercentIcon, XMarkIcon, CreditCardIcon, MagnifyingGlassIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { exportTransactionsToCSV } from '@/lib/export/csvExporter'
import { useExport } from '@/hooks/useExport'
import { useCreditCards, useCreditCardTransactions, type TransactionWithCard } from '@/hooks/useCreditCards'
import type { CreditCard, Transaction } from '@/types/database'
import { useUpdateTransactionVat } from '@/hooks/useUpdateTransactionVat'
import { useTransactionLinkCounts } from '@/hooks/useLineItemLinks'
import { CreditCardUploader } from '@/components/creditcard/CreditCardUploader'
import { CreditCardTable, type CCSortColumn } from '@/components/creditcard/CreditCardTable'
import { RangeCalendarCard } from '@/components/ui/date-picker'
import { VatChangeModal } from '@/components/bank/VatChangeModal'
import { TransactionLinkModal } from '@/components/money-movements/TransactionLinkModal'
import { TransactionLineItemsDrawer } from '@/components/money-movements/TransactionLineItemsDrawer'
import { Pagination } from '@/components/ui/Pagination'
import { useSettingsStore } from '@/stores/settingsStore'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import { ColumnVisibilityDropdown } from '@/components/ui/ColumnVisibilityDropdown'
import { CREDIT_CARD_COLUMNS } from '@/types/columnVisibility'
import type { CreditCardColumnKey } from '@/types/columnVisibility'
import { linkCreditCardTransactions } from '@/lib/services/creditCardLinker'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { parseMerchantName } from '@/lib/utils/merchantParser'

interface CreditCardFilterState {
  search: string
  dateFrom: string
  dateTo: string
}

// Represents a card + billing month combination
interface BillingPeriod {
  key: string // 'cardId:YYYY-MM'
  cardId: string
  cardName: string
  cardLastFour: string
  month: string // 'YYYY-MM'
  monthDisplay: string // 'January 2025'
}

// Multi-select component for credit cards
function CardMultiSelect({
  cards,
  value,
  onChange,
}: {
  cards: CreditCard[]
  value: string[] // empty array means "all"
  onChange: (value: string[]) => void
}) {
  const toggleCard = (cardId: string) => {
    if (value.includes(cardId)) {
      onChange(value.filter((id) => id !== cardId))
    } else {
      onChange([...value, cardId])
    }
  }

  const getCardDisplay = (card: CreditCard) => {
    return card.card_name || `Card ending in ${card.card_last_four}`
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
        className="flex items-center gap-2 px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-sm"
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
        {/* All option */}
        <label
          className="flex items-center gap-2 px-3 py-2 hover:bg-background/50 cursor-pointer text-sm border-b border-text-muted/10"
        >
          <input
            type="checkbox"
            checked={value.length === 0}
            onChange={() => onChange([])}
            className="checkbox-dark"
          />
          <span className="text-text font-medium">All Cards</span>
        </label>
        {/* Individual cards */}
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
              <span className="text-xs text-text-muted">**** {card.card_last_four}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

// Billing period filter (card + month combinations)
function BillingPeriodFilter({
  periods,
  value,
  onChange,
}: {
  periods: BillingPeriod[]
  value: string[] // Array of 'cardId:YYYY-MM' keys, empty = all
  onChange: (value: string[]) => void
}) {
  const togglePeriod = (key: string) => {
    if (value.includes(key)) {
      onChange(value.filter((k) => k !== key))
    } else {
      onChange([...value, key])
    }
  }

  const displayText =
    value.length === 0
      ? 'All Billing Periods'
      : value.length === 1
        ? (() => {
            const period = periods.find((p) => p.key === value[0])
            return period ? `${period.cardLastFour} - ${period.monthDisplay}` : 'Selected'
          })()
        : `${value.length} periods`

  if (periods.length === 0) return null

  // Group periods by month for better organization
  const periodsByMonth = periods.reduce((acc, period) => {
    if (!acc[period.month]) {
      acc[period.month] = { display: period.monthDisplay, periods: [] }
    }
    acc[period.month].periods.push(period)
    return acc
  }, {} as Record<string, { display: string; periods: BillingPeriod[] }>)

  const sortedMonths = Object.keys(periodsByMonth).sort().reverse()

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-sm"
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
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-text-muted/20 rounded-lg shadow-lg min-w-[280px] max-h-[400px] overflow-y-auto">
        {/* All option */}
        <label className="flex items-center gap-2 px-3 py-2 hover:bg-background/50 cursor-pointer text-sm border-b border-text-muted/10">
          <input
            type="checkbox"
            checked={value.length === 0}
            onChange={() => onChange([])}
            className="checkbox-dark"
          />
          <span className="text-text font-medium">All Billing Periods</span>
        </label>
        {/* Periods grouped by month */}
        {sortedMonths.map((month) => (
          <div key={month}>
            <div className="px-3 py-1.5 bg-background/30 text-xs font-medium text-text-muted">
              {periodsByMonth[month].display}
            </div>
            {periodsByMonth[month].periods.map((period) => (
              <label
                key={period.key}
                className="flex items-center gap-2 px-3 py-2 hover:bg-background/50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={value.includes(period.key)}
                  onChange={() => togglePeriod(period.key)}
                  className="checkbox-dark"
                />
                <div className="flex flex-col">
                  <span className="text-text">{period.cardName || 'Unnamed Card'}</span>
                  <span className="text-xs text-text-muted">**** {period.cardLastFour}</span>
                </div>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

interface CCPurchasesTabProps {
  onBankChargeClick?: (bankTransactionId: string) => void
  onLinkCCTransaction: (ccTransactionId: string) => void
  onRefetch?: () => void
}

export function CCPurchasesTab({ onBankChargeClick, onLinkCCTransaction, onRefetch }: CCPurchasesTabProps) {
  const { user } = useAuth()
  const { creditCards, refetch: refetchCards } = useCreditCards()
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]) // empty = all cards
  const { transactions: allTransactions, isLoading, refetch } = useCreditCardTransactions()
  const { isUpdating, updateBatch, updateAllByMerchant, saveMerchantPreferencesBatch } = useUpdateTransactionVat()
  const { markExported } = useExport()
  const [isExporting, setIsExporting] = useState(false)
  const { tablePageSize } = useSettingsStore()
  const { visibility, toggle, reset } = useColumnVisibility('creditCard')

  // CC Purchases shows Invoice column when line item linking is available
  const activeCCColumns = useMemo(() => {
    const active = new Set<CreditCardColumnKey>([
      'date', 'amount', 'currency', 'vat', 'vatPercent', 'vatAmount',
      'billing', 'status', 'card', 'link', 'invoice',
    ])
    return active
  }, [])

  const [filters, setFilters] = useState<CreditCardFilterState>({
    search: '',
    dateFrom: '',
    dateTo: '',
  })
  const [selectedBillingPeriods, setSelectedBillingPeriods] = useState<string[]>([]) // 'cardId:YYYY-MM' keys

  const [sortColumn, setSortColumn] = useState<CCSortColumn>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isLinking, setIsLinking] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showVatModal, setShowVatModal] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  // Line item link state
  const [linkTransaction, setLinkTransaction] = useState<Transaction | null>(null)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showLinkDrawer, setShowLinkDrawer] = useState(false)

  // Calculate available billing periods (card + month combinations)
  const availableBillingPeriods = useMemo(() => {
    const periodsMap = new Map<string, BillingPeriod>()

    allTransactions.forEach((tx) => {
      if (tx.value_date && tx.credit_card_id && tx.credit_card) {
        const month = tx.value_date.slice(0, 7) // 'YYYY-MM'
        const key = `${tx.credit_card_id}:${month}`

        if (!periodsMap.has(key)) {
          const [year, monthNum] = month.split('-')
          const date = new Date(parseInt(year), parseInt(monthNum) - 1)
          const monthDisplay = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

          periodsMap.set(key, {
            key,
            cardId: tx.credit_card_id,
            cardName: tx.credit_card.card_name || '',
            cardLastFour: tx.credit_card.card_last_four,
            month,
            monthDisplay,
          })
        }
      }
    })

    return Array.from(periodsMap.values())
  }, [allTransactions])

  // Fetch link counts for transactions
  const transactionIds = useMemo(() => allTransactions.map(tx => tx.id), [allTransactions])
  const { linkCounts, refetch: refetchLinkCounts } = useTransactionLinkCounts({
    transactionIds,
    enabled: allTransactions.length > 0,
  })

  // Filter by selected cards first (using new credit_card_id field)
  const transactions = useMemo(() => {
    if (selectedCardIds.length === 0) return allTransactions // All cards
    return allTransactions.filter((tx) =>
      tx.credit_card_id && selectedCardIds.includes(tx.credit_card_id)
    )
  }, [allTransactions, selectedCardIds])

  // Apply filters
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Search filter
      if (filters.search && !tx.description.toLowerCase().includes(filters.search.toLowerCase())) {
        return false
      }
      // Date range
      if (filters.dateFrom && tx.date < filters.dateFrom) return false
      if (filters.dateTo && tx.date > filters.dateTo) return false
      // Billing period filter (card + month combination)
      if (selectedBillingPeriods.length > 0) {
        if (!tx.value_date || !tx.credit_card_id) return false
        const txMonth = tx.value_date.slice(0, 7) // 'YYYY-MM'
        const txKey = `${tx.credit_card_id}:${txMonth}`
        if (!selectedBillingPeriods.includes(txKey)) return false
      }
      return true
    })
  }, [transactions, filters, selectedBillingPeriods])

  // Apply sorting
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      let aVal: string | number | boolean | null | undefined
      let bVal: string | number | boolean | null | undefined

      // Handle special columns
      if (sortColumn === 'credit_card_id') {
        // Sort by card last four digits
        aVal = a.credit_card?.card_last_four || ''
        bVal = b.credit_card?.card_last_four || ''
      } else if (sortColumn === 'vat_amount') {
        // Calculated VAT amount
        const aHasVat = a.has_vat ?? false
        const bHasVat = b.has_vat ?? false
        const aVatPct = a.vat_percentage ?? 18
        const bVatPct = b.vat_percentage ?? 18
        aVal = aHasVat ? Math.round(a.amount_agorot * aVatPct / (100 + aVatPct)) : 0
        bVal = bHasVat ? Math.round(b.amount_agorot * bVatPct / (100 + bVatPct)) : 0
      } else if (sortColumn === 'linked_bank_transaction_id') {
        // Sort by linked status (linked first when desc)
        aVal = a.credit_card_id !== null ? 1 : 0
        bVal = b.credit_card_id !== null ? 1 : 0
      } else if (sortColumn === 'cc_bank_link_id') {
        // Sort by whether has bank link
        aVal = a.cc_bank_link_id ? 1 : 0
        bVal = b.cc_bank_link_id ? 1 : 0
      } else if (sortColumn === 'credit_card') {
        // Skip sorting by the credit_card object itself
        return 0
      } else {
        // Cast to keyof excluding credit_card
        const col = sortColumn as keyof Omit<TransactionWithCard, 'credit_card'>
        aVal = a[col] as string | number | boolean | null | undefined
        bVal = b[col] as string | number | boolean | null | undefined
      }

      // Handle dates
      if (sortColumn === 'date' || sortColumn === 'value_date') {
        aVal = aVal ? new Date(aVal as string).getTime() : 0
        bVal = bVal ? new Date(bVal as string).getTime() : 0
      }

      // Handle nulls
      if (aVal === null || aVal === undefined) aVal = sortColumn === 'foreign_currency' ? '' : 0
      if (bVal === null || bVal === undefined) bVal = sortColumn === 'foreign_currency' ? '' : 0

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredTransactions, sortColumn, sortDirection])

  // Reset to page 1 when filters, sort, or page size change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters, selectedBillingPeriods, selectedCardIds, sortColumn, sortDirection, tablePageSize])

  // Calculate pagination
  const totalPages = Math.ceil(sortedTransactions.length / tablePageSize)
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * tablePageSize
    return sortedTransactions.slice(start, start + tablePageSize)
  }, [sortedTransactions, currentPage, tablePageSize])

  const handleSort = (column: CCSortColumn) => {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  const handleRelink = async () => {
    if (!user) return
    setIsLinking(true)
    try {
      // If specific cards selected, relink for each; otherwise relink all
      if (selectedCardIds.length > 0) {
        for (const cardId of selectedCardIds) {
          await linkCreditCardTransactions(user.id, cardId)
        }
      } else {
        await linkCreditCardTransactions(user.id)
      }
      console.log('[CCPurchasesTab] Linking complete')
      refetch()
      onRefetch?.()
    } catch (err) {
      console.error('[CCPurchasesTab] Linking error:', err)
    } finally {
      setIsLinking(false)
    }
  }

  const handleDelete = async () => {
    if (selectedIds.size === 0) return

    setIsDeleting(true)
    try {
      const idsToDelete = Array.from(selectedIds)

      const { data, error } = await supabase.rpc('bulk_delete_transactions', {
        ids: idsToDelete
      })

      if (error) {
        console.error('[CCPurchasesTab] Delete failed:', error)
        return
      }

      console.log('[CCPurchasesTab] Deleted', data, 'transactions')
      setSelectedIds(new Set())
      refetch()
      onRefetch?.()
    } catch (err) {
      console.error('[CCPurchasesTab] Delete error:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  // Clear selection when filters change
  const handleFiltersChange = (newFilters: CreditCardFilterState) => {
    setFilters(newFilters)
    setSelectedIds(new Set())
  }

  const handleDateChange = (startDate: string, endDate: string) => {
    handleFiltersChange({ ...filters, dateFrom: startDate, dateTo: endDate })
  }

  // Get selected transactions (credit card transactions are always expenses)
  const selectedTransactions = useMemo(() => {
    return sortedTransactions.filter((tx) => selectedIds.has(tx.id))
  }, [sortedTransactions, selectedIds])

  // Get merchant names from selected transactions
  const selectedMerchantNames = useMemo(() => {
    return selectedTransactions.map((tx) => parseMerchantName(tx.description))
  }, [selectedTransactions])

  const handleOpenVatModal = () => {
    if (selectedTransactions.length === 0) return
    setShowVatModal(true)
  }

  const handleApplyToSelected = async (hasVat: boolean, vatPercentage: number) => {
    await updateBatch(
      selectedTransactions.map((tx) => ({ id: tx.id, amount_agorot: tx.amount_agorot })),
      { hasVat, vatPercentage }
    )
    setShowVatModal(false)
    setSelectedIds(new Set())
    refetch()
    onRefetch?.()
  }

  const handleApplyToAllPast = async (hasVat: boolean, vatPercentage: number) => {
    if (!user) return
    const uniqueMerchants = [...new Set(selectedMerchantNames)]

    await Promise.all(
      uniqueMerchants.map((merchantName) =>
        updateAllByMerchant(user.id, merchantName, { hasVat, vatPercentage })
      )
    )

    setShowVatModal(false)
    setSelectedIds(new Set())
    refetch()
    onRefetch?.()
  }

  const handleApplyToAllMerchant = async (hasVat: boolean, vatPercentage: number) => {
    if (!user) return
    const uniqueMerchants = [...new Set(selectedMerchantNames)]

    await Promise.all(
      uniqueMerchants.map((merchantName) =>
        updateAllByMerchant(user.id, merchantName, { hasVat, vatPercentage })
      )
    )

    await saveMerchantPreferencesBatch(user.id, uniqueMerchants, { hasVat, vatPercentage })

    setShowVatModal(false)
    setSelectedIds(new Set())
    refetch()
    onRefetch?.()
  }

  const handleApplyToFuture = async (hasVat: boolean, vatPercentage: number) => {
    if (!user) return
    const uniqueMerchants = [...new Set(selectedMerchantNames)]

    await Promise.all([
      saveMerchantPreferencesBatch(user.id, uniqueMerchants, { hasVat, vatPercentage }),
      updateBatch(
        selectedTransactions.map((tx) => ({ id: tx.id, amount_agorot: tx.amount_agorot })),
        { hasVat, vatPercentage }
      ),
    ])

    setShowVatModal(false)
    setSelectedIds(new Set())
    refetch()
    onRefetch?.()
  }

  const handleUploadComplete = () => {
    console.log('[CCPurchasesTab] Upload complete, calling refetch')
    refetch()
    refetchCards()
    onRefetch?.()
  }

  // Handle line item link click
  const handleLineItemLinkClick = (tx: Transaction) => {
    setLinkTransaction(tx)
    // If already has links, show drawer; otherwise show link modal
    const count = linkCounts.get(tx.id) || 0
    if (count > 0) {
      setShowLinkDrawer(true)
    } else {
      setShowLinkModal(true)
    }
  }

  const handleLinkComplete = () => {
    refetchLinkCounts()
    refetch()
    onRefetch?.()
  }

  const handleExport = async () => {
    const toExport = selectedIds.size > 0
      ? sortedTransactions.filter((tx) => selectedIds.has(tx.id))
      : filteredTransactions
    if (toExport.length === 0) return

    setIsExporting(true)
    try {
      exportTransactionsToCSV(toExport, 'cc_purchases')
      await markExported('transactions', toExport.map((tx) => tx.id))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload section */}
      <div className="bg-background rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text mb-3">Import Credit Card Statement</h3>
        <CreditCardUploader onUploadComplete={handleUploadComplete} />
      </div>

      {/* Header with count and actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">
          Transactions
          {!isLoading && transactions.length > 0 && (
            <span className="text-sm font-normal text-text-muted ms-2">
              ({filteredTransactions.length} of {transactions.length})
            </span>
          )}
        </h2>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Export button - always visible */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || filteredTransactions.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            {isExporting
              ? 'Exporting...'
              : selectedIds.size > 0
                ? `Export CSV (${selectedIds.size})`
                : 'Export CSV'}
          </button>

          {/* Re-link button */}
          <button
            type="button"
            onClick={handleRelink}
            disabled={isLinking}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLinking ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <LinkIcon className="w-4 h-4" />
            )}
            {isLinking ? 'Linking...' : 'Re-link Transactions'}
          </button>

          {/* Set VAT button */}
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleOpenVatModal}
              disabled={isUpdating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ReceiptPercentIcon className="w-4 h-4" />
              {isUpdating ? 'Updating...' : `Set VAT (${selectedIds.size})`}
            </button>
          )}

          {/* Delete button */}
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrashIcon className="w-4 h-4" />
              {isDeleting ? 'Deleting...' : `Delete (${selectedIds.size})`}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {allTransactions.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          {/* Date range picker */}
          <RangeCalendarCard
            startDate={filters.dateFrom}
            endDate={filters.dateTo}
            onChange={handleDateChange}
          />

          {/* Card filter */}
          {creditCards.length > 0 && (
            <CardMultiSelect
              cards={creditCards}
              value={selectedCardIds}
              onChange={setSelectedCardIds}
            />
          )}

          {/* Billing period filter (card + month) */}
          <BillingPeriodFilter
            periods={availableBillingPeriods}
            value={selectedBillingPeriods}
            onChange={setSelectedBillingPeriods}
          />

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Search descriptions..."
              value={filters.search}
              onChange={(e) => handleFiltersChange({ ...filters, search: e.target.value })}
              className="w-full ps-10 pe-4 py-2 bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => handleFiltersChange({ ...filters, search: '' })}
                className="absolute end-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-background/50"
              >
                <XMarkIcon className="w-4 h-4 text-text-muted hover:text-text" />
              </button>
            )}
          </div>

          <ColumnVisibilityDropdown
            columns={CREDIT_CARD_COLUMNS}
            visibility={visibility}
            onToggle={toggle}
            onReset={reset}
            activeConditionalColumns={activeCCColumns}
          />
        </div>
      )}

      {/* Table or empty state */}
      {isLoading ? (
        <CreditCardTable
          transactions={[]}
          isLoading
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ) : transactions.length === 0 ? (
        <p className="text-text-muted text-center py-8">
          No credit card transactions yet. Import a statement above to get started.
        </p>
      ) : filteredTransactions.length === 0 ? (
        <p className="text-text-muted text-center py-8">
          No transactions match your filters.
        </p>
      ) : (
        <>
          <CreditCardTable
            transactions={paginatedTransactions}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onBankChargeClick={onBankChargeClick}
            onLinkCCTransaction={onLinkCCTransaction}
            lineItemLinkCounts={linkCounts}
            onLineItemLinkClick={handleLineItemLinkClick}
          />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedTransactions.length}
            pageSize={tablePageSize}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {/* VAT Change Modal */}
      <VatChangeModal
        isOpen={showVatModal}
        onClose={() => setShowVatModal(false)}
        selectedCount={selectedTransactions.length}
        merchantNames={selectedMerchantNames}
        onApplyToSelected={handleApplyToSelected}
        onApplyToAllPast={handleApplyToAllPast}
        onApplyToAllMerchant={handleApplyToAllMerchant}
        onApplyToFuture={handleApplyToFuture}
        isLoading={isUpdating}
      />

      {/* Line Item Link Modal */}
      <TransactionLinkModal
        isOpen={showLinkModal}
        onClose={() => {
          setShowLinkModal(false)
          setLinkTransaction(null)
        }}
        transaction={linkTransaction}
        onLinkComplete={handleLinkComplete}
      />

      {/* Line Item Link Drawer */}
      <TransactionLineItemsDrawer
        isOpen={showLinkDrawer}
        onClose={() => {
          setShowLinkDrawer(false)
          setLinkTransaction(null)
        }}
        transaction={linkTransaction}
        onUnlinkComplete={handleLinkComplete}
      />
    </div>
  )
}
