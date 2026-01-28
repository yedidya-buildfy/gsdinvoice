import {
  DocumentPlusIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { useDocuments, getDocumentsWithUrls } from '@/hooks/useDocuments'
import { DocumentTable, type DocumentWithInvoice } from './DocumentTable'
import type { Invoice } from '@/types/database'

interface DocumentListProps {
  sourceType?: string
  selectedIds?: Set<string>
  onSelectionChange?: (selectedIds: Set<string>) => void
  onRowClick?: (document: DocumentWithInvoice) => void
  invoices?: Invoice[]
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <DocumentPlusIcon className="w-16 h-16 text-text-muted mb-4" />
      <p className="text-lg font-medium text-text">No documents uploaded yet</p>
      <p className="text-sm text-text-muted mt-1">
        Upload invoices and receipts to get started
      </p>
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry: () => void
}

function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <ExclamationTriangleIcon className="w-16 h-16 text-red-500 mb-4" />
      <p className="text-lg font-medium text-text">Failed to load documents</p>
      <p className="text-sm text-text-muted mt-1">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
      >
        <ArrowPathIcon className="w-4 h-4" />
        Try again
      </button>
    </div>
  )
}

export function DocumentList({
  sourceType,
  selectedIds,
  onSelectionChange,
  onRowClick,
  invoices = [],
}: DocumentListProps) {
  const { data, isLoading, isError, error, refetch } = useDocuments({
    sourceType,
  })

  // Loading state
  if (isLoading) {
    return <DocumentTable documents={[]} isLoading />
  }

  // Error state
  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Unknown error'}
        onRetry={() => refetch()}
      />
    )
  }

  // Empty state
  if (!data || data.length === 0) {
    return <EmptyState />
  }

  // Create a map of file_id -> invoice for quick lookup
  const invoicesByFileId = new Map<string, Invoice>()
  for (const invoice of invoices) {
    if (invoice.file_id) {
      invoicesByFileId.set(invoice.file_id, invoice)
    }
  }

  // Merge documents with their invoices
  const documentsWithUrls = getDocumentsWithUrls(data)
  const documentsWithInvoices: DocumentWithInvoice[] = documentsWithUrls.map((doc) => ({
    ...doc,
    invoice: invoicesByFileId.get(doc.id) ?? null,
  }))

  return (
    <DocumentTable
      documents={documentsWithInvoices}
      selectedIds={selectedIds}
      onSelectionChange={onSelectionChange}
      onRowClick={onRowClick}
    />
  )
}
