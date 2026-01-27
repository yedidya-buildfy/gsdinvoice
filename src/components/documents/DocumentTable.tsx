import {
  DocumentTextIcon,
  TableCellsIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline'
import type { DocumentWithUrl } from '@/hooks/useDocuments'
import { formatFileSize } from '@/lib/storage'
import { ExtractionStatus } from './ExtractionStatus'
import type { ExtractionStatus as ExtractionStatusType } from '@/lib/extraction/types'

interface DocumentTableProps {
  documents: DocumentWithUrl[]
  isLoading?: boolean
  selectedIds?: Set<string>
  onSelectionChange?: (selectedIds: Set<string>) => void
}

// Checkbox styling: dark background with green border (uses custom CSS class)
const checkboxClass = 'checkbox-dark'

// Valid extraction statuses
const validStatuses: ExtractionStatusType[] = ['pending', 'processing', 'extracted', 'error']

function getExtractionStatus(status: string | null | undefined): ExtractionStatusType {
  if (status && validStatuses.includes(status as ExtractionStatusType)) {
    return status as ExtractionStatusType
  }
  return 'pending'
}

function FileTypeIcon({ fileType }: { fileType: string }) {
  const iconClass = 'h-5 w-5'

  switch (fileType) {
    case 'pdf':
      return <DocumentTextIcon className={`${iconClass} text-red-400`} />
    case 'xlsx':
      return <TableCellsIcon className={`${iconClass} text-green-400`} />
    case 'csv':
      return <TableCellsIcon className={`${iconClass} text-blue-400`} />
    case 'image':
      return <DocumentIcon className={`${iconClass} text-purple-400`} />
    default:
      return <DocumentIcon className={`${iconClass} text-text-muted`} />
  }
}

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
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
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-16 bg-surface rounded inline-block" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-32 bg-surface rounded inline-block" />
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
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">Type</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">Size</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-40">Uploaded</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-36">AI Status</th>
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
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-16">Type</th>
            <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">Name</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">Size</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-40">Uploaded</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-36">AI Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-text-muted/10">
          {documents.map((doc) => {
            const isSelected = selectedIds.has(doc.id)

            return (
              <tr
                key={doc.id}
                className={`hover:bg-surface/30 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
              >
                <td className="px-4 py-3 text-center">
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
                    {doc.file_type === 'image' && (
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
                <td className="px-4 py-3 text-center text-sm text-text-muted">
                  {doc.file_size ? formatFileSize(doc.file_size) : '-'}
                </td>
                <td className="px-4 py-3 text-center text-sm text-text-muted">
                  {doc.created_at ? formatDate(doc.created_at) : '-'}
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
