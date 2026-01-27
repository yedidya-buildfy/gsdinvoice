import { useState, useMemo } from 'react'
import { ArrowPathIcon, LinkIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useCreditCards, useCreditCardTransactions, type TransactionWithCard } from '@/hooks/useCreditCards'
import { CreditCardUploader } from '@/components/creditcard/CreditCardUploader'
import { CreditCardTable } from '@/components/creditcard/CreditCardTable'
import { TransactionFilters, type TransactionFilterState } from '@/components/bank/TransactionFilters'
import { linkCreditCardTransactions } from '@/lib/services/creditCardLinker'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export function CreditCardPage() {
  const { user } = useAuth()
  const { creditCards, isLoading: cardsLoading, refetch: refetchCards } = useCreditCards()
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const { transactions, isLoading, refetch } = useCreditCardTransactions(selectedCardId || undefined)

  const [filters, setFilters] = useState<TransactionFilterState>({
    search: '',
    dateFrom: '',
    dateTo: '',
    type: 'all',
  })

  const [sortColumn, setSortColumn] = useState<keyof TransactionWithCard>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isLinking, setIsLinking] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

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
      // Type filter
      if (filters.type === 'income' && !tx.is_income) return false
      if (filters.type === 'expense' && tx.is_income) return false
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
      const result = await linkCreditCardTransactions(user.id, selectedCardId || undefined)
      console.log('[CreditCard] Linking result:', result)
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
  const handleFiltersChange = (newFilters: TransactionFilterState) => {
    setFilters(newFilters)
    setSelectedIds(new Set())
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
        {/* Card selector - above transactions header */}
        {creditCards && creditCards.length > 0 && (
          <div className="flex items-center gap-4 mb-4">
            <label className="text-sm text-text-muted">Filter by card:</label>
            <select
              value={selectedCardId || 'all'}
              onChange={(e) => setSelectedCardId(e.target.value === 'all' ? null : e.target.value)}
              className="px-3 py-2 bg-background border border-text-muted/20 rounded-lg text-text"
            >
              <option value="all">All Cards</option>
              {creditCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.card_name || `****${card.card_last_four}`}
                </option>
              ))}
            </select>
          </div>
        )}

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
        {transactions.length > 0 && (
          <div className="mb-4">
            <TransactionFilters filters={filters} onChange={handleFiltersChange} />
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
          />
        )}
      </div>
    </div>
  )
}
