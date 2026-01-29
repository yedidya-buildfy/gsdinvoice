import { useState } from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CreditCardIcon,
  BanknotesIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import {
  useCCBankMatchResults,
  useCCBankMatchSummary,
  useUpdateMatchStatus,
  useUnmatchCCTransactions,
  type MatchResultWithDetails,
} from '@/hooks/useCCBankMatchResults'
import { runCCBankMatching } from '@/lib/services/ccBankMatcher'
import { useAuth } from '@/contexts/AuthContext'
import { useSettingsStore } from '@/stores/settingsStore'
import { agorotToShekel } from '@/lib/utils/currency'
import { Badge, BadgeWithDot } from '@/components/ui/base/badges/badges'

function formatCurrency(agorot: number): string {
  const shekel = agorotToShekel(agorot)
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(shekel)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('he-IL')
}

interface SummaryCardProps {
  title: string
  value: string | number
  subtitle?: string
  color?: 'default' | 'success' | 'warning' | 'error'
}

function SummaryCard({ title, value, subtitle, color = 'default' }: SummaryCardProps) {
  const colorClasses = {
    default: 'text-text',
    success: 'text-utility-success-600',
    warning: 'text-utility-warning-600',
    error: 'text-utility-error-600',
  }

  return (
    <div className="bg-surface rounded-lg p-4 border border-border">
      <div className="text-text-secondary text-sm">{title}</div>
      <div className={`text-2xl font-semibold mt-1 ${colorClasses[color]}`}>{value}</div>
      {subtitle && <div className="text-text-muted text-xs mt-1">{subtitle}</div>}
    </div>
  )
}

interface MatchRowProps {
  result: MatchResultWithDetails
  isExpanded: boolean
  onToggle: () => void
  onApprove: () => void
  onReject: () => void
  onUnmatch: () => void
  isUpdating: boolean
}

function MatchRow({
  result,
  isExpanded,
  onToggle,
  onApprove,
  onReject,
  onUnmatch,
  isUpdating,
}: MatchRowProps) {
  const discrepancyColor = result.discrepancy_agorot === 0
    ? 'success'
    : Math.abs(result.discrepancy_agorot) <= result.bank_amount_agorot * 0.02
      ? 'warning'
      : 'error'

  const statusBadge = {
    pending: <BadgeWithDot color="warning" size="sm">ממתין</BadgeWithDot>,
    approved: <BadgeWithDot color="success" size="sm">מאושר</BadgeWithDot>,
    rejected: <BadgeWithDot color="error" size="sm">נדחה</BadgeWithDot>,
  }[result.status] || <BadgeWithDot color="gray" size="sm">{result.status}</BadgeWithDot>

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header Row */}
      <div
        className="flex items-center gap-4 p-4 bg-surface cursor-pointer hover:bg-surface-hover transition-colors"
        onClick={onToggle}
      >
        <button type="button" className="text-text-secondary">
          {isExpanded ? (
            <ChevronUpIcon className="w-5 h-5" />
          ) : (
            <ChevronDownIcon className="w-5 h-5" />
          )}
        </button>

        <div className="flex items-center gap-2 min-w-[120px]">
          <CreditCardIcon className="w-4 h-4 text-text-muted" />
          <span className="font-mono text-sm">{result.card_last_four}</span>
        </div>

        <div className="min-w-[100px] text-sm text-text-secondary">
          {formatDate(result.charge_date)}
        </div>

        <div className="flex-1 truncate text-sm text-text">
          {result.bank_transaction?.description || 'Unknown'}
        </div>

        <div className="min-w-[100px] text-left">
          <div className="text-sm font-medium text-text">
            {formatCurrency(result.bank_amount_agorot)}
          </div>
          <div className="text-xs text-text-muted">חיוב בנק</div>
        </div>

        <div className="min-w-[100px] text-left">
          <div className="text-sm font-medium text-text">
            {formatCurrency(result.total_cc_amount_agorot)}
          </div>
          <div className="text-xs text-text-muted">
            {result.cc_transaction_count} עסקאות CC
          </div>
        </div>

        <div className="min-w-[100px] text-left">
          <div className={`text-sm font-medium ${
            discrepancyColor === 'success' ? 'text-utility-success-600' :
            discrepancyColor === 'warning' ? 'text-utility-warning-600' :
            'text-utility-error-600'
          }`}>
            {result.discrepancy_agorot >= 0 ? '+' : ''}
            {formatCurrency(result.discrepancy_agorot)}
          </div>
          <div className="text-xs text-text-muted">הפרש</div>
        </div>

        <div className="min-w-[80px] text-center">
          <Badge
            color={result.match_confidence >= 80 ? 'success' : result.match_confidence >= 60 ? 'warning' : 'error'}
            size="sm"
          >
            {Math.round(result.match_confidence)}%
          </Badge>
        </div>

        <div className="min-w-[80px]">
          {statusBadge}
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {result.status === 'pending' && (
            <>
              <button
                type="button"
                onClick={onApprove}
                disabled={isUpdating}
                className="p-1.5 rounded hover:bg-utility-success-50 text-utility-success-600 transition-colors disabled:opacity-50"
                title="אישור התאמה"
              >
                <CheckCircleIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onReject}
                disabled={isUpdating}
                className="p-1.5 rounded hover:bg-utility-error-50 text-utility-error-600 transition-colors disabled:opacity-50"
                title="דחיית התאמה"
              >
                <XCircleIcon className="w-5 h-5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onUnmatch}
            disabled={isUpdating}
            className="p-1.5 rounded hover:bg-utility-gray-50 text-utility-gray-600 transition-colors disabled:opacity-50"
            title="ביטול התאמה"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Expanded Content - CC Transactions */}
      {isExpanded && (
        <div className="bg-background border-t border-border">
          <div className="p-4">
            <div className="text-sm font-medium text-text mb-3">
              עסקאות כרטיס אשראי ({result.cc_transactions.length})
            </div>
            <div className="space-y-2">
              {result.cc_transactions.map((ccTx) => (
                <div
                  key={ccTx.id}
                  className="flex items-center gap-4 p-3 bg-surface rounded border border-border"
                >
                  <div className="min-w-[100px] text-sm text-text-secondary">
                    {formatDate(ccTx.transaction_date)}
                  </div>
                  <div className="flex-1 text-sm text-text">
                    {ccTx.merchant_name}
                  </div>
                  <div className="min-w-[100px] text-left text-sm font-medium text-text">
                    {formatCurrency(ccTx.amount_agorot)}
                  </div>
                  {ccTx.foreign_amount_cents && ccTx.foreign_currency && (
                    <div className="min-w-[80px] text-left text-xs text-text-muted">
                      {(ccTx.foreign_amount_cents / 100).toFixed(2)} {ccTx.foreign_currency}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function CCBankMatchWidget() {
  const { user } = useAuth()
  const { ccBankDateRangeDays, ccBankAmountTolerance } = useSettingsStore()
  const { matchResults, isLoading, error, refetch } = useCCBankMatchResults()
  const { summary } = useCCBankMatchSummary()
  const { updateStatus, isUpdating: isStatusUpdating } = useUpdateMatchStatus()
  const { unmatch, isUnmatching } = useUnmatchCCTransactions()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isRerunning, setIsRerunning] = useState(false)

  const handleRerunMatching = async () => {
    if (!user || isRerunning) return

    setIsRerunning(true)
    try {
      await runCCBankMatching(user.id, {
        dateToleranceDays: ccBankDateRangeDays,
        amountTolerancePercent: ccBankAmountTolerance,
      })
      refetch()
    } catch (err) {
      console.error('Failed to rerun matching:', err)
    } finally {
      setIsRerunning(false)
    }
  }

  const handleApprove = async (matchId: string) => {
    await updateStatus(matchId, 'approved')
  }

  const handleReject = async (matchId: string) => {
    await updateStatus(matchId, 'rejected')
  }

  const handleUnmatch = async (result: MatchResultWithDetails) => {
    const ccIds = result.cc_transactions.map(tx => tx.id)
    await unmatch(result.id, ccIds)
    refetch()
  }

  if (isLoading) {
    return (
      <div className="bg-surface rounded-lg p-6 border border-border">
        <div className="animate-pulse">
          <div className="h-6 bg-surface-hover rounded w-48 mb-4"></div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-surface-hover rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-surface rounded-lg p-6 border border-border">
        <div className="flex items-center gap-2 text-utility-error-600">
          <ExclamationTriangleIcon className="w-5 h-5" />
          <span>שגיאה בטעינת התאמות: {error.message}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <BanknotesIcon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-text">התאמת כרטיס אשראי לבנק</h2>
          <Badge color="brand" size="sm">{matchResults.length}</Badge>
        </div>

        <button
          type="button"
          onClick={handleRerunMatching}
          disabled={isRerunning}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-4 h-4 ${isRerunning ? 'animate-spin' : ''}`} />
          הרץ התאמה מחדש
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-background">
        <SummaryCard
          title="סה״כ התאמות"
          value={summary.totalMatches}
          subtitle={`${summary.totalCCTransactions} עסקאות CC`}
        />
        <SummaryCard
          title="ממתינים לאישור"
          value={summary.pendingCount}
          color={summary.pendingCount > 0 ? 'warning' : 'default'}
        />
        <SummaryCard
          title="סה״כ הפרשים"
          value={formatCurrency(summary.totalDiscrepancyAgorot)}
          color={summary.totalDiscrepancyAgorot === 0 ? 'success' : 'warning'}
        />
        <SummaryCard
          title="ביטחון ממוצע"
          value={`${Math.round(summary.avgConfidence)}%`}
          color={summary.avgConfidence >= 80 ? 'success' : summary.avgConfidence >= 60 ? 'warning' : 'error'}
        />
      </div>

      {/* Match Results List */}
      <div className="p-4 space-y-3">
        {matchResults.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <CreditCardIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>אין התאמות להצגה</p>
            <p className="text-sm mt-1">
              העלה קובץ כרטיס אשראי וקובץ בנק כדי לראות התאמות
            </p>
          </div>
        ) : (
          matchResults.map((result) => (
            <MatchRow
              key={result.id}
              result={result}
              isExpanded={expandedId === result.id}
              onToggle={() => setExpandedId(expandedId === result.id ? null : result.id)}
              onApprove={() => handleApprove(result.id)}
              onReject={() => handleReject(result.id)}
              onUnmatch={() => handleUnmatch(result)}
              isUpdating={isStatusUpdating || isUnmatching}
            />
          ))
        )}
      </div>
    </div>
  )
}
