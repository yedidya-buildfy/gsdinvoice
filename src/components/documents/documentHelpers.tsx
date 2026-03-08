import {
  DocumentTextIcon,
  TableCellsIcon,
  DocumentIcon,
  PhotoIcon,
  LinkIcon,
} from '@heroicons/react/24/outline'
import type { InvoiceWithFile } from '@/hooks/useInvoices'
import type { ExtractionStatus as ExtractionStatusType } from '@/lib/extraction/types'
import { isImageType } from '@/lib/storage'

// Checkbox styling: dark background with green border (uses custom CSS class)
export const checkboxClass = 'checkbox-dark'

// Valid extraction statuses (must match database constraint: pending, processing, processed, failed)
export const validStatuses: ExtractionStatusType[] = ['pending', 'processing', 'processed', 'failed']

export function getExtractionStatus(status: string | null | undefined): ExtractionStatusType {
  if (status && validStatuses.includes(status as ExtractionStatusType)) {
    return status as ExtractionStatusType
  }
  return 'pending'
}

export function FileTypeIcon({ fileType }: { fileType: string }) {
  const iconClass = 'h-5 w-5'

  if (fileType === 'pdf') {
    return <DocumentTextIcon className={`${iconClass} text-red-400`} />
  }
  if (fileType === 'xlsx') {
    return <TableCellsIcon className={`${iconClass} text-green-400`} />
  }
  if (fileType === 'csv') {
    return <TableCellsIcon className={`${iconClass} text-blue-400`} />
  }
  if (isImageType(fileType)) {
    return <PhotoIcon className={`${iconClass} text-purple-400`} />
  }
  return <DocumentIcon className={`${iconClass} text-text-muted`} />
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(dateString))
}

export function getLineItemsCount(invoice: InvoiceWithFile | null | undefined): number {
  if (!invoice?.invoice_rows?.[0]?.count) return 0
  return invoice.invoice_rows[0].count
}

export function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-text-muted">-</span>

  let colorClass: string
  if (score >= 80) {
    colorClass = 'bg-green-500/20 text-green-400'
  } else if (score >= 50) {
    colorClass = 'bg-yellow-500/20 text-yellow-400'
  } else {
    colorClass = 'bg-red-500/20 text-red-400'
  }

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {score}%
    </span>
  )
}

export function BankLinkBadge({
  status,
  stats,
  onClick,
}: {
  status?: 'yes' | 'partly' | 'no'
  stats?: { total: number; linked: number }
  onClick?: () => void
}) {
  const baseClass = 'inline-flex items-center justify-center gap-1 min-w-[4.5rem] px-2 py-0.5 rounded text-xs font-medium transition-colors'
  const clickableClass = onClick ? 'cursor-pointer hover:ring-1 hover:ring-current' : ''

  if (!status || status === 'no') {
    return (
      <button
        type="button"
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation()
            onClick()
          }
        }}
        className={`${baseClass} ${clickableClass} bg-text-muted/20 text-text-muted hover:bg-text-muted/30`}
        disabled={!onClick}
      >
        <LinkIcon className="w-3 h-3" />
        No
      </button>
    )
  }

  if (status === 'partly') {
    const label = stats ? `${stats.linked}/${stats.total}` : 'Partial'
    return (
      <button
        type="button"
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation()
            onClick()
          }
        }}
        className={`${baseClass} ${clickableClass} bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30`}
        disabled={!onClick}
      >
        <LinkIcon className="w-3 h-3" />
        {label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation()
          onClick()
        }
      }}
      className={`${baseClass} ${clickableClass} bg-green-500/20 text-green-400 hover:bg-green-500/30`}
      disabled={!onClick}
    >
      <LinkIcon className="w-3 h-3" />
      Yes
    </button>
  )
}
