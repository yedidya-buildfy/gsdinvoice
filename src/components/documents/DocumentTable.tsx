import {
  DocumentTextIcon,
  TableCellsIcon,
  DocumentIcon,
  PhotoIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  LinkIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import type { DocumentWithUrl } from '@/hooks/useDocuments'
import type { InvoiceWithFile } from '@/hooks/useInvoices'
import { formatCurrency } from '@/lib/currency'
import { ExtractionStatus } from './ExtractionStatus'
import type { ExtractionStatus as ExtractionStatusType } from '@/lib/extraction/types'
import { isImageType } from '@/lib/storage'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { DocumentColumnKey } from '@/types/columnVisibility'

export type DocumentWithInvoice = DocumentWithUrl & {
  invoice?: InvoiceWithFile | null
}

export type DocumentSortColumn =
  | 'is_approved'
  | 'original_name'
  | 'file_size'
  | 'vendor_name'
  | 'total_amount_agorot'
  | 'vat_amount_agorot'
  | 'created_at'
  | 'line_items_count'
  | 'confidence_score'
  | 'status'
  | 'bank_link'

interface DocumentTableProps {
  documents: DocumentWithInvoice[]
  isLoading?: boolean
  selectedIds?: Set<string>
  onSelectionChange?: (selectedIds: Set<string>) => void
  onRowClick?: (document: DocumentWithInvoice) => void
  onBankLinkClick?: (invoiceId: string, vendorName: string | null) => void
  onApprovalToggle?: (invoiceId: string, isApproved: boolean) => void
  approvingIds?: Set<string>
  sortColumn?: DocumentSortColumn
  sortDirection?: 'asc' | 'desc'
  onSort?: (column: DocumentSortColumn) => void
}

interface SortHeaderProps {
  column: DocumentSortColumn
  label: string
  sortColumn?: DocumentSortColumn
  sortDirection?: 'asc' | 'desc'
  onSort?: (column: DocumentSortColumn) => void
  align?: 'start' | 'center' | 'end'
  className?: string
}

function SortHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  align = 'start',
  className = '',
}: SortHeaderProps) {
  const isActive = sortColumn === column
  const alignClass = align === 'end' ? 'text-end' : align === 'center' ? 'text-center' : 'text-start'
  const justifyClass =
    align === 'end' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'

  if (!onSort) {
    return (
      <th
        className={`px-4 py-3 ${alignClass} text-xs font-medium text-text-muted uppercase tracking-wider ${className}`}
      >
        {label}
      </th>
    )
  }

  return (
    <th
      onClick={() => onSort(column)}
      className={`cursor-pointer select-none px-4 py-3 ${alignClass} text-xs font-medium text-text-muted uppercase tracking-wider hover:text-text transition-colors ${className}`}
    >
      <div className={`flex items-center gap-1 ${justifyClass}`}>
        {label}
        {isActive &&
          (sortDirection === 'asc' ? (
            <ChevronUpIcon className="w-4 h-4" />
          ) : (
            <ChevronDownIcon className="w-4 h-4" />
          ))}
      </div>
    </th>
  )
}

// Checkbox styling: dark background with green border (uses custom CSS class)
const checkboxClass = 'checkbox-dark'

// Valid extraction statuses (must match database constraint: pending, processing, processed, failed)
const validStatuses: ExtractionStatusType[] = ['pending', 'processing', 'processed', 'failed']

function getExtractionStatus(status: string | null | undefined): ExtractionStatusType {
  if (status && validStatuses.includes(status as ExtractionStatusType)) {
    return status as ExtractionStatusType
  }
  return 'pending'
}

function FileTypeIcon({ fileType }: { fileType: string }) {
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

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(dateString))
}

function getLineItemsCount(invoice: InvoiceWithFile | null | undefined): number {
  if (!invoice?.invoice_rows?.[0]?.count) return 0
  return invoice.invoice_rows[0].count
}

function ConfidenceBadge({ score }: { score: number | null }) {
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

function BankLinkBadge({
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

function SkeletonRow({ isVisible }: { isVisible: (col: DocumentColumnKey) => boolean }) {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3 text-start">
        <div className="h-4 w-4 bg-surface rounded inline-block" />
      </td>
      {isVisible('type') && (
        <td className="px-4 py-3 text-start">
          <div className="h-5 w-5 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('size') && (
        <td className="px-4 py-3 text-start">
          <div className="h-4 w-14 bg-surface rounded inline-block" />
        </td>
      )}
      <td className="px-4 py-3 text-start">
        <div className="h-4 w-48 bg-surface rounded inline-block" />
      </td>
      {isVisible('vendor') && (
        <td className="px-4 py-3 text-start">
          <div className="h-4 w-24 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('total') && (
        <td className="px-4 py-3 text-start">
          <div className="h-4 w-20 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('vatAmount') && (
        <td className="px-4 py-3 text-start">
          <div className="h-4 w-20 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('added') && (
        <td className="px-4 py-3 text-start">
          <div className="h-4 w-16 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('items') && (
        <td className="px-4 py-3 text-start">
          <div className="h-4 w-10 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('confidence') && (
        <td className="px-4 py-3 text-start">
          <div className="h-4 w-12 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('bankLink') && (
        <td className="px-4 py-3 text-start">
          <div className="h-4 w-12 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('aiStatus') && (
        <td className="px-4 py-3 text-start">
          <div className="h-5 w-16 bg-surface rounded inline-block" />
        </td>
      )}
      {isVisible('approval') && (
        <td className="px-4 py-3 text-center">
          <div className="h-5 w-5 bg-surface rounded inline-block" />
        </td>
      )}
    </tr>
  )
}

export function DocumentTable({
  documents,
  isLoading,
  selectedIds = new Set(),
  onSelectionChange,
  onRowClick,
  onBankLinkClick,
  onApprovalToggle,
  approvingIds = new Set(),
  sortColumn,
  sortDirection,
  onSort,
}: DocumentTableProps) {
  const { isVisible } = useColumnVisibility('document')
  const allSelected = documents.length > 0 && selectedIds.size === documents.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < documents.length

  const handleSelectAll = () => {
    if (!onSelectionChange) return
    if (allSelected) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(documents.map((doc) => doc.id)))
    }
  }

  const handleSelectOne = (id: string) => {
    if (!onSelectionChange) return
    const newSelection = new Set(selectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    onSelectionChange(newSelection)
  }

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-text-muted/20">
        <table className="w-full">
          <thead className="bg-surface/50">
            <tr>
              <th className="px-4 py-3 text-start w-12">
                <input type="checkbox" disabled className={checkboxClass} />
              </th>
              {isVisible('type') && <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider w-12">Type</th>}
              {isVisible('size') && <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider w-20">Size</th>}
              <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">Name</th>
              {isVisible('vendor') && <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">Vendor</th>}
              {isVisible('total') && <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider w-24">Total</th>}
              {isVisible('vatAmount') && <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider w-24">VAT</th>}
              {isVisible('added') && <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider w-20">Added</th>}
              {isVisible('items') && <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider w-14">Items</th>}
              {isVisible('confidence') && <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider w-20">Confidence</th>}
              {isVisible('bankLink') && <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider w-36">Link to Transaction</th>}
              {isVisible('aiStatus') && <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider w-36">AI Status</th>}
              {isVisible('approval') && <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-14">Approved</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-text-muted/10">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} isVisible={isVisible} />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (documents.length === 0) {
    return null
  }

  return (
    <div className="overflow-hidden rounded-lg border border-text-muted/20">
      <table className="w-full">
        <thead className="bg-surface/50">
          <tr>
            <th className="px-4 py-3 text-start w-12">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected
                }}
                onChange={handleSelectAll}
                className={checkboxClass}
              />
            </th>
            {isVisible('type') && (
              <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider w-12">
                Type
              </th>
            )}
            {isVisible('size') && (
              <SortHeader
                column="file_size"
                label="Size"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="start"
                className="w-20"
              />
            )}
            <SortHeader
              column="original_name"
              label="Name"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="start"
            />
            {isVisible('vendor') && (
              <SortHeader
                column="vendor_name"
                label="Vendor"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="start"
              />
            )}
            {isVisible('total') && (
              <SortHeader
                column="total_amount_agorot"
                label="Total"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="start"
                className="w-24"
              />
            )}
            {isVisible('vatAmount') && (
              <SortHeader
                column="vat_amount_agorot"
                label="VAT"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="start"
                className="w-24"
              />
            )}
            {isVisible('added') && (
              <SortHeader
                column="created_at"
                label="Added"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="start"
                className="w-20"
              />
            )}
            {isVisible('items') && (
              <SortHeader
                column="line_items_count"
                label="Items"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="start"
                className="w-14"
              />
            )}
            {isVisible('confidence') && (
              <SortHeader
                column="confidence_score"
                label="Confidence"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="start"
                className="w-20"
              />
            )}
            {isVisible('bankLink') && (
              <SortHeader
                column="bank_link"
                label="Link to Transaction"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="start"
                className="w-36"
              />
            )}
            {isVisible('aiStatus') && (
              <SortHeader
                column="status"
                label="AI Status"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="start"
                className="w-36"
              />
            )}
            {isVisible('approval') && (
              <SortHeader
                column="is_approved"
                label="Approved"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
                className="w-14"
              />
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-text-muted/10">
          {documents.map((doc) => {
            const isSelected = selectedIds.has(doc.id)
            const invoice = doc.invoice

            return (
              <tr
                key={doc.id}
                onClick={() => onRowClick?.(doc)}
                className={`hover:bg-surface/30 transition-colors cursor-pointer ${isSelected ? 'bg-primary/10' : ''}`}
              >
                <td className="px-4 py-3 text-start" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectOne(doc.id)}
                    className={checkboxClass}
                  />
                </td>
                {isVisible('type') && (
                  <td className="px-4 py-3 text-start">
                    <FileTypeIcon fileType={doc.file_type || 'unknown'} />
                  </td>
                )}
                {isVisible('size') && (
                  <td className="px-4 py-3 text-start text-sm text-text-muted whitespace-nowrap">
                    {doc.file_size != null ? formatFileSize(doc.file_size) : '-'}
                  </td>
                )}
                <td className="px-4 py-3 text-start">
                  <div className="flex items-center gap-3">
                    {isImageType(doc.file_type || '') && (
                      <img
                        src={doc.url}
                        alt={doc.original_name || 'Document'}
                        className="h-8 w-8 rounded object-cover shrink-0"
                        loading="lazy"
                      />
                    )}
                    <span className="text-sm text-text truncate max-w-xs" title={doc.original_name || undefined}>
                      {doc.original_name || 'Unnamed document'}
                    </span>
                  </div>
                </td>
                {isVisible('vendor') && (
                  <td className="px-4 py-3 text-start text-sm text-text" dir="auto">
                    {invoice?.vendor_name || '-'}
                  </td>
                )}
                {isVisible('total') && (
                  <td className="px-4 py-3 text-start text-sm font-medium text-text">
                    {invoice?.total_amount_agorot ? formatCurrency(invoice.total_amount_agorot, invoice.currency || 'ILS') : '-'}
                  </td>
                )}
                {isVisible('vatAmount') && (
                  <td className="px-4 py-3 text-start text-sm text-text-muted">
                    {invoice?.vat_amount_agorot ? formatCurrency(invoice.vat_amount_agorot, invoice.currency || 'ILS') : '-'}
                  </td>
                )}
                {isVisible('added') && (
                  <td className="px-4 py-3 text-start text-sm text-text-muted whitespace-nowrap">
                    {doc.created_at ? formatDate(doc.created_at) : '-'}
                  </td>
                )}
                {isVisible('items') && (
                  <td className="px-4 py-3 text-start text-sm text-text-muted">
                    {getLineItemsCount(invoice) > 0 ? getLineItemsCount(invoice) : '-'}
                  </td>
                )}
                {isVisible('confidence') && (
                  <td className="px-4 py-3 text-start">
                    <ConfidenceBadge score={invoice?.confidence_score ?? null} />
                  </td>
                )}
                {isVisible('bankLink') && (
                  <td className="px-4 py-3 text-start">
                    <BankLinkBadge
                      status={invoice?.bankLinkStatus}
                      stats={invoice?.line_item_stats}
                      onClick={invoice?.id && onBankLinkClick ? () => onBankLinkClick(invoice.id, invoice.vendor_name) : undefined}
                    />
                  </td>
                )}
                {isVisible('aiStatus') && (
                  <td className="px-4 py-3 text-start">
                    <ExtractionStatus
                      status={getExtractionStatus(doc.status)}
                      confidence={
                        doc.extracted_data &&
                        typeof doc.extracted_data === 'object' &&
                        'confidence' in doc.extracted_data
                          ? (doc.extracted_data.confidence as number)
                          : null
                      }
                      errorMessage={doc.error_message}
                    />
                  </td>
                )}
                {isVisible('approval') && (
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    {invoice ? (
                      <button
                        type="button"
                        onClick={() => onApprovalToggle?.(invoice.id, !invoice.is_approved)}
                        disabled={approvingIds.has(invoice.id)}
                        className="inline-flex items-center justify-center disabled:opacity-50"
                        title={invoice.is_approved ? 'Unapprove' : 'Approve'}
                      >
                        {approvingIds.has(invoice.id) ? (
                          <div className="h-5 w-5 border-2 border-text-muted/30 border-t-primary rounded-full animate-spin" />
                        ) : invoice.is_approved ? (
                          <CheckCircleIcon className="h-5 w-5 text-green-400" />
                        ) : (
                          <div className="h-5 w-5 rounded border-2 border-text-muted/40 hover:border-green-400 transition-colors" />
                        )}
                      </button>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
