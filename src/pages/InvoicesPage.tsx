import { useQueryClient } from '@tanstack/react-query'
import { FileUploader } from '@/components/upload/FileUploader'
import { DocumentList } from '@/components/documents/DocumentList'
import { useDocuments } from '@/hooks/useDocuments'

export function InvoicesPage() {
  const queryClient = useQueryClient()
  const { data: documents } = useDocuments({ sourceType: 'invoice' })

  const documentCount = documents?.length ?? 0

  const handleUploadComplete = () => {
    // Invalidate documents query to refresh the list
    queryClient.invalidateQueries({ queryKey: ['documents'] })
  }

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
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-text">Your Documents</h2>
          {documentCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">
              {documentCount}
            </span>
          )}
        </div>
        <DocumentList sourceType="invoice" />
      </section>
    </div>
  )
}
