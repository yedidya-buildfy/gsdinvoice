import {
  DocumentPlusIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { useDocuments, getDocumentsWithUrls } from '@/hooks/useDocuments'
import { DocumentCard } from './DocumentCard'

interface DocumentListProps {
  sourceType?: string
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="bg-surface rounded-lg overflow-hidden animate-pulse"
        >
          {/* Thumbnail skeleton */}
          <div className="w-full aspect-square bg-surface-alt" />
          {/* Info skeleton */}
          <div className="p-3 space-y-2">
            <div className="h-4 bg-surface-alt rounded w-3/4" />
            <div className="h-3 bg-surface-alt rounded w-1/2" />
            <div className="h-3 bg-surface-alt rounded w-1/3" />
            <div className="h-5 bg-surface-alt rounded w-1/4 mt-1" />
          </div>
        </div>
      ))}
    </div>
  )
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

export function DocumentList({ sourceType }: DocumentListProps) {
  const { data, isLoading, isError, error, refetch } = useDocuments({
    sourceType,
  })

  // Loading state
  if (isLoading) {
    return <LoadingSkeleton />
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

  // Success state - render document grid
  const documentsWithUrls = getDocumentsWithUrls(data)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {documentsWithUrls.map((doc) => (
        <DocumentCard key={doc.id} document={doc} />
      ))}
    </div>
  )
}
