import { useState, useMemo } from 'react'
import { useTransactions } from '@/hooks/useTransactions'
import { BankUploader } from '@/components/bank/BankUploader'
import { TransactionFilters, TransactionFilterState } from '@/components/bank/TransactionFilters'
import { TransactionTable } from '@/components/bank/TransactionTable'
import type { Transaction } from '@/types/database'

export function BankMovementsPage() {
  const { transactions, isLoading, refetch } = useTransactions()

  const [filters, setFilters] = useState<TransactionFilterState>({
    search: '',
    dateFrom: '',
    dateTo: '',
    type: 'all',
  })

  const [sortColumn, setSortColumn] = useState<keyof Transaction>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

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

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-text">Bank Movements</h1>

      {/* Upload section */}
      <div className="bg-surface rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text mb-4">Import Bank Statement</h2>
        <BankUploader onUploadComplete={() => refetch()} />
      </div>

      {/* Transactions section */}
      <div className="bg-surface rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text mb-4">
          Transactions
          {!isLoading && transactions.length > 0 && (
            <span className="text-sm font-normal text-text-muted ms-2">
              ({filteredTransactions.length} of {transactions.length})
            </span>
          )}
        </h2>

        {/* Filters - only show if there are transactions */}
        {transactions.length > 0 && (
          <div className="mb-4">
            <TransactionFilters filters={filters} onChange={setFilters} />
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
          />
        )}
      </div>
    </div>
  )
}
