import { useMemo } from 'react'
import { Link } from 'react-router'
import {
  CreditCardIcon,
  BanknotesIcon,
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { MagicBento, type BentoCardData } from '@/components/ui/magic-bento'
import { useCCTransactions, useBankCCCharges } from '@/hooks/useCCBankMatchResults'
import { formatCurrency as formatAmount } from '@/lib/currency'

interface CCBankMatchWidgetProps {
  fromDate: string
  toDate: string
}

// Use centralized currency formatter
function formatCurrency(agorot: number): string {
  return formatAmount(agorot, 'ILS')
}

interface ProgressBarProps {
  percentage: number
  color?: 'primary' | 'amber'
  className?: string
}

function ProgressBar({ percentage, color = 'primary', className = '' }: ProgressBarProps) {
  const clampedPercentage = Math.min(100, Math.max(0, percentage))
  const colorClass = color === 'amber' ? 'bg-amber-500' : 'bg-primary'

  return (
    <div className={`w-full h-1.5 bg-background rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full ${colorClass} rounded-full transition-all duration-500 ease-out`}
        style={{ width: `${clampedPercentage}%` }}
      />
    </div>
  )
}

export function CCBankMatchWidget({ fromDate, toDate }: CCBankMatchWidgetProps) {
  // Fetch all CC transactions in date range
  const { transactions: allTransactions, isLoading: isLoadingAll } = useCCTransactions({
    fromDate,
    toDate,
    connectionStatus: 'all',
    dateField: 'charge_date',
  })

  // Fetch connected CC transactions in date range
  const { transactions: connectedTransactions, isLoading: isLoadingConnected } = useCCTransactions({
    fromDate,
    toDate,
    connectionStatus: 'connected',
    dateField: 'charge_date',
  })

  // Fetch all bank CC charges in date range
  const { charges: allBankCharges, isLoading: isLoadingBankAll } = useBankCCCharges({
    fromDate,
    toDate,
    connectionStatus: 'all',
  })

  // Fetch not connected bank CC charges
  const { charges: notConnectedBankCharges, isLoading: isLoadingBankNotConnected } = useBankCCCharges({
    fromDate,
    toDate,
    connectionStatus: 'not_connected',
  })

  const isLoading = isLoadingAll || isLoadingConnected || isLoadingBankAll || isLoadingBankNotConnected

  // Calculate stats
  const stats = useMemo(() => {
    // CC Purchases stats
    const totalCCCount = allTransactions.length
    const connectedCount = connectedTransactions.length
    const transactionPercentage = totalCCCount > 0 ? (connectedCount / totalCCCount) * 100 : 0
    const notConnectedCCCount = totalCCCount - connectedCount

    const totalCCAmount = allTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount_agorot), 0)
    const matchedAmount = connectedTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount_agorot), 0)
    const amountPercentage = totalCCAmount > 0 ? (matchedAmount / totalCCAmount) * 100 : 0

    // Bank CC charges stats
    const totalBankCharges = allBankCharges.length
    const notConnectedBankCount = notConnectedBankCharges.length

    return {
      connectedCount,
      totalCCCount,
      transactionPercentage,
      notConnectedCCCount,
      matchedAmount,
      totalCCAmount,
      amountPercentage,
      totalBankCharges,
      notConnectedBankCount,
    }
  }, [allTransactions, connectedTransactions, allBankCharges, notConnectedBankCharges])

  // Unified CC Matching card
  const unifiedCard: BentoCardData = useMemo(() => {
    const hasUnconnectedCC = stats.notConnectedCCCount > 0
    const hasUnconnectedBank = stats.notConnectedBankCount > 0
    const hasAnyIssues = hasUnconnectedCC || hasUnconnectedBank

    return {
      id: 'cc-matching',
      title: 'CC Matching',
      content: (
        <div className="flex flex-col h-full p-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text">CC Matching</h3>
            <Link
              to="/money-movements?tab=matching"
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Details
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </Link>
          </div>

          {/* Connected Stats - Top Section */}
          <div className="space-y-3 mb-4">
            {/* CC Transactions Connected */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCardIcon className="w-4 h-4 text-primary" />
                  <span className="text-xs text-text-muted uppercase tracking-wide">Connected</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-semibold text-primary">{stats.connectedCount}</span>
                  <span className="text-xs text-text-muted">/ {stats.totalCCCount}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ProgressBar percentage={stats.transactionPercentage} className="flex-1" />
                <span className="text-xs text-text-muted min-w-[32px] text-right">{stats.transactionPercentage.toFixed(0)}%</span>
              </div>
            </div>

            {/* Amount Matched */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BanknotesIcon className="w-4 h-4 text-primary" />
                  <span className="text-xs text-text-muted uppercase tracking-wide">Amount</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-semibold text-primary">{formatCurrency(stats.matchedAmount)}</span>
                  <span className="text-xs text-text-muted">/ {formatCurrency(stats.totalCCAmount)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ProgressBar percentage={stats.amountPercentage} className="flex-1" />
                <span className="text-xs text-text-muted min-w-[32px] text-right">{stats.amountPercentage.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border my-2" />

          {/* Needs Attention Section */}
          {!hasAnyIssues ? (
            <div className="flex items-center gap-2 py-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <CreditCardIcon className="w-3 h-3 text-primary" />
              </div>
              <span className="text-sm text-primary">All matched!</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-2">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-medium text-text-muted">Needs Attention</span>
              </div>

              {/* CC Purchases not connected - need bank statement */}
              {hasUnconnectedCC && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <CreditCardIcon className="w-4 h-4 text-amber-500" />
                    <div>
                      <span className="text-xs font-medium text-text">CC Purchases</span>
                      <p className="text-xs text-text-muted flex items-center gap-1">
                        <BanknotesIcon className="w-3 h-3" />
                        Upload bank statement
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-amber-500">{stats.notConnectedCCCount}</span>
                </div>
              )}

              {/* Bank Charges not connected - need CC statement */}
              {hasUnconnectedBank && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <BanknotesIcon className="w-4 h-4 text-amber-500" />
                    <div>
                      <span className="text-xs font-medium text-text">Bank CC Charges</span>
                      <p className="text-xs text-text-muted flex items-center gap-1">
                        <CreditCardIcon className="w-3 h-3" />
                        Upload CC statement
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-amber-500">{stats.notConnectedBankCount}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ),
    }
  }, [stats])

  if (isLoading) {
    return (
      <div className="bg-surface rounded-lg p-4 border border-border h-[320px]">
        <div className="animate-pulse h-full">
          <div className="h-4 bg-surface-hover rounded w-24 mb-4" />
          <div className="space-y-4">
            <div className="h-12 bg-surface-hover rounded" />
            <div className="h-12 bg-surface-hover rounded" />
            <div className="h-px bg-surface-hover my-4" />
            <div className="h-16 bg-surface-hover rounded" />
          </div>
        </div>
      </div>
    )
  }

  // Empty state
  if (stats.totalCCCount === 0 && stats.totalBankCharges === 0) {
    return (
      <div className="bg-surface rounded-lg border border-border p-4 h-[200px] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text">CC Matching</h3>
          <Link
            to="/money-movements?tab=matching"
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Details
            <ArrowTopRightOnSquareIcon className="w-3 h-3" />
          </Link>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
          <CreditCardIcon className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">No CC transactions</p>
          <p className="text-xs">Upload a credit card file</p>
        </div>
      </div>
    )
  }

  return (
    <div className="[&_.magic-bento-grid]:!grid-cols-1 [&_.magic-bento-card]:!min-h-[320px]">
      <MagicBento
        cards={[unifiedCard]}
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
