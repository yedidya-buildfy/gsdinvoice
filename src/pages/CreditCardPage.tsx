import { useState, useMemo } from 'react'
import { ArrowPathIcon, LinkIcon, TrashIcon, ReceiptPercentIcon, XMarkIcon, CreditCardIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useCreditCards, useCreditCardTransactions, useDeleteCreditCard, type TransactionWithCard } from '@/hooks/useCreditCards'
import type { CreditCard } from '@/types/database'
import { useUpdateTransactionVat } from '@/hooks/useUpdateTransactionVat'
import { CreditCardUploader } from '@/components/creditcard/CreditCardUploader'
import { CreditCardTable } from '@/components/creditcard/CreditCardTable'
import { RangeCalendarCard } from '@/components/ui/date-picker'
import { VatChangeModal } from '@/components/bank/VatChangeModal'
import { CCChargeModal } from '@/components/bank/CCChargeModal'
import { linkCreditCardTransactions } from '@/lib/services/creditCardLinker'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { parseMerchantName, getMerchantBaseKey } from '@/lib/utils/merchantParser'

interface CreditCardFilterState {
  search: string
  dateFrom: string
  dateTo: string
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
              <span className="text-xs text-text-muted">•••• {card.card_last_four}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

export function CreditCardPage() {
  const { user } = useAuth()
  const { creditCards, refetch: refetchCards } = useCreditCards()
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]) // empty = all cards
  const { transactions: allTransactions, isLoading, refetch } = useCreditCardTransactions() // fetch all
  const { isUpdating, updateBatch, updateAllByMerchant, saveMerchantPreferencesBatch } = useUpdateTransactionVat()
  const deleteCardMutation = useDeleteCreditCard()

  const [filters, setFilters] = useState<CreditCardFilterState>({
    search: '',
    dateFrom: '',
    dateTo: '',
  })

  const [sortColumn, setSortColumn] = useState<keyof TransactionWithCard>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isLinking, setIsLinking] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showVatModal, setShowVatModal] = useState(false)
  const [selectedCCChargeId, setSelectedCCChargeId] = useState<string | null>(null)
  const [ccTransactionToLink, setCCTransactionToLink] = useState<string | null>(null)

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
      return true
    })
  }, [transactions, filters])

  // Apply sorting
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      let aVal = a[sortColumn]
      let bVal = b[sortColumn]

      // Handle dates
      if (sortColumn === 'date' || sortColumn === 'value_date') {
        aVal = aVal ? new Date(aVal as string).getTime() : 0
        bVal = bVal ? new Date(bVal as string).getTime() : 0
      }

      if (aVal === null || aVal === undefined) aVal = 0
      if (bVal === null || bVal === undefined) bVal = 0

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredTransactions, sortColumn, sortDirection])

  const handleSort = (column: keyof TransactionWithCard) => {
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
      console.log('[CreditCard] Linking complete')
      refetch()
    } catch (err) {
      console.error('[CreditCard] Linking error:', err)
    } finally {
      setIsLinking(false)
    }
  }

  const handleDelete = async () => {
    if (selectedIds.size === 0) return

    setIsDeleting(true)
    try {
      const idsToDelete = Array.from(selectedIds)

      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('id', idsToDelete)

      if (error) {
        console.error('[CreditCard] Delete failed:', error)
        return
      }

      console.log('[CreditCard] Deleted', idsToDelete.length, 'transactions')
      setSelectedIds(new Set())
      refetch()
    } catch (err) {
      console.error('[CreditCard] Delete error:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  // Clear selection when filters change (selected items may no longer be visible)
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
  }

  const handleApplyToAllPast = async (hasVat: boolean, vatPercentage: number) => {
    if (!user) return
    const uniqueMerchants = [...new Set(selectedMerchantNames)]

    // Update all merchants in parallel
    await Promise.all(
      uniqueMerchants.map((merchantName) =>
        updateAllByMerchant(user.id, merchantName, { hasVat, vatPercentage })
      )
    )

    setShowVatModal(false)
    setSelectedIds(new Set())
    refetch()
  }

  const handleApplyToAllMerchant = async (hasVat: boolean, vatPercentage: number) => {
    if (!user) return
    const uniqueMerchants = [...new Set(selectedMerchantNames)]

    // Update all past transactions in parallel
    await Promise.all(
      uniqueMerchants.map((merchantName) =>
        updateAllByMerchant(user.id, merchantName, { hasVat, vatPercentage })
      )
    )

    // Save preferences for future (single batch operation)
    await saveMerchantPreferencesBatch(user.id, uniqueMerchants, { hasVat, vatPercentage })

    setShowVatModal(false)
    setSelectedIds(new Set())
    refetch()
  }

  const handleApplyToFuture = async (hasVat: boolean, vatPercentage: number) => {
    if (!user) return
    const uniqueMerchants = [...new Set(selectedMerchantNames)]

    // Save preferences for all merchants (single batch operation) and update selected transactions in parallel
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
  }

  const handleUploadComplete = () => {
    console.log('[CreditCardPage] Upload complete, calling refetch')
    refetch()
    refetchCards() // Also refetch cards in case new ones were created
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-text">Credit Card</h1>

      {/* Upload section */}
      <div className="bg-surface rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text mb-4">Import Credit Card Statement</h2>
        <CreditCardUploader onUploadComplete={handleUploadComplete} />
      </div>

      {/* Transactions section */}
      <div className="bg-surface rounded-lg p-6">

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">
            Transactions
            {!isLoading && transactions.length > 0 && (
              <span className="text-sm font-normal text-text-muted ms-2">
                ({filteredTransactions.length} of {transactions.length})
              </span>
            )}
          </h2>

          {/* Action buttons - only show when items selected or re-link always available */}
          <div className="flex items-center gap-2">
            {/* Re-link button - always visible */}
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

            {/* Set VAT button - only show when items selected */}
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

            {/* Delete button - only show when items selected */}
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

        {/* Filters - only show if there are transactions */}
        {allTransactions.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-3 items-center">
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
          <CreditCardTable
            transactions={sortedTransactions}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onBankChargeClick={setSelectedCCChargeId}
            onLinkCCTransaction={setCCTransactionToLink}
          />
        )}
      </div>

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

      {/* CC Charge Details Modal */}
      <CCChargeModal
        isOpen={!!selectedCCChargeId || !!ccTransactionToLink}
        onClose={() => {
          setSelectedCCChargeId(null)
          setCCTransactionToLink(null)
          refetch() // Refresh data after linking
        }}
        bankTransactionId={selectedCCChargeId}
        ccTransactionIdToLink={ccTransactionToLink}
      />
    </div>
  )
}
