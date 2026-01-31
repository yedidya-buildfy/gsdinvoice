/**
 * Badge component for displaying transaction link status (to line items)
 * Shows count of linked line items and visual indicator
 */

import { DocumentTextIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { Tooltip } from '@/components/ui/base/tooltip/tooltip'

interface TransactionMatchBadgeProps {
  linkedCount: number
  onClick?: () => void
  showLabel?: boolean
}

export function TransactionMatchBadge({
  linkedCount,
  onClick,
  showLabel = false,
}: TransactionMatchBadgeProps) {
  const isLinked = linkedCount > 0

  const config = isLinked
    ? {
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        icon: CheckCircleIcon,
        label: `${linkedCount} linked`,
      }
    : {
        color: 'text-text-muted',
        bgColor: 'bg-text-muted/10',
        icon: DocumentTextIcon,
        label: 'No links',
      }

  const Icon = config.icon

  // Build tooltip content
  const tooltipContent = (
    <div className="text-xs">
      {isLinked ? (
        <div>
          <div className="font-medium">{linkedCount} line item{linkedCount !== 1 ? 's' : ''} linked</div>
          <div className="text-text-muted mt-1">Click to view or manage links</div>
        </div>
      ) : (
        <div>
          <div className="font-medium">No line items linked</div>
          <div className="text-text-muted mt-1">Click to link to an invoice line item</div>
        </div>
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
      {!showLabel && isLinked && (
        <span>{linkedCount}</span>
      )}
    </button>
  )

  return (
    <Tooltip title={tooltipContent} placement="top">
      {badge}
    </Tooltip>
  )
}
