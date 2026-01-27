import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
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
  extracted: {
    icon: CheckCircleIcon,
    label: 'הושלם',
    color: 'text-green-400 bg-green-500/10',
  },
  error: {
    icon: ExclamationCircleIcon,
    label: 'שגיאה',
    color: 'text-red-400 bg-red-500/10',
  },
}

export function ExtractionStatus({
  status,
  confidence,
  errorMessage,
}: ExtractionStatusProps) {
  const config = statusConfig[status] || statusConfig.pending
  const Icon = config.icon

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}
      >
        <Icon
          className={`w-3.5 h-3.5 ${config.animate ? 'animate-spin' : ''}`}
        />
        {config.label}
      </span>
      {status === 'extracted' && confidence !== null && confidence !== undefined && (
        <span className="text-xs text-text-muted">{confidence}%</span>
      )}
      {status === 'error' && errorMessage && (
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
