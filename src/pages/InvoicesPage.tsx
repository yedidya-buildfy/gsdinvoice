import { FileUploader } from '@/components/upload/FileUploader'

export function InvoicesPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-text mb-6">Invoices & Receipts</h1>

      {/* Upload Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-text mb-4">Upload Documents</h2>
        <div className="bg-surface rounded-lg p-6">
          <FileUploader />
        </div>
      </section>

      {/* Existing placeholder content */}
      <section>
        <div className="bg-surface rounded-lg p-6">
          <p className="text-text-secondary">
            Upload invoices and receipts for AI extraction. View and manage all documents.
          </p>
        </div>
      </section>
    </div>
  )
}
