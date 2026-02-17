import { useState, useMemo, useEffect } from 'react'
import { TrashIcon, ReceiptPercentIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { TRANSACTION_TYPE } from '@/constants'
import { useTransactions } from '@/hooks/useTransactions'
import { useUpdateTransactionVat } from '@/hooks/useUpdateTransactionVat'
import { useCCBankMatchResults } from '@/hooks/useCCBankMatchResults'
import { useTransactionLinkCounts } from '@/hooks/useLineItemLinks'
import { TransactionFilters, type TransactionFilterState } from '@/components/bank/TransactionFilters'
import { TransactionTable } from '@/components/bank/TransactionTable'
import { VatChangeModal } from '@/components/bank/VatChangeModal'
import { TransactionLinkModal } from '@/components/money-movements/TransactionLinkModal'
import { TransactionLineItemsDrawer } from '@/components/money-movements/TransactionLineItemsDrawer'
import { Pagination } from '@/components/ui/Pagination'
import { useSettingsStore } from '@/stores/settingsStore'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import { ColumnVisibilityDropdown } from '@/components/ui/ColumnVisibilityDropdown'
import { TRANSACTION_COLUMNS } from '@/types/columnVisibility'
import type { TransactionColumnKey } from '@/types/columnVisibility'
import { supabase } from '@/lib/supabase'
import { exportTransactionsToCSV } from '@/lib/export/csvExporter'
import { useExport } from '@/hooks/useExport'
import { useAuth } from '@/contexts/AuthContext'
import { parseMerchantName } from '@/lib/utils/merchantParser'
import type { Transaction } from '@/types/database'

interface CCChargesTabProps {
  onCCChargeClick: (bankTransactionId: string) => void
  onRefetch?: () => void
}

export function CCChargesTab({ onCCChargeClick, onRefetch }: CCChargesTabProps) {
  const { user } = useAuth()
  const { transactions, isLoading, refetch } = useTransactions()
  const { isUpdating, updateBatch, updateAllByMerchant, saveMerchantPreferencesBatch } = useUpdateTransactionVat()
  const { matchResults } = useCCBankMatchResults()
  const { tablePageSize } = useSettingsStore()
  const { visibility, toggle, reset } = useColumnVisibility('transaction')
  const { markExported } = useExport()
  const [isExporting, setIsExporting] = useState(false)

  // CCChargesTab shows Invoice, Match%, and Matched columns
  const activeTransactionColumns = useMemo(() => {
    const active = new Set<TransactionColumnKey>([
      'date', 'amount', 'vat', 'vatPercent', 'vatAmount', 'reference',
      'invoice', 'matchPercent', 'matched',
    ])
    return active
  }, [])

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
  const [currentPage, setCurrentPage] = useState(1)

  // Line item link state
  const [linkTransaction, setLinkTransaction] = useState<Transaction | null>(null)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showLinkDrawer, setShowLinkDrawer] = useState(false)

  // Filter to only bank_cc_charge transactions
  const ccChargeTransactions = useMemo(() => {
    return transactions.filter((tx) =>
      tx.transaction_type === TRANSACTION_TYPE.BANK_CC_CHARGE ||
      tx.is_credit_card_charge
    )
  }, [transactions])

  // Fetch link counts for transactions
  const transactionIds = useMemo(() => ccChargeTransactions.map(tx => tx.id), [ccChargeTransactions])
  const { linkCounts, refetch: refetchLinkCounts } = useTransactionLinkCounts({
    transactionIds,
    enabled: ccChargeTransactions.length > 0,
  })

  // Apply filters
  const filteredTransactions = useMemo(() => {
    return ccChargeTransactions.filter((tx) => {
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
  }, [ccChargeTransactions, filters])

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

  // Reset to page 1 when filters, sort, or page size change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters, sortColumn, sortDirection, tablePageSize])

  // Calculate pagination
  const totalPages = Math.ceil(sortedTransactions.length / tablePageSize)
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * tablePageSize
    return sortedTransactions.slice(start, start + tablePageSize)
  }, [sortedTransactions, currentPage, tablePageSize])

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

      const { data, error } = await supabase.rpc('bulk_delete_transactions', {
        ids: idsToDelete
      })

      if (error) {
        console.error('[CCChargesTab] Delete failed:', error)
        return
      }

      console.log('[CCChargesTab] Deleted', data, 'transactions')
      setSelectedIds(new Set())
      refetch()
      onRefetch?.()
    } catch (err) {
      console.error('[CCChargesTab] Delete error:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  // Clear selection when filters change
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

  const handleExport = async () => {
    const toExport = selectedIds.size > 0
      ? sortedTransactions.filter((tx) => selectedIds.has(tx.id))
      : filteredTransactions
    if (toExport.length === 0) return

    setIsExporting(true)
    try {
      exportTransactionsToCSV(toExport, 'cc_charges')
      await markExported('transactions', toExport.map((tx) => tx.id))
    } finally {
      setIsExporting(false)
    }
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

  return (
    <div className="space-y-6">
      {/* Export + Selection actions */}
      {filteredTransactions.length > 0 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            {isExporting
              ? 'Exporting...'
              : selectedIds.size > 0
                ? `Export CSV (${selectedIds.size})`
                : 'Export CSV'}
          </button>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
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
      )}

      {/* Filters */}
      {ccChargeTransactions.length > 0 && (
        <TransactionFilters filters={filters} onChange={handleFiltersChange}>
          <ColumnVisibilityDropdown
            columns={TRANSACTION_COLUMNS}
            visibility={visibility}
            onToggle={toggle}
            onReset={reset}
            activeConditionalColumns={activeTransactionColumns}
          />
        </TransactionFilters>
      )}

      {/* Table */}
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
        <>
          <TransactionTable
            transactions={paginatedTransactions}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            ccChargeMatchData={ccChargeMatchData}
            onCCChargeClick={onCCChargeClick}
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
