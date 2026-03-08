import { useMemo } from 'react'
import {
  BanknotesIcon,
  DocumentTextIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { useInvoices } from '@/hooks/useInvoices'
import { useTransactions } from '@/hooks/useTransactions'
import { useTransactionLinkCounts } from '@/hooks/useLineItemLinks'
import { formatCurrency } from '@/lib/currency'
import { formatTransactionAmount } from '@/lib/currency/formatters'
import { formatDisplayDate } from '@/lib/utils/dateFormatter'
import type { Transaction } from '@/types/database'
import type { InvoiceWithFile } from '@/hooks/useInvoices'

interface UnlinkedItemsWidgetProps {
  fromDate?: string
  toDate?: string
}

function TransactionTypeIcon({ type }: { type: string | null }) {
  if (type === 'cc_purchase') {
    return <CreditCardIcon className="w-4 h-4 text-text-muted shrink-0" />
  }
  return <BanknotesIcon className="w-4 h-4 text-text-muted shrink-0" />
}

function TransactionRow({ tx }: { tx: Transaction }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
      <TransactionTypeIcon type={tx.transaction_type} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text truncate">{tx.description}</p>
        <p className="text-xs text-text-muted">{formatDisplayDate(tx.date)}</p>
      </div>
      <span className="text-sm font-medium whitespace-nowrap text-text">
        {formatTransactionAmount(tx)}
      </span>
    </div>
  )
}

function InvoiceRow({ inv }: { inv: InvoiceWithFile }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
      <DocumentTextIcon className="w-4 h-4 text-text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text truncate">
          {inv.vendor_name || 'Unknown vendor'}
          {inv.invoice_number ? ` #${inv.invoice_number}` : ''}
        </p>
        <p className="text-xs text-text-muted">{formatDisplayDate(inv.invoice_date)}</p>
      </div>
      <span className="text-sm font-medium whitespace-nowrap text-text">
        {formatCurrency(Math.abs(inv.total_amount_agorot || 0), inv.currency || 'ILS')}
      </span>
    </div>
  )
}

export function UnlinkedItemsWidget({ fromDate, toDate }: UnlinkedItemsWidgetProps) {
  const { data: invoices, isLoading: isLoadingInvoices } = useInvoices()
  const { transactions, isLoading: isLoadingTransactions } = useTransactions()

  const transactionIds = useMemo(
    () => transactions.map((t) => t.id),
    [transactions]
  )
  const { linkCounts, isLoading: isLoadingLinks } = useTransactionLinkCounts({
    transactionIds,
    enabled: transactionIds.length > 0,
  })

  const isLoading = isLoadingInvoices || isLoadingTransactions || isLoadingLinks

  const { unlinkedTransactions, unlinkedInvoices } = useMemo(() => {
    let filteredInvoices = invoices ?? []
    let filteredTransactions = transactions

    if (fromDate) {
      filteredInvoices = filteredInvoices.filter(
        (inv) => inv.invoice_date && inv.invoice_date >= fromDate
      )
      filteredTransactions = filteredTransactions.filter(
        (tx) => tx.date >= fromDate
      )
    }
    if (toDate) {
      filteredInvoices = filteredInvoices.filter(
        (inv) => inv.invoice_date && inv.invoice_date <= toDate
      )
      filteredTransactions = filteredTransactions.filter(
        (tx) => tx.date <= toDate
      )
    }

    // Transactions not linked to any invoice — expenses only, exclude bank_cc_charge (they link to CC purchases, not invoices)
    const relevantTransactions = filteredTransactions.filter(
      (tx) => tx.transaction_type !== 'bank_cc_charge' && !tx.is_income
    )
    const unlinkedTx = relevantTransactions
      .filter((tx) => !linkCounts.has(tx.id) || linkCounts.get(tx.id) === 0)
      .sort((a, b) => b.date.localeCompare(a.date))

    // Invoices not linked to any transaction (or only partially linked)
    const unlinkedInv = filteredInvoices
      .filter((inv) => inv.bankLinkStatus === 'no' || inv.bankLinkStatus === 'partly')
      .sort((a, b) => (b.invoice_date ?? '').localeCompare(a.invoice_date ?? ''))

    return { unlinkedTransactions: unlinkedTx, unlinkedInvoices: unlinkedInv }
  }, [invoices, transactions, linkCounts, fromDate, toDate])

  if (isLoading) {
    return (
      <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-surface rounded-lg p-4 border border-border">
            <div className="animate-pulse">
              <div className="h-4 bg-surface-hover rounded w-48 mb-4" />
              <div className="space-y-3">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="h-12 bg-surface-hover rounded" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Unlinked Transactions */}
      <div className="bg-surface rounded-lg border border-border flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BanknotesIcon className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-text">Transactions Without Documents</h3>
          </div>
          {unlinkedTransactions.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
              {unlinkedTransactions.length}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto max-h-[400px] p-1">
          {unlinkedTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-muted">
              <BanknotesIcon className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">All transactions are linked</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {unlinkedTransactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          )}
        </div>
        {unlinkedTransactions.length > 0 && (
          <div className="px-4 py-2 border-t border-border flex items-center gap-2">
            <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs text-text-muted">
              Missing invoices/receipts for {unlinkedTransactions.length} transaction{unlinkedTransactions.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Unlinked Invoices */}
      <div className="bg-surface rounded-lg border border-border flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <DocumentTextIcon className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-text">Documents Without Transactions</h3>
          </div>
          {unlinkedInvoices.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
              {unlinkedInvoices.length}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto max-h-[400px] p-1">
          {unlinkedInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-muted">
              <DocumentTextIcon className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">All documents are linked</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {unlinkedInvoices.map((inv) => (
                <InvoiceRow key={inv.id} inv={inv} />
              ))}
            </div>
          )}
        </div>
        {unlinkedInvoices.length > 0 && (
          <div className="px-4 py-2 border-t border-border flex items-center gap-2">
            <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs text-text-muted">
              Missing transactions for {unlinkedInvoices.length} document{unlinkedInvoices.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
