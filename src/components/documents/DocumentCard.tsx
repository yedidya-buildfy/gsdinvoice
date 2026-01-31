import {
  ClockIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import { DocumentThumbnail } from './DocumentThumbnail'
import { formatFileSize } from '@/lib/storage'
import type { DocumentWithUrl } from '@/hooks/useDocuments'

interface DocumentCardProps {
  document: DocumentWithUrl
}

type DocumentStatus = 'pending' | 'processing' | 'processed' | 'failed'

const statusConfig: Record<
  DocumentStatus,
  { icon: typeof ClockIcon; color: string; label: string }
> = {
  pending: {
    icon: ClockIcon,
    color: 'text-yellow-500 bg-yellow-500/20',
    label: 'Pending',
  },
  processing: {
    icon: ArrowPathIcon,
    color: 'text-blue-500 bg-blue-500/20',
    label: 'Processing',
  },
  processed: {
    icon: CheckCircleIcon,
    color: 'text-green-500 bg-green-500/20',
    label: 'Processed',
  },
  failed: {
    icon: ExclamationCircleIcon,
    color: 'text-red-500 bg-red-500/20',
    label: 'Failed',
  },
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function DocumentCard({ document }: DocumentCardProps) {
  const status = (document.status as DocumentStatus) || 'pending'
  const config = statusConfig[status] ?? statusConfig.pending
  const StatusIcon = config.icon

  return (
    <div className="bg-surface rounded-lg overflow-hidden hover:ring-1 hover:ring-primary/50 transition group">
      {/* Thumbnail */}
      <DocumentThumbnail
        url={document.url}
        fileType={document.file_type}
        fileName={document.original_name}
      />

      {/* Info section */}
      <div className="p-3 space-y-1">
        {/* File name - truncated */}
        <p
          className="text-sm font-medium text-text truncate"
          title={document.original_name}
        >
          {document.original_name}
        </p>

        {/* File size */}
        <p className="text-xs text-text-muted">
          {document.file_size != null ? formatFileSize(document.file_size) : '-'}
        </p>

        {/* Upload date */}
        <p className="text-xs text-text-muted">
          {document.created_at ? formatDate(document.created_at) : '-'}
        </p>

        {/* Status badge */}
        <div className="pt-1">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}
          >
            <StatusIcon className="w-3 h-3" />
            {config.label}
          </span>
        </div>
      </div>
    </div>
  )
}
