/**
 * Component for displaying match score breakdown
 * Shows visual breakdown of scoring components: reference, amount, date, vendor, etc.
 * Can be used in tooltips, popovers, or inline displays
 */

import { cx } from '@/utils/cx'
import type { MatchScore, ScoreBreakdown } from '@/lib/services/lineItemMatcher'
import { SCORING_WEIGHTS } from '@/lib/services/lineItemMatcher'
import {
  DocumentTextIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  BuildingOfficeIcon,
  GlobeAltIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline'

interface MatchScoreBreakdownProps {
  score: MatchScore
  className?: string
  compact?: boolean
}

interface ScoreBarProps {
  label: string
  value: number
  maxValue: number
  icon: React.ComponentType<{ className?: string }>
  colorClass?: string
}

function ScoreBar({ label, value, maxValue, icon: Icon, colorClass = 'bg-primary' }: ScoreBarProps) {
  const percentage = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0

  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs text-text-muted truncate">{label}</span>
          <span className="text-xs font-medium text-text tabular-nums">
            {value}/{maxValue}
          </span>
        </div>
        <div className="h-1.5 bg-surface rounded-full overflow-hidden">
          <div
            className={cx('h-full rounded-full transition-all duration-300', colorClass)}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function getScoreColor(score: number): string {
  if (score >= 85) return 'bg-green-500'
  if (score >= 70) return 'bg-emerald-500'
  if (score >= 50) return 'bg-yellow-500'
  if (score >= 30) return 'bg-orange-500'
  return 'bg-red-500'
}

function getScoreTextColor(score: number): string {
  if (score >= 85) return 'text-green-400'
  if (score >= 70) return 'text-emerald-400'
  if (score >= 50) return 'text-yellow-400'
  if (score >= 30) return 'text-orange-400'
  return 'text-red-400'
}

/**
 * Format amount in smallest unit (cents/agorot) to display format
 */
function formatCurrencyAmount(amountInSmallestUnit: number, currency: string): string {
  const amount = amountInSmallestUnit / 100
  const symbol = currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''
  return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

const breakdownConfig: Array<{
  key: keyof ScoreBreakdown
  label: string
  maxKey: keyof typeof SCORING_WEIGHTS
  icon: React.ComponentType<{ className?: string }>
  /** If true, skip this row when value is 0 (no data available) */
  skipWhenZero?: boolean
}> = [
  { key: 'reference', label: 'Reference', maxKey: 'REFERENCE', icon: DocumentTextIcon, skipWhenZero: true },
  { key: 'amount', label: 'Amount', maxKey: 'AMOUNT', icon: CurrencyDollarIcon },
  { key: 'date', label: 'Date', maxKey: 'DATE', icon: CalendarIcon },
  { key: 'vendor', label: 'Vendor', maxKey: 'VENDOR', icon: BuildingOfficeIcon },
  { key: 'currency', label: 'Currency', maxKey: 'CURRENCY', icon: GlobeAltIcon },
]

export function MatchScoreBreakdown({ score, className, compact = false }: MatchScoreBreakdownProps) {
  const totalColor = getScoreColor(score.total)
  const totalTextColor = getScoreTextColor(score.total)

  if (compact) {
    // Compact view for small spaces
    return (
      <div className={cx('space-y-2', className)}>
        {/* Total score */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-muted">Match Score</span>
          <span className={cx('text-sm font-bold tabular-nums', totalTextColor)}>
            {score.total}%
          </span>
        </div>

        {/* Mini breakdown bars */}
        <div className="flex gap-1 h-2">
          {breakdownConfig
            .filter(({ key, skipWhenZero }) => !skipWhenZero || score.breakdown[key] > 0)
            .map(({ key, maxKey }) => {
              const value = score.breakdown[key]
              const maxValue = SCORING_WEIGHTS[maxKey]
              const width = maxValue > 0 ? (value / maxValue) * 100 : 0
              return (
                <div
                  key={key}
                  className="flex-1 bg-surface rounded-sm overflow-hidden"
                  title={`${key}: ${value}/${maxValue}`}
                >
                  <div
                    className={cx('h-full', totalColor)}
                    style={{ width: `${width}%` }}
                  />
                </div>
              )
            })}
        </div>
      </div>
    )
  }

  return (
    <div className={cx('space-y-3', className)}>
      {/* Total score header */}
      <div className="flex items-center justify-between pb-2 border-b border-text-muted/20">
        <span className="text-sm font-medium text-text">Match Score</span>
        <div className="flex items-center gap-2">
          <div className={cx('w-16 h-2 rounded-full bg-surface overflow-hidden')}>
            <div
              className={cx('h-full rounded-full transition-all', totalColor)}
              style={{ width: `${score.total}%` }}
            />
          </div>
          <span className={cx('text-lg font-bold tabular-nums', totalTextColor)}>
            {score.total}%
          </span>
        </div>
      </div>

      {/* Score breakdown bars */}
      <div className="space-y-2">
        {breakdownConfig
          .filter(({ key, skipWhenZero }) => !skipWhenZero || score.breakdown[key] > 0)
          .map(({ key, label, maxKey, icon }) => (
            <ScoreBar
              key={key}
              label={label}
              value={score.breakdown[key]}
              maxValue={SCORING_WEIGHTS[maxKey]}
              icon={icon}
              colorClass={score.breakdown[key] > 0 ? totalColor : 'bg-text-muted/30'}
            />
          ))}
      </div>

      {/* Currency Conversion Details */}
      {score.conversionDetails && (
        <div className="space-y-1.5 px-2 py-2 bg-blue-500/10 rounded-md">
          <div className="flex items-center gap-2">
            <ArrowsRightLeftIcon className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-xs font-medium text-blue-300">Currency Conversion</span>
          </div>
          <div className="ml-6 space-y-0.5 text-xs text-text-muted">
            <div>
              {formatCurrencyAmount(score.conversionDetails.originalAmount, score.conversionDetails.fromCurrency)}
              {' = '}
              {formatCurrencyAmount(score.conversionDetails.convertedAmount, 'ILS')}
            </div>
            <div className="flex items-center gap-1">
              <span>Rate: {score.conversionDetails.rate.toFixed(4)}</span>
              <span className="text-text-muted/60">({score.conversionDetails.rateDate})</span>
              {score.conversionDetails.rateDateDiffers && (
                <ExclamationTriangleIcon className="w-3 h-3 text-yellow-400" title="Rate is from a different date" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Penalties */}
      {score.penalties.vendorMismatch < 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-red-500/10 rounded-md">
          <ExclamationTriangleIcon className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-400">
            Vendor mismatch penalty: {score.penalties.vendorMismatch}
          </span>
        </div>
      )}

      {/* Match reasons */}
      {score.matchReasons.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-text-muted">Match Reasons</span>
          <div className="space-y-1">
            {score.matchReasons.map((reason, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <CheckCircleIcon className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <span className="text-xs text-text">{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {score.warnings.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-text-muted">Warnings</span>
          <div className="space-y-1">
            {score.warnings.map((warning, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span className="text-xs text-text-muted">{warning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disqualification reason */}
      {score.isDisqualified && score.disqualifyReason && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-red-500/10 rounded-md">
          <ExclamationTriangleIcon className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-400">{score.disqualifyReason}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Tooltip-friendly version of the score breakdown
 */
export function MatchScoreTooltip({ score }: { score: MatchScore }) {
  return (
    <div className="w-64 p-3">
      <MatchScoreBreakdown score={score} />
    </div>
  )
}
