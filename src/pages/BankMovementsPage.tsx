import { useState, useMemo } from 'react'
import type { Key } from 'react-aria-components'
import { TrashIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline'
import { useTransactions } from '@/hooks/useTransactions'
import { useUpdateTransactionVat } from '@/hooks/useUpdateTransactionVat'
import { useCCBankMatchResults } from '@/hooks/useCCBankMatchResults'
import { BankUploader } from '@/components/bank/BankUploader'
import { TransactionFilters, type TransactionFilterState } from '@/components/bank/TransactionFilters'
import { TransactionTable } from '@/components/bank/TransactionTable'
import { VatChangeModal } from '@/components/bank/VatChangeModal'
import { CCChargeModal } from '@/components/bank/CCChargeModal'
import { Tabs, type TabItem } from '@/components/ui/base/tabs/tabs'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { parseMerchantName } from '@/lib/utils/merchantParser'
import type { Transaction } from '@/types/database'

const transactionTabs: TabItem[] = [
  { id: 'bank', label: 'Transactions' },
  { id: 'cc', label: 'Credit Card Transactions' },
]

export function BankMovementsPage() {
  const { user } = useAuth()
  const { transactions, isLoading, refetch } = useTransactions()
  const { isUpdating, updateBatch, updateAllByMerchant, saveMerchantPreferencesBatch } = useUpdateTransactionVat()
  const { matchResults } = useCCBankMatchResults()

  // Create lookup map for CC charge match data
  const ccChargeMatchData = useMemo(() => {
    const map = new Map<string, { matchPercentage: number; matchedCount: number }>()
    for (const result of matchResults) {
      map.set(result.bank_transaction_id, {
        matchPercentage: result.match_confidence,
        matchedCount: result.cc_transaction_count,
      })
    }
    return map
  }, [matchResults])

  const [selectedTab, setSelectedTab] = useState<Key>('bank')
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
  const [selectedCCChargeId, setSelectedCCChargeId] = useState<string | null>(null)

  // Separate transactions by type (regular bank vs CC charges)
  const bankTransactions = useMemo(() => {
    // Regular bank transactions (not CC charges)
    return transactions.filter((tx) =>
      tx.transaction_type === 'bank_regular' ||
      (!tx.transaction_type && !tx.is_credit_card_charge)
    )
  }, [transactions])

  const ccChargeTransactions = useMemo(() => {
    // Bank CC charges (the rows that open CCChargeModal when clicked)
    return transactions.filter((tx) =>
      tx.transaction_type === 'bank_cc_charge' ||
      tx.is_credit_card_charge
    )
  }, [transactions])

  // Get the active transaction list based on selected tab
  const activeTransactions = selectedTab === 'bank' ? bankTransactions : ccChargeTransactions

  // Apply filters
  const filteredTransactions = useMemo(() => {
    return activeTransactions.filter((tx) => {
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
  }, [activeTransactions, filters])

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
        {/* Tabs with counts */}
        <Tabs selectedKey={selectedTab} onSelectionChange={(key) => {
          setSelectedTab(key)
          setSelectedIds(new Set()) // Clear selection when switching tabs
          setFilters({ search: '', dateFrom: '', dateTo: '', type: 'all' }) // Reset filters
        }}>
          <div className="flex items-center justify-between mb-4">
            <Tabs.List type="underline" className="justify-start" items={transactionTabs.map(tab => {
              // Show (filtered of total) for active tab, (total) for inactive tab
              const isBankTab = tab.id === 'bank'
              const total = isBankTab ? bankTransactions.length : ccChargeTransactions.length
              const isActive = selectedTab === tab.id
              const countLabel = !isLoading && total > 0
                ? isActive
                  ? ` (${filteredTransactions.length} of ${total})`
                  : ` (${total})`
                : ''
              return {
                ...tab,
                label: isBankTab
                  ? `Transactions${countLabel}`
                  : `Credit Card Transactions${countLabel}`
              }
            })}>
              {(tab) => <Tabs.Item key={tab.id} id={tab.id} label={tab.label} type="underline" />}
            </Tabs.List>

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
          {activeTransactions.length > 0 && (
            <div className="mb-4">
              <TransactionFilters filters={filters} onChange={handleFiltersChange} />
            </div>
          )}

          {/* Bank Transactions Tab Panel */}
          <Tabs.Panel id="bank">
            {isLoading ? (
              <TransactionTable
                transactions={[]}
                isLoading
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            ) : bankTransactions.length === 0 ? (
              <p className="text-text-muted text-center py-8">
                No bank transactions yet. Import a bank statement above to get started.
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
          </Tabs.Panel>

          {/* Credit Card Transactions Tab Panel */}
          <Tabs.Panel id="cc">
            {isLoading ? (
              <TransactionTable
                transactions={[]}
                isLoading
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                ccChargeMatchData={ccChargeMatchData}
              />
            ) : ccChargeTransactions.length === 0 ? (
              <p className="text-text-muted text-center py-8">
                No credit card charges yet. Import a bank statement with CC charges to get started.
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
                ccChargeMatchData={ccChargeMatchData}
                onCCChargeClick={setSelectedCCChargeId}
              />
            )}
          </Tabs.Panel>
        </Tabs>
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
        isOpen={!!selectedCCChargeId}
        onClose={() => setSelectedCCChargeId(null)}
        bankTransactionId={selectedCCChargeId}
      />
    </div>
  )
}
