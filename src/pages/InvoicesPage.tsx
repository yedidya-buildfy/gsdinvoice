import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TrashIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { FileUploader } from '@/components/upload/FileUploader'
import { DocumentList } from '@/components/documents/DocumentList'
import { useDocuments } from '@/hooks/useDocuments'
import { useExtractMultipleDocuments } from '@/hooks/useDocumentExtraction'
import { useInvoices } from '@/hooks/useInvoices'
import { supabase } from '@/lib/supabase'
import { formatShekel } from '@/lib/utils/currency'
import type { ExtractionRequest } from '@/lib/extraction/types'

function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateString))
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

function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending_review: 'bg-yellow-500/20 text-yellow-400',
    approved: 'bg-green-500/20 text-green-400',
    rejected: 'bg-red-500/20 text-red-400',
    matched: 'bg-blue-500/20 text-blue-400',
  }

  const labels: Record<string, string> = {
    pending_review: 'לבדיקה',
    approved: 'אושר',
    rejected: 'נדחה',
    matched: 'מותאם',
  }

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.pending_review}`}>
      {labels[status] || status}
    </span>
  )
}

export function InvoicesPage() {
  const queryClient = useQueryClient()
  const { data: documents, refetch } = useDocuments({ sourceType: 'invoice' })
  const { data: invoices } = useInvoices()
  const extractMultiple = useExtractMultipleDocuments()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)

  const documentCount = documents?.length ?? 0
  const invoiceCount = invoices?.length ?? 0

  const handleUploadComplete = () => {
    // Invalidate documents query to refresh the list
    queryClient.invalidateQueries({ queryKey: ['documents'] })
  }

  const handleExtract = () => {
    if (selectedIds.size === 0 || !documents) return

    // Get selected documents that are pending (not already extracted)
    const selectedDocs = documents.filter(
      (doc) => selectedIds.has(doc.id) && doc.status === 'pending'
    )

    if (selectedDocs.length === 0) {
      console.log('[InvoicesPage] No pending documents to extract')
      return
    }

    // Map to ExtractionRequest format
    const requests: ExtractionRequest[] = selectedDocs.map((doc) => ({
      fileId: doc.id,
      storagePath: doc.storage_path,
      fileType: doc.file_type || 'pdf',
    }))

    console.log('[InvoicesPage] Extracting', requests.length, 'documents')
    extractMultiple.mutate(requests)
  }

  const handleDelete = async () => {
    if (selectedIds.size === 0) return

    setIsDeleting(true)
    try {
      const idsToDelete = Array.from(selectedIds)

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
      refetch()
    } catch (err) {
      console.error('[InvoicesPage] Delete error:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  // Count pending documents among selected
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
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text">Your Documents</h2>
            {documentCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">
                {documentCount}
              </span>
            )}
          </div>

          {/* Action buttons - only show when items selected */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              {/* Extract button */}
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

              {/* Delete button */}
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
        />
      </section>

      {/* Extracted Invoices Section */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-text">Extracted Invoices</h2>
          {invoiceCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">
              {invoiceCount}
            </span>
          )}
        </div>

        {invoiceCount === 0 ? (
          <div className="bg-surface rounded-lg p-8 text-center">
            <p className="text-text-muted">
              No invoices extracted yet. Select documents and click Extract to process them.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-text-muted/20">
            <table className="w-full">
              <thead className="bg-surface/50">
                <tr>
                  <th className="px-4 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider">
                    Vendor
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-32">
                    Invoice #
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-28">
                    Date
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-28">
                    VAT
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-32">
                    Total
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">
                    Confidence
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-text-muted/10">
                {invoices?.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-3 text-end text-sm text-text" dir="rtl">
                      {invoice.vendor_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-text-muted">
                      {invoice.invoice_number || '-'}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-text-muted">
                      {formatDate(invoice.invoice_date)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-text-muted">
                      {invoice.vat_amount_agorot
                        ? formatShekel(invoice.vat_amount_agorot)
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-text">
                      {invoice.total_amount_agorot
                        ? formatShekel(invoice.total_amount_agorot)
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ConfidenceBadge score={invoice.confidence_score} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <InvoiceStatusBadge status={invoice.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
