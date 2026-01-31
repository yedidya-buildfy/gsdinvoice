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
  className?: string
}

function ProgressBar({ percentage, className = '' }: ProgressBarProps) {
  const clampedPercentage = Math.min(100, Math.max(0, percentage))

  return (
    <div className={`w-full h-1.5 bg-background rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
        style={{ width: `${clampedPercentage}%` }}
      />
    </div>
  )
}

interface StatRowProps {
  icon: React.ReactNode
  label: string
  mainValue: string
  totalValue: string
  percentage: number
}

function StatRow({ icon, label, mainValue, totalValue, percentage }: StatRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-text-muted uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-semibold text-primary">{mainValue}</span>
        <span className="text-sm text-text-muted">/ {totalValue}</span>
      </div>
      <div className="flex items-center gap-2">
        <ProgressBar percentage={percentage} className="flex-1" />
        <span className="text-xs text-text-muted min-w-[40px] text-right">{percentage.toFixed(0)}%</span>
      </div>
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
    const notConnectedCCPercentage = totalCCCount > 0 ? (notConnectedCCCount / totalCCCount) * 100 : 0

    const totalCCAmount = allTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount_agorot), 0)
    const matchedAmount = connectedTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount_agorot), 0)
    const amountPercentage = totalCCAmount > 0 ? (matchedAmount / totalCCAmount) * 100 : 0

    // Bank CC charges stats
    const totalBankCharges = allBankCharges.length
    const notConnectedBankCount = notConnectedBankCharges.length
    const notConnectedBankPercentage = totalBankCharges > 0 ? (notConnectedBankCount / totalBankCharges) * 100 : 0

    const totalBankAmount = allBankCharges.reduce((sum, c) => sum + Math.abs(c.amount_agorot), 0)
    const notConnectedBankAmount = notConnectedBankCharges.reduce((sum, c) => sum + Math.abs(c.amount_agorot), 0)

    return {
      connectedCount,
      totalCCCount,
      transactionPercentage,
      notConnectedCCCount,
      notConnectedCCPercentage,
      matchedAmount,
      totalCCAmount,
      amountPercentage,
      totalBankCharges,
      notConnectedBankCount,
      notConnectedBankPercentage,
      totalBankAmount,
      notConnectedBankAmount,
    }
  }, [allTransactions, connectedTransactions, allBankCharges, notConnectedBankCharges])

  // CC Matching card (connected stats)
  const matchingCard: BentoCardData = useMemo(() => ({
    id: 'cc-matching',
    title: 'CC Matching',
    content: (
      <div className="flex flex-col h-full p-1">
        {/* Header */}
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

        {/* Stats stacked vertically */}
        <div className="flex-1 space-y-4">
          <StatRow
            icon={<CreditCardIcon className="w-4 h-4 text-primary" />}
            label="CC Transactions"
            mainValue={stats.connectedCount.toString()}
            totalValue={`${stats.totalCCCount} connected`}
            percentage={stats.transactionPercentage}
          />

          <StatRow
            icon={<BanknotesIcon className="w-4 h-4 text-primary" />}
            label="Total Amount"
            mainValue={formatCurrency(stats.matchedAmount)}
            totalValue={formatCurrency(stats.totalCCAmount)}
            percentage={stats.amountPercentage}
          />
        </div>
      </div>
    ),
  }), [stats])

  // Not Connected card
  const notConnectedCard: BentoCardData = useMemo(() => ({
    id: 'not-connected',
    title: 'Not Connected',
    content: (
      <div className="flex flex-col h-full p-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-text">Not Connected</h3>
          </div>
          <Link
            to="/invoices"
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Fix
            <ArrowTopRightOnSquareIcon className="w-3 h-3" />
          </Link>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-4">
          {/* CC Purchases not connected */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-text-muted uppercase tracking-wide">CC Purchases</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-semibold text-amber-500">{stats.notConnectedCCCount}</span>
              <span className="text-sm text-text-muted">/ {stats.totalCCCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, stats.notConnectedCCPercentage)}%` }}
                />
              </div>
              <span className="text-xs text-text-muted min-w-[40px] text-right">{stats.notConnectedCCPercentage.toFixed(0)}%</span>
            </div>
          </div>

          {/* Bank Charges not connected */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BanknotesIcon className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-text-muted uppercase tracking-wide">Bank Charges</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-semibold text-amber-500">{stats.notConnectedBankCount}</span>
              <span className="text-sm text-text-muted">/ {stats.totalBankCharges}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, stats.notConnectedBankPercentage)}%` }}
                />
              </div>
              <span className="text-xs text-text-muted min-w-[40px] text-right">{stats.notConnectedBankPercentage.toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>
    ),
  }), [stats])

  if (isLoading) {
    return (
      <>
        <div className="bg-surface rounded-lg p-4 border border-border h-[200px]">
          <div className="animate-pulse h-full">
            <div className="h-4 bg-surface-hover rounded w-24 mb-4" />
            <div className="space-y-4">
              <div className="h-12 bg-surface-hover rounded" />
              <div className="h-12 bg-surface-hover rounded" />
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-lg p-4 border border-border h-[200px]">
          <div className="animate-pulse h-full">
            <div className="h-4 bg-surface-hover rounded w-24 mb-4" />
            <div className="space-y-4">
              <div className="h-12 bg-surface-hover rounded" />
              <div className="h-12 bg-surface-hover rounded" />
            </div>
          </div>
        </div>
      </>
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
    <>
      <div className="[&_.magic-bento-grid]:!grid-cols-1 [&_.magic-bento-card]:!min-h-[200px]">
        <MagicBento
          cards={[matchingCard]}
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
      <div className="[&_.magic-bento-grid]:!grid-cols-1 [&_.magic-bento-card]:!min-h-[200px]">
        <MagicBento
          cards={[notConnectedCard]}
          textAutoHide={false}
          enableStars
          enableSpotlight
          enableBorderGlow={true}
          enableTilt={false}
          enableMagnetism={false}
          clickEffect
          spotlightRadius={210}
          particleCount={12}
          glowColor="245, 158, 11"
          disableAnimations={false}
        />
      </div>
    </>
  )
}
