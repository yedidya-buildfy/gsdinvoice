import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline'
import type { ExtractionStatus as ExtractionStatusType } from '@/lib/extraction/types'

interface ExtractionStatusProps {
  status: ExtractionStatusType
  confidence?: number | null
  errorMessage?: string | null
}

interface StatusConfig {
  icon: React.ComponentType<{ className?: string }>
  label: string
  color: string
  animate?: boolean
}

const statusConfig: Record<ExtractionStatusType, StatusConfig> = {
  pending: {
    icon: ClockIcon,
    label: 'ממתין',
    color: 'text-yellow-400 bg-yellow-500/10',
  },
  processing: {
    icon: ArrowPathIcon,
    label: 'מעבד',
    color: 'text-blue-400 bg-blue-500/10',
    animate: true,
  },
  processed: {
    icon: CheckCircleIcon,
    label: 'הושלם',
    color: 'text-green-400 bg-green-500/10',
  },
  failed: {
    icon: ExclamationCircleIcon,
    label: 'שגיאה',
    color: 'text-red-400 bg-red-500/10',
  },
  not_invoice: {
    icon: DocumentIcon,
    label: 'לא חשבונית',
    color: 'text-amber-400 bg-amber-500/10',
  },
}

export function ExtractionStatus({
  status,
  confidence,
  errorMessage,
}: ExtractionStatusProps) {
  // Derive 'not_invoice' status from error message (DB only stores 'failed')
  const derivedStatus: ExtractionStatusType =
    status === 'failed' && errorMessage === 'Document is not an invoice or receipt'
      ? 'not_invoice'
      : status

  const config = statusConfig[derivedStatus] || statusConfig.pending
  const Icon = config.icon

  return (
    <div className="flex items-center gap-2" dir="rtl">
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}
      >
        {config.label}
        <Icon
          className={`w-3.5 h-3.5 ${config.animate ? 'animate-spin' : ''}`}
        />
      </span>
      {derivedStatus === 'processed' && confidence !== null && confidence !== undefined && (
        <span className="text-xs text-text-muted">{confidence}%</span>
      )}
      {derivedStatus === 'failed' && errorMessage && (
        <span
          className="text-xs text-red-400 truncate max-w-[120px]"
          title={errorMessage}
        >
          {errorMessage.length > 30
            ? `${errorMessage.slice(0, 30)}...`
            : errorMessage}
        </span>
      )}
    </div>
  )
}
