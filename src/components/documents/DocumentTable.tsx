import {
  DocumentTextIcon,
  TableCellsIcon,
  DocumentIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import type { DocumentWithUrl } from '@/hooks/useDocuments'
import type { Invoice } from '@/types/database'
import { formatCurrency } from '@/lib/utils/currency'
import { ExtractionStatus } from './ExtractionStatus'
import type { ExtractionStatus as ExtractionStatusType } from '@/lib/extraction/types'
import { isImageType } from '@/lib/storage'

export type DocumentWithInvoice = DocumentWithUrl & {
  invoice?: Invoice | null
}

interface DocumentTableProps {
  documents: DocumentWithInvoice[]
  isLoading?: boolean
  selectedIds?: Set<string>
  onSelectionChange?: (selectedIds: Set<string>) => void
  onRowClick?: (document: DocumentWithInvoice) => void
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

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-4 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-5 w-5 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-start">
        <div className="h-4 w-48 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-end">
        <div className="h-4 w-24 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-20 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-20 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-12 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-5 w-16 bg-surface rounded inline-block" />
      </td>
    </tr>
  )
}

export function DocumentTable({
  documents,
  isLoading,
  selectedIds = new Set(),
  onSelectionChange,
  onRowClick,
}: DocumentTableProps) {
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
              <th className="px-4 py-3 text-center w-12">
                <input type="checkbox" disabled className={checkboxClass} />
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-12">Type</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider">Vendor</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">Total</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">VAT</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">Confidence</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-28">AI Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-text-muted/10">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} />
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
            <th className="px-4 py-3 text-center w-12">
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
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-12">Type</th>
            <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">Name</th>
            <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider">Vendor</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">Total</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">VAT</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">Confidence</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-28">AI Status</th>
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
                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectOne(doc.id)}
                    className={checkboxClass}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center">
                    <FileTypeIcon fileType={doc.file_type || 'unknown'} />
                  </div>
                </td>
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
                <td className="px-4 py-3 text-end text-sm text-text" dir="auto">
                  {invoice?.vendor_name || '-'}
                </td>
                <td className="px-4 py-3 text-center text-sm font-medium text-text">
                  {invoice?.total_amount_agorot ? formatCurrency(invoice.total_amount_agorot, invoice.currency || 'ILS') : '-'}
                </td>
                <td className="px-4 py-3 text-center text-sm text-text-muted">
                  {invoice?.vat_amount_agorot ? formatCurrency(invoice.vat_amount_agorot, invoice.currency || 'ILS') : '-'}
                </td>
                <td className="px-4 py-3 text-center">
                  <ConfidenceBadge score={invoice?.confidence_score ?? null} />
                </td>
                <td className="px-4 py-3 text-center">
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
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
