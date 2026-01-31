/**
 * AutoMatchButton Component
 * Provides auto-matching functionality for invoice line items to bank transactions
 * Shows results inline with counts and allows applying high-confidence matches
 */

import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SparklesIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  MinusCircleIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'
import { cx } from '@/utils/cx'
import { LoadingIndicator } from '@/components/ui/application/loading-indicator/loading-indicator'
import { Tooltip } from '@/components/ui/base/tooltip/tooltip'
import { MatchScoreBreakdown } from './MatchScoreBreakdown'
import {
  autoMatchInvoice,
  applyAutoMatchesForInvoice,
  type AutoMatchInvoiceResult,
  type LineItemMatchResult,
} from '@/lib/services/lineItemMatcher'

interface AutoMatchButtonProps {
  invoiceId: string
  /** Number of unmatched line items (optional, for showing availability) */
  unmatchedCount?: number
  /** Callback when matches are applied */
  onMatchesApplied?: () => void
  /** Compact mode for smaller spaces */
  compact?: boolean
  className?: string
}

interface ResultsSummaryProps {
  result: AutoMatchInvoiceResult
  isExpanded: boolean
  onToggleExpand: () => void
  onApplyAll: () => void
  isApplying: boolean
}

function ResultsSummary({
  result,
  isExpanded,
  onToggleExpand,
  onApplyAll,
  isApplying,
}: ResultsSummaryProps) {
  const { summary } = result
  const hasHighConfidence = summary.autoMatched > 0

  return (
    <div className="space-y-3">
      {/* Summary badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {summary.autoMatched > 0 && (
          <Tooltip
            title="High-confidence matches"
            description="These matches can be auto-applied"
          >
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-400 text-xs font-medium">
              <CheckCircleIcon className="w-4 h-4" />
              <span>{summary.autoMatched} auto-matched</span>
            </div>
          </Tooltip>
        )}

        {summary.candidates > 0 && (
          <Tooltip
            title="Candidates to review"
            description="Manual review recommended for these matches"
          >
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-500/10 text-yellow-400 text-xs font-medium">
              <ExclamationCircleIcon className="w-4 h-4" />
              <span>{summary.candidates} to review</span>
            </div>
          </Tooltip>
        )}

        {summary.noMatch > 0 && (
          <Tooltip
            title="No matches found"
            description="No suitable transactions found for these items"
          >
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-text-muted/10 text-text-muted text-xs font-medium">
              <MinusCircleIcon className="w-4 h-4" />
              <span>{summary.noMatch} no match</span>
            </div>
          </Tooltip>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {hasHighConfidence && (
          <button
            type="button"
            onClick={onApplyAll}
            disabled={isApplying}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isApplying ? (
              <>
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                <span>Applying...</span>
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-3.5 h-3.5" />
                <span>Apply All High-Confidence</span>
              </>
            )}
          </button>
        )}

        {result.results.length > 0 && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-text-muted hover:text-text rounded-lg hover:bg-surface-hover transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronUpIcon className="w-3.5 h-3.5" />
                <span>Hide details</span>
              </>
            ) : (
              <>
                <ChevronDownIcon className="w-3.5 h-3.5" />
                <span>Show details</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

interface ResultDetailsProps {
  results: LineItemMatchResult[]
}

function ResultDetails({ results }: ResultDetailsProps) {
  return (
    <div className="mt-3 space-y-2 border-t border-text-muted/20 pt-3">
      <div className="text-xs font-medium text-text-muted mb-2">Match Details</div>
      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {results.map((result) => (
          <ResultItem key={result.lineItemId} result={result} />
        ))}
      </div>
    </div>
  )
}

function ResultItem({ result }: { result: LineItemMatchResult }) {
  const statusConfig = {
    auto_matched: {
      icon: CheckCircleIcon,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      label: 'Auto',
    },
    candidate: {
      icon: ExclamationCircleIcon,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      label: 'Review',
    },
    no_match: {
      icon: MinusCircleIcon,
      color: 'text-text-muted',
      bgColor: 'bg-text-muted/10',
      label: 'None',
    },
  }

  const config = statusConfig[result.status]
  const Icon = config.icon
  const lineItem = result.lineItem
  const match = result.bestMatch

  return (
    <div className={cx('flex items-start gap-2 p-2 rounded-lg', config.bgColor)}>
      <Icon className={cx('w-4 h-4 mt-0.5 shrink-0', config.color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-text truncate">
            {lineItem.description || 'Unnamed item'}
          </span>
          <span className={cx('text-[10px] font-medium', config.color)}>
            {config.label}
          </span>
        </div>
        {match && (
          <div className="mt-1 text-[10px] text-text-muted">
            <Tooltip
              title={<MatchScoreBreakdown score={match.score} />}
              placement="left"
            >
              <span className="cursor-help underline decoration-dotted">
                Match: {match.transaction.description?.slice(0, 30)}...
                ({match.confidence}%)
              </span>
            </Tooltip>
          </div>
        )}
        {result.candidates.length > 1 && (
          <div className="text-[10px] text-text-muted">
            +{result.candidates.length - 1} other candidate{result.candidates.length > 2 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}

export function AutoMatchButton({
  invoiceId,
  unmatchedCount,
  onMatchesApplied,
  compact = false,
  className,
}: AutoMatchButtonProps) {
  const queryClient = useQueryClient()
  const [matchResult, setMatchResult] = useState<AutoMatchInvoiceResult | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  // Auto-match mutation
  const matchMutation = useMutation({
    mutationFn: async () => {
      return autoMatchInvoice(invoiceId)
    },
    onSuccess: (result) => {
      setMatchResult(result)
      setIsExpanded(false)
    },
  })

  // Apply matches mutation
  const applyMutation = useMutation({
    mutationFn: async () => {
      return applyAutoMatchesForInvoice(invoiceId)
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['invoice-rows', invoiceId] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })

      // Clear the match result and notify parent
      setMatchResult(null)
      onMatchesApplied?.()
    },
  })

  const handleAutoMatch = useCallback(() => {
    setMatchResult(null)
    matchMutation.mutate()
  }, [matchMutation])

  const handleApplyAll = useCallback(() => {
    applyMutation.mutate()
  }, [applyMutation])

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  // Loading state
  if (matchMutation.isPending) {
    return (
      <div className={cx('inline-flex items-center gap-2', className)}>
        <LoadingIndicator type="spinner" size="sm" label="Matching..." />
      </div>
    )
  }

  // Show results if we have them
  if (matchResult) {
    return (
      <div className={cx('space-y-2', className)}>
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-text-muted">Auto-Match Results</div>
          <button
            type="button"
            onClick={handleAutoMatch}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text rounded-lg hover:bg-surface-hover transition-colors"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
            <span>Re-run</span>
          </button>
        </div>

        <ResultsSummary
          result={matchResult}
          isExpanded={isExpanded}
          onToggleExpand={handleToggleExpand}
          onApplyAll={handleApplyAll}
          isApplying={applyMutation.isPending}
        />

        {isExpanded && <ResultDetails results={matchResult.results} />}
      </div>
    )
  }

  // Default button state
  if (compact) {
    return (
      <Tooltip title="Auto-match line items to transactions">
        <button
          type="button"
          onClick={handleAutoMatch}
          disabled={unmatchedCount === 0}
          className={cx(
            'inline-flex items-center justify-center p-2 rounded-lg transition-colors',
            'bg-primary/10 text-primary hover:bg-primary/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
        >
          <SparklesIcon className="w-4 h-4" />
        </button>
      </Tooltip>
    )
  }

  return (
    <button
      type="button"
      onClick={handleAutoMatch}
      disabled={unmatchedCount === 0}
      className={cx(
        'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
        'bg-primary/10 text-primary hover:bg-primary/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      <SparklesIcon className="w-4 h-4" />
      <span>Auto-Match</span>
      {unmatchedCount !== undefined && unmatchedCount > 0 && (
        <span className="px-1.5 py-0.5 text-xs bg-primary/20 rounded-full">
          {unmatchedCount}
        </span>
      )}
    </button>
  )
}
