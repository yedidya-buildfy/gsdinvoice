import { useState, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TrashIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { FileUploader } from '@/components/upload/FileUploader'
import {
  DocumentTable,
  type DocumentWithInvoice,
  type DocumentSortColumn,
} from '@/components/documents/DocumentTable'
import { InvoiceFilters } from '@/components/documents/InvoiceFilters'
import {
  getDefaultInvoiceFilters,
  type InvoiceFilterState,
} from '@/components/documents/invoiceFilterTypes'
import { InvoicePreviewModal } from '@/components/invoice-preview/InvoicePreviewModal'
import { LineItemDuplicateModal } from '@/components/duplicates/LineItemDuplicateModal'
import { useDocuments, getDocumentsWithUrls } from '@/hooks/useDocuments'
import {
  useExtractDocument,
  useExtractMultipleDocuments,
  handleLineItemDuplicateAction,
} from '@/hooks/useDocumentExtraction'
import { useInvoices } from '@/hooks/useInvoices'
import { useSettingsStore } from '@/stores/settingsStore'
import { supabase } from '@/lib/supabase'
import type { ExtractionRequest, LineItemDuplicateInfo } from '@/lib/extraction/types'
import type { DuplicateAction } from '@/lib/duplicates/types'
import { isImageType } from '@/lib/storage'

export function InvoicesPage() {
  const queryClient = useQueryClient()
  const { data: documents, isLoading, refetch } = useDocuments({ sourceType: 'invoice' })
  const { data: invoices } = useInvoices()
  const extractSingle = useExtractDocument()
  const extractMultiple = useExtractMultipleDocuments()
  const { autoExtractOnUpload } = useSettingsStore()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [duplicateQueue, setDuplicateQueue] = useState<LineItemDuplicateInfo[]>([])
  const [isHandlingDuplicates, setIsHandlingDuplicates] = useState(false)

  // Filter state
  const [filters, setFilters] = useState<InvoiceFilterState>(getDefaultInvoiceFilters)

  // Sort state
  const [sortColumn, setSortColumn] = useState<DocumentSortColumn>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Current duplicate being shown in modal
  const currentDuplicate = duplicateQueue[0] ?? null

  // Get documents with URLs and invoices merged
  const documentsWithInvoices = useMemo(() => {
    if (!documents) return []
    const docsWithUrls = getDocumentsWithUrls(documents)
    return docsWithUrls.map((doc) => ({
      ...doc,
      invoice: invoices?.find((inv) => inv.file_id === doc.id) ?? null,
    }))
  }, [documents, invoices])

  // Filter documents
  const filteredDocuments = useMemo(() => {
    return documentsWithInvoices.filter((doc) => {
      // Search filter (name + vendor)
      if (filters.search) {
        const search = filters.search.toLowerCase()
        const name = doc.original_name?.toLowerCase() || ''
        const vendor = doc.invoice?.vendor_name?.toLowerCase() || ''
        if (!name.includes(search) && !vendor.includes(search)) return false
      }

      // Date range filter (invoice_date)
      if (filters.dateFrom && doc.invoice?.invoice_date) {
        if (doc.invoice.invoice_date < filters.dateFrom) return false
      }
      if (filters.dateTo && doc.invoice?.invoice_date) {
        if (doc.invoice.invoice_date > filters.dateTo) return false
      }

      // File type filter
      if (filters.fileTypes.length > 0) {
        const fileType = doc.file_type || ''
        const isImage = isImageType(fileType)
        const matchesType =
          filters.fileTypes.includes(fileType) || (filters.fileTypes.includes('image') && isImage)
        if (!matchesType) return false
      }

      // AI Status filter (also include 'not_invoice' when filtering for 'failed')
      if (filters.aiStatus !== 'all') {
        if (filters.aiStatus === 'failed') {
          // 'failed' filter shows both 'failed' and 'not_invoice' statuses
          if (doc.status !== 'failed' && doc.status !== 'not_invoice') return false
        } else if (doc.status !== filters.aiStatus) {
          return false
        }
      }

      return true
    })
  }, [documentsWithInvoices, filters])

  // Sort documents
  const sortedDocuments = useMemo(() => {
    return [...filteredDocuments].sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      switch (sortColumn) {
        case 'original_name':
          aVal = a.original_name?.toLowerCase() || ''
          bVal = b.original_name?.toLowerCase() || ''
          break
        case 'file_size':
          aVal = a.file_size ?? 0
          bVal = b.file_size ?? 0
          break
        case 'vendor_name':
          aVal = a.invoice?.vendor_name?.toLowerCase() || ''
          bVal = b.invoice?.vendor_name?.toLowerCase() || ''
          break
        case 'total_amount_agorot':
          aVal = a.invoice?.total_amount_agorot ?? 0
          bVal = b.invoice?.total_amount_agorot ?? 0
          break
        case 'vat_amount_agorot':
          aVal = a.invoice?.vat_amount_agorot ?? 0
          bVal = b.invoice?.vat_amount_agorot ?? 0
          break
        case 'created_at':
          aVal = a.created_at || ''
          bVal = b.created_at || ''
          break
        case 'line_items_count':
          aVal = a.invoice?.invoice_rows?.[0]?.count ?? 0
          bVal = b.invoice?.invoice_rows?.[0]?.count ?? 0
          break
        case 'confidence_score':
          aVal = a.invoice?.confidence_score ?? 0
          bVal = b.invoice?.confidence_score ?? 0
          break
        case 'status': {
          const priority: Record<string, number> = {
            processed: 0,
            processing: 1,
            pending: 2,
            failed: 3,
            not_invoice: 4,
          }
          aVal = priority[a.status as string] ?? 5
          bVal = priority[b.status as string] ?? 5
          break
        }
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredDocuments, sortColumn, sortDirection])

  const selectedDocument = useMemo(() => {
    if (!selectedDocumentId) return null
    return documentsWithInvoices.find((doc) => doc.id === selectedDocumentId) ?? null
  }, [selectedDocumentId, documentsWithInvoices])

  const totalCount = documents?.length ?? 0
  const filteredCount = filteredDocuments.length

  // Clear selection when filters change
  const handleFilterChange = useCallback((newFilters: InvoiceFilterState) => {
    setFilters(newFilters)
    setSelectedIds(new Set())
  }, [])

  // Handle sort column click
  const handleSort = useCallback(
    (column: DocumentSortColumn) => {
      if (sortColumn === column) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortColumn(column)
        setSortDirection('desc')
      }
    },
    [sortColumn]
  )

  const handleUploadComplete = async () => {
    // Store current document IDs before refetch
    const previousIds = new Set(documents?.map((d) => d.id) || [])

    // Invalidate and refetch
    await queryClient.invalidateQueries({ queryKey: ['documents'] })
    const result = await refetch()

    // Auto-extract if enabled
    if (autoExtractOnUpload && result.data) {
      // Find newly uploaded pending documents
      const newPendingDocs = result.data.filter(
        (doc) => !previousIds.has(doc.id) && doc.status === 'pending'
      )

      if (newPendingDocs.length > 0) {
        console.log('[InvoicesPage] Auto-extracting', newPendingDocs.length, 'new documents')
        const requests: ExtractionRequest[] = newPendingDocs.map((doc) => ({
          fileId: doc.id,
          storagePath: doc.storage_path,
          fileType: doc.file_type || 'pdf',
        }))

        extractMultiple.mutate(requests, {
          onSuccess: (duplicateInfos) => {
            if (duplicateInfos && duplicateInfos.length > 0) {
              console.log('[InvoicesPage] Auto-extract found duplicates in', duplicateInfos.length, 'documents')
              setDuplicateQueue(duplicateInfos)
            }
          },
        })
      }
    }
  }

  const handleExtract = () => {
    if (selectedIds.size === 0 || !documents) return

    const selectedDocs = documents.filter(
      (doc) => selectedIds.has(doc.id) && doc.status === 'pending'
    )

    if (selectedDocs.length === 0) {
      console.log('[InvoicesPage] No pending documents to extract')
      return
    }

    const requests: ExtractionRequest[] = selectedDocs.map((doc) => ({
      fileId: doc.id,
      storagePath: doc.storage_path,
      fileType: doc.file_type || 'pdf',
    }))

    console.log('[InvoicesPage] Extracting', requests.length, 'documents')
    extractMultiple.mutate(requests, {
      onSuccess: (duplicateInfos) => {
        if (duplicateInfos && duplicateInfos.length > 0) {
          console.log('[InvoicesPage] Found duplicates in', duplicateInfos.length, 'documents')
          setDuplicateQueue(duplicateInfos)
        }
      },
    })
  }

  const handleDelete = async () => {
    if (selectedIds.size === 0) return

    setIsDeleting(true)
    try {
      const idsToDelete = Array.from(selectedIds)

      const { error: invoiceDeleteError } = await supabase
        .from('invoices')
        .delete()
        .in('file_id', idsToDelete)

      if (invoiceDeleteError) {
        console.error('[InvoicesPage] Invoice delete failed:', invoiceDeleteError)
      }

      const { error } = await supabase.from('files').delete().in('id', idsToDelete)

      if (error) {
        console.error('[InvoicesPage] Delete failed:', error)
        return
      }

      console.log('[InvoicesPage] Deleted', idsToDelete.length, 'documents')
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      refetch()
    } catch (err) {
      console.error('[InvoicesPage] Delete error:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleRowClick = (doc: DocumentWithInvoice) => {
    setSelectedDocumentId(doc.id)
  }

  const handleExtractInModal = () => {
    if (!selectedDocument) return

    const request: ExtractionRequest = {
      fileId: selectedDocument.id,
      storagePath: selectedDocument.storage_path,
      fileType: selectedDocument.file_type || 'pdf',
    }

    extractSingle.mutate(request, {
      onSuccess: (result) => {
        if (result.lineItemDuplicates) {
          setDuplicateQueue([result.lineItemDuplicates])
        }
      },
    })
  }

  const handleLineItemDuplicateModalAction = async (action: DuplicateAction) => {
    if (!currentDuplicate) return

    setIsHandlingDuplicates(true)
    try {
      await handleLineItemDuplicateAction(action, currentDuplicate)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    } catch (err) {
      console.error('Failed to handle line item duplicates:', err)
    } finally {
      setIsHandlingDuplicates(false)
      setDuplicateQueue((prev) => prev.slice(1))
    }
  }

  const handleLineItemDuplicateModalClose = () => {
    handleLineItemDuplicateModalAction('skip')
  }

  const pendingCount = documents
    ? documents.filter((doc) => selectedIds.has(doc.id) && doc.status === 'pending').length
    : 0

  // Check if any filters are active
  const hasActiveFilters =
    filters.search ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.fileTypes.length > 0 ||
    filters.aiStatus !== 'all'

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-text mb-6">Invoices & Receipts</h1>

      {/* Upload Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-text mb-4">Upload Documents</h2>
        <div className="bg-surface rounded-lg p-6">
          <FileUploader onUploadComplete={handleUploadComplete} />
        </div>
      </section>

      {/* Documents Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text">Your Documents</h2>
            {totalCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">
                {hasActiveFilters ? `${filteredCount} of ${totalCount}` : totalCount}
              </span>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExtract}
                disabled={extractMultiple.isPending || pendingCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SparklesIcon className="w-4 h-4" />
                {extractMultiple.isPending ? 'Extracting...' : `Extract (${pendingCount})`}
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <TrashIcon className="w-4 h-4" />
                {isDeleting ? 'Deleting...' : `Delete (${selectedIds.size})`}
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        {totalCount > 0 && (
          <div className="mb-4">
            <InvoiceFilters filters={filters} onChange={handleFilterChange} />
          </div>
        )}

        {/* Table */}
        <DocumentTable
          documents={sortedDocuments}
          isLoading={isLoading}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={handleRowClick}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
        />

        {/* Empty state when no documents */}
        {!isLoading && totalCount === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-lg font-medium text-text">No documents uploaded yet</p>
            <p className="text-sm text-text-muted mt-1">
              Upload invoices and receipts to get started
            </p>
          </div>
        )}

        {/* Empty state when filters return no results */}
        {!isLoading && totalCount > 0 && filteredCount === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-text-muted/20 rounded-lg">
            <p className="text-lg font-medium text-text">No matching documents</p>
            <p className="text-sm text-text-muted mt-1">Try adjusting your filters</p>
          </div>
        )}
      </section>

      {/* Invoice Preview Modal */}
      {selectedDocument && (
        <InvoicePreviewModal
          document={selectedDocument}
          isOpen={!!selectedDocument}
          onClose={() => setSelectedDocumentId(null)}
          onExtract={handleExtractInModal}
          isExtracting={extractSingle.isPending || extractMultiple.isPending}
        />
      )}

      {/* Line Item Duplicate Modal */}
      <LineItemDuplicateModal
        isOpen={!!currentDuplicate}
        onClose={handleLineItemDuplicateModalClose}
        vendorName={currentDuplicate?.vendorName ?? null}
        totalItems={currentDuplicate?.totalItems ?? 0}
        duplicateCount={currentDuplicate?.duplicateCount ?? 0}
        matches={currentDuplicate?.matches ?? []}
        pendingLineItems={currentDuplicate?.pendingLineItems ?? []}
        onAction={handleLineItemDuplicateModalAction}
        isLoading={isHandlingDuplicates}
      />
    </div>
  )
}
