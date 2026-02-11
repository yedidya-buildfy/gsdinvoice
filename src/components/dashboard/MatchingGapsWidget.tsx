import { useMemo } from 'react'
import { Link } from 'react-router'
import {
  DocumentTextIcon,
  BanknotesIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { MagicBento, type BentoCardData } from '@/components/ui/magic-bento'
import { useInvoices } from '@/hooks/useInvoices'
import { useTransactions } from '@/hooks/useTransactions'
import { useTransactionLinkCounts } from '@/hooks/useLineItemLinks'
import { formatCurrency as formatAmount } from '@/lib/currency'

interface MatchingGapsWidgetProps {
  fromDate?: string
  toDate?: string
}

function formatCurrency(agorot: number): string {
  return formatAmount(agorot, 'ILS')
}

export function MatchingGapsWidget({ fromDate, toDate }: MatchingGapsWidgetProps) {
  const { data: invoices, isLoading: isLoadingInvoices } = useInvoices()
  const { transactions, isLoading: isLoadingTransactions } = useTransactions()

  // Get link counts for all transactions
  const transactionIds = useMemo(
    () => transactions.map((t) => t.id),
    [transactions]
  )
  const { linkCounts, isLoading: isLoadingLinks } = useTransactionLinkCounts({
    transactionIds,
    enabled: transactionIds.length > 0,
  })

  const isLoading = isLoadingInvoices || isLoadingTransactions || isLoadingLinks

  // Calculate stats
  const stats = useMemo(() => {
    // Filter by date range if provided
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

    // Invoices not linked to transactions
    const unlinkedInvoices = filteredInvoices.filter(
      (inv) => inv.bankLinkStatus === 'no'
    )
    const partiallyLinkedInvoices = filteredInvoices.filter(
      (inv) => inv.bankLinkStatus === 'partly'
    )
    const fullyLinkedInvoices = filteredInvoices.filter(
      (inv) => inv.bankLinkStatus === 'yes'
    )

    const unlinkedInvoiceCount = unlinkedInvoices.length
    const unlinkedInvoiceAmount = unlinkedInvoices.reduce(
      (sum, inv) => sum + Math.abs(inv.total_amount_agorot || 0),
      0
    )
    const partialInvoiceCount = partiallyLinkedInvoices.length

    // Transactions not linked to invoices (exclude CC charges - they link to CC purchases, not invoices)
    const relevantTransactions = filteredTransactions.filter(
      (tx) => tx.transaction_type !== 'bank_cc_charge'
    )
    const unlinkedTransactions = relevantTransactions.filter(
      (tx) => !linkCounts.has(tx.id) || linkCounts.get(tx.id) === 0
    )

    const unlinkedTransactionCount = unlinkedTransactions.length
    const unlinkedTransactionAmount = unlinkedTransactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount_agorot),
      0
    )

    // Totals
    const totalInvoices = filteredInvoices.length
    const totalTransactions = relevantTransactions.length
    const linkedInvoiceCount = fullyLinkedInvoices.length
    const linkedTransactionCount = relevantTransactions.length - unlinkedTransactionCount

    return {
      // Invoices
      totalInvoices,
      unlinkedInvoiceCount,
      unlinkedInvoiceAmount,
      partialInvoiceCount,
      linkedInvoiceCount,
      invoiceLinkPercentage: totalInvoices > 0 ? (linkedInvoiceCount / totalInvoices) * 100 : 100,
      // Transactions
      totalTransactions,
      unlinkedTransactionCount,
      unlinkedTransactionAmount,
      linkedTransactionCount,
      transactionLinkPercentage: totalTransactions > 0 ? (linkedTransactionCount / totalTransactions) * 100 : 100,
    }
  }, [invoices, transactions, linkCounts, fromDate, toDate])

  // Build the card
  const gapsCard: BentoCardData = useMemo(() => {
    const hasInvoiceGaps = stats.unlinkedInvoiceCount > 0 || stats.partialInvoiceCount > 0
    const hasTransactionGaps = stats.unlinkedTransactionCount > 0
    const allMatched = !hasInvoiceGaps && !hasTransactionGaps

    return {
      id: 'matching-gaps',
      title: 'Invoice-Transaction Matching',
      content: (
        <div className="flex flex-col h-full p-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ArrowsRightLeftIcon className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-text">Matching Status</h3>
            </div>
            <Link
              to="/invoices"
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              View All
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </Link>
          </div>

          {allMatched ? (
            <div className="flex-1 flex flex-col items-center justify-center py-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <CheckCircleIcon className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-primary">All Matched!</p>
              <p className="text-xs text-text-muted mt-1">
                {stats.totalInvoices} invoices linked to {stats.totalTransactions} transactions
              </p>
            </div>
          ) : (
            <div className="flex-1 space-y-4">
              {/* Invoices Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <DocumentTextIcon className="w-4 h-4 text-text-muted" />
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                    Invoices
                  </span>
                </div>

                {stats.unlinkedInvoiceCount > 0 ? (
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-text">Not linked to bank</span>
                      <span className="text-sm font-semibold text-amber-500">
                        {stats.unlinkedInvoiceCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Total amount</span>
                      <span className="text-xs font-medium text-amber-500">
                        {formatCurrency(stats.unlinkedInvoiceAmount)}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-2 flex items-center gap-1">
                      <BanknotesIcon className="w-3 h-3" />
                      Need bank transactions to link
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2">
                      <CheckCircleIcon className="w-4 h-4 text-primary" />
                      <span className="text-sm text-primary">
                        All {stats.totalInvoices} invoices linked
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Transactions Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <BanknotesIcon className="w-4 h-4 text-text-muted" />
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                    Transactions
                  </span>
                </div>

                {stats.unlinkedTransactionCount > 0 ? (
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-text">Not linked to invoices</span>
                      <span className="text-sm font-semibold text-amber-500">
                        {stats.unlinkedTransactionCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Total amount</span>
                      <span className="text-xs font-medium text-amber-500">
                        {formatCurrency(stats.unlinkedTransactionAmount)}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-2 flex items-center gap-1">
                      <DocumentTextIcon className="w-3 h-3" />
                      Need invoices/receipts to link
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2">
                      <CheckCircleIcon className="w-4 h-4 text-primary" />
                      <span className="text-sm text-primary">
                        All {stats.totalTransactions} transactions linked
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ),
    }
  }, [stats])

  if (isLoading) {
    return (
      <div className="bg-surface rounded-lg p-4 border border-border h-[340px]">
        <div className="animate-pulse h-full">
          <div className="h-4 bg-surface-hover rounded w-32 mb-4" />
          <div className="space-y-4">
            <div className="h-20 bg-surface-hover rounded" />
            <div className="h-px bg-surface-hover" />
            <div className="h-20 bg-surface-hover rounded" />
          </div>
        </div>
      </div>
    )
  }

  // Empty state - no data at all
  if (stats.totalInvoices === 0 && stats.totalTransactions === 0) {
    return (
      <div className="bg-surface rounded-lg border border-border p-4 h-[200px] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowsRightLeftIcon className="w-4 h-4 text-text-muted" />
            <h3 className="text-sm font-semibold text-text">Matching Status</h3>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
          <ArrowsRightLeftIcon className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">No data yet</p>
          <p className="text-xs">Upload invoices and bank statements</p>
        </div>
      </div>
    )
  }

  return (
    <div className="[&_.magic-bento-grid]:!grid-cols-1 [&_.magic-bento-card]:!min-h-[340px]">
      <MagicBento
        cards={[gapsCard]}
        textAutoHide={false}
        enableStars
        enableSpotlight
        enableBorderGlow={true}
        enableTilt={false}
        enableMagnetism={false}
        clickEffect
        spotlightRadius={210}
        particleCount={12}
        glowColor="16, 185, 129"
        disableAnimations={false}
      />
    </div>
  )
}
