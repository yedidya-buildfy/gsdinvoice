import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TrashIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { FileUploader } from '@/components/upload/FileUploader'
import { DocumentList } from '@/components/documents/DocumentList'
import type { DocumentWithInvoice } from '@/components/documents/DocumentTable'
import { InvoicePreviewModal } from '@/components/invoice-preview/InvoicePreviewModal'
import { LineItemDuplicateModal } from '@/components/duplicates/LineItemDuplicateModal'
import { useDocuments } from '@/hooks/useDocuments'
import {
  useExtractDocument,
  useExtractMultipleDocuments,
  handleLineItemDuplicateAction,
} from '@/hooks/useDocumentExtraction'
import { useInvoices } from '@/hooks/useInvoices'
import { supabase } from '@/lib/supabase'
import type { ExtractionRequest, LineItemDuplicateInfo } from '@/lib/extraction/types'
import type { DuplicateAction } from '@/lib/duplicates/types'

export function InvoicesPage() {
  const queryClient = useQueryClient()
  const { data: documents, refetch } = useDocuments({ sourceType: 'invoice' })
  const { data: invoices } = useInvoices()
  const extractSingle = useExtractDocument()
  const extractMultiple = useExtractMultipleDocuments()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  // Queue of duplicate infos to process one by one
  const [duplicateQueue, setDuplicateQueue] = useState<LineItemDuplicateInfo[]>([])
  const [isHandlingDuplicates, setIsHandlingDuplicates] = useState(false)

  // Current duplicate being shown in modal (first in queue)
  const currentDuplicate = duplicateQueue[0] ?? null

  // Get the current document from the documents array (stays fresh when queries update)
  const documentsWithInvoices = useMemo(() => {
    if (!documents) return []
    return documents.map((doc) => ({
      ...doc,
      invoice: invoices?.find((inv) => inv.file_id === doc.id) ?? null,
    }))
  }, [documents, invoices])

  const selectedDocument = useMemo(() => {
    if (!selectedDocumentId) return null
    return documentsWithInvoices.find((doc) => doc.id === selectedDocumentId) ?? null
  }, [selectedDocumentId, documentsWithInvoices])

  const documentCount = documents?.length ?? 0

  const handleUploadComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['documents'] })
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

      const { error } = await supabase
        .from('files')
        .delete()
        .in('id', idsToDelete)

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
    // Store just the ID - the document data comes from the query (stays fresh)
    setSelectedDocumentId(doc.id)
  }

  const handleExtractInModal = () => {
    if (!selectedDocument) return

    const request: ExtractionRequest = {
      fileId: selectedDocument.id,
      storagePath: selectedDocument.storage_path,
      fileType: selectedDocument.file_type || 'pdf',
    }

    // Use single extraction to handle line item duplicates
    extractSingle.mutate(request, {
      onSuccess: (result) => {
        if (result.lineItemDuplicates) {
          // Add to queue (will show modal immediately since queue was empty)
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
      // Remove current from queue, show next if any
      setDuplicateQueue((prev) => prev.slice(1))
    }
  }

  const handleLineItemDuplicateModalClose = () => {
    // If user closes without action, default to keeping new items only (skip duplicates)
    handleLineItemDuplicateModalAction('skip')
  }

  const pendingCount = documents
    ? documents.filter(
        (doc) => selectedIds.has(doc.id) && doc.status === 'pending'
      ).length
    : 0

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
            {documentCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">
                {documentCount}
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
                {extractMultiple.isPending
                  ? 'Extracting...'
                  : `Extract (${pendingCount})`}
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
        <DocumentList
          sourceType="invoice"
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={handleRowClick}
          invoices={invoices ?? []}
        />
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
