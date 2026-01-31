/**
 * Badge component for displaying line item match status
 * Shows: unmatched (gray), matched (green), partial (yellow), manual (blue)
 */

import { LinkIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { Tooltip } from '@/components/ui/base/tooltip/tooltip'
import { formatTransactionAmount } from '@/lib/currency'
import type { Transaction } from '@/types/database'
import type { MatchStatus, MatchMethod } from '@/lib/services/lineItemMatcher'

interface LineItemMatchBadgeProps {
  matchStatus: MatchStatus | null
  matchConfidence?: number | null
  matchMethod?: MatchMethod | null
  linkedTransaction?: Pick<Transaction, 'id' | 'date' | 'description' | 'amount_agorot' | 'transaction_type'> | null
  onClick?: () => void
  showLabel?: boolean
}

const statusConfig: Record<MatchStatus, { color: string; bgColor: string; icon: typeof LinkIcon; label: string }> = {
  unmatched: {
    color: 'text-text-muted',
    bgColor: 'bg-text-muted/10',
    icon: LinkIcon,
    label: 'Unlinked',
  },
  matched: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    icon: CheckCircleIcon,
    label: 'Linked',
  },
  partial: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    icon: ExclamationCircleIcon,
    label: 'Partial',
  },
  manual: {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    icon: CheckCircleIcon,
    label: 'Manual',
  },
}

const methodLabels: Record<MatchMethod, string> = {
  manual: 'Manually linked',
  rule_reference: 'Reference ID match',
  rule_amount_date: 'Amount + date match',
  rule_fuzzy: 'Fuzzy match',
  ai_assisted: 'AI assisted',
}

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(dateString))
}

export function LineItemMatchBadge({
  matchStatus,
  matchConfidence,
  matchMethod,
  linkedTransaction,
  onClick,
  showLabel = false,
}: LineItemMatchBadgeProps) {
  const status = matchStatus || 'unmatched'
  const config = statusConfig[status]
  const Icon = config.icon

  // Build tooltip content
  const tooltipContent = (
    <div className="space-y-1 text-xs">
      <div className="font-medium">{config.label}</div>
      {linkedTransaction && (
        <>
          <div className="text-text-muted">{linkedTransaction.description}</div>
          <div className="flex items-center gap-2">
            <span>{formatDate(linkedTransaction.date)}</span>
            <span>{formatTransactionAmount(linkedTransaction)}</span>
          </div>
        </>
      )}
      {matchMethod && (
        <div className="text-text-muted">Method: {methodLabels[matchMethod]}</div>
      )}
      {matchConfidence != null && (
        <div className="text-text-muted">Confidence: {Math.round(matchConfidence)}%</div>
      )}
      {status === 'unmatched' && (
        <div className="text-text-muted">Click to link to a transaction</div>
      )}
    </div>
  )

  const badge = (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${config.bgColor} ${config.color} hover:opacity-80`}
    >
      <Icon className="w-3.5 h-3.5" />
      {showLabel && <span>{config.label}</span>}
      {!showLabel && linkedTransaction && (
        <span className="text-[10px] opacity-70">1</span>
      )}
    </button>
  )

  return (
    <Tooltip title={tooltipContent} placement="top">
      {badge}
    </Tooltip>
  )
}
