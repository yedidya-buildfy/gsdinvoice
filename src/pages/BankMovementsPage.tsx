import { useState, useMemo } from 'react'
import { TrashIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline'
import { useTransactions } from '@/hooks/useTransactions'
import { useUpdateTransactionVat } from '@/hooks/useUpdateTransactionVat'
import { BankUploader } from '@/components/bank/BankUploader'
import { TransactionFilters, type TransactionFilterState } from '@/components/bank/TransactionFilters'
import { TransactionTable } from '@/components/bank/TransactionTable'
import { VatChangeModal } from '@/components/bank/VatChangeModal'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { parseMerchantName, getMerchantBaseKey } from '@/lib/utils/merchantParser'
import type { Transaction } from '@/types/database'

export function BankMovementsPage() {
  const { user } = useAuth()
  const { transactions, isLoading, refetch } = useTransactions()
  const { isUpdating, updateBatch, updateAllByMerchant, saveMerchantPreferencesBatch } = useUpdateTransactionVat()

  const [filters, setFilters] = useState<TransactionFilterState>({
    search: '',
    dateFrom: '',
    dateTo: '',
    type: 'all',
  })

  const [sortColumn, setSortColumn] = useState<keyof Transaction>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [showVatModal, setShowVatModal] = useState(false)

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

  const handleSort = (column: keyof Transaction) => {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('desc')
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
        console.error('[BankMovements] Delete failed:', error)
        return
      }

      console.log('[BankMovements] Deleted', idsToDelete.length, 'transactions')
      setSelectedIds(new Set())
      refetch()
    } catch (err) {
      console.error('[BankMovements] Delete error:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  // Clear selection when filters change (selected items may no longer be visible)
  const handleFiltersChange = (newFilters: TransactionFilterState) => {
    setFilters(newFilters)
    setSelectedIds(new Set())
  }

  // Get selected transactions (only expenses, not income)
  const selectedTransactions = useMemo(() => {
    return sortedTransactions.filter((tx) => selectedIds.has(tx.id) && !tx.is_income)
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

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-text">Bank Movements</h1>

      {/* Upload section */}
      <div className="bg-surface rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text mb-4">Import Bank Statement</h2>
        <BankUploader onUploadComplete={() => {
          console.log('[BankMovementsPage] Upload complete, calling refetch')
          refetch()
        }} />
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

          {/* Action buttons - only show when items selected */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              {/* Set VAT button - only if expense transactions selected */}
              {selectedTransactions.length > 0 && (
                <button
                  type="button"
                  onClick={handleOpenVatModal}
                  disabled={isUpdating}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ReceiptPercentIcon className="w-4 h-4" />
                  {isUpdating ? 'Updating...' : `Set VAT (${selectedTransactions.length})`}
                </button>
              )}

              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <TrashIcon className="w-4 h-4" />
                {isDeleting ? 'Deleting...' : `Delete (${selectedIds.size})`}
              </button>
            </div>
          )}
        </div>

        {/* Filters - only show if there are transactions */}
        {transactions.length > 0 && (
          <div className="mb-4">
            <TransactionFilters filters={filters} onChange={handleFiltersChange} />
          </div>
        )}

        {/* Table or empty state */}
        {isLoading ? (
          <TransactionTable
            transactions={[]}
            isLoading
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
        ) : transactions.length === 0 ? (
          <p className="text-text-muted text-center py-8">
            No transactions yet. Import a bank statement above to get started.
          </p>
        ) : filteredTransactions.length === 0 ? (
          <p className="text-text-muted text-center py-8">
            No transactions match your filters.
          </p>
        ) : (
          <TransactionTable
            transactions={sortedTransactions}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
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
    </div>
  )
}
