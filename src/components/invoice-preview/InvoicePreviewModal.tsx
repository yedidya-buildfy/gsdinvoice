import { useState, useCallback, useMemo } from 'react'
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  Heading as AriaHeading,
} from 'react-aria-components'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { cx } from '@/utils/cx'
import { FileViewer } from './FileViewer'
import { ExtractedDataPanel } from './ExtractedDataPanel'
import { useInvoiceForm } from './hooks/useInvoiceForm'
import { useUpdateInvoice } from './hooks/useUpdateInvoice'
import { useInvoiceRows } from './hooks/useInvoiceRows'
import type { DocumentWithInvoice } from '@/components/documents/DocumentTable'
import type { Invoice } from '@/types/database'
import { ConfirmDialog } from '@/components/ui/base/modal/confirm-dialog'
import { LoadingIndicator } from '@/components/ui/application/loading-indicator/loading-indicator'

interface InvoicePreviewModalProps {
  document: DocumentWithInvoice
  isOpen: boolean
  onClose: () => void
  onExtract?: () => void
  isExtracting?: boolean
}

// Create an empty invoice placeholder for documents without extraction
function createEmptyInvoice(documentId: string): Invoice {
  return {
    id: '',
    user_id: '',
    file_id: documentId,
    vendor_name: null,
    invoice_number: null,
    invoice_date: null,
    due_date: null,
    subtotal_agorot: null,
    vat_amount_agorot: null,
    total_amount_agorot: null,
    currency: 'ILS',
    confidence_score: null,
    status: 'pending',
    is_income: null,
    is_approved: false,
    approved_at: null,
    exported_at: null,
    team_id: null,
    created_at: new Date().toISOString(),
  }
}

export function InvoicePreviewModal({
  document,
  isOpen,
  onClose,
  onExtract,
  isExtracting = false,
}: InvoicePreviewModalProps) {
  // Use the actual invoice if available, otherwise create an empty placeholder
  const invoice = useMemo(
    () => document.invoice ?? createEmptyInvoice(document.id),
    [document.invoice, document.id]
  )
  const hasInvoice = !!document.invoice
  const isPending = document.status === 'pending'
  const isProcessing = document.status === 'processing'

  const { data: invoiceRows } = useInvoiceRows(invoice.id || '')
  const form = useInvoiceForm(invoice, invoiceRows ?? [])
  const updateInvoice = useUpdateInvoice()
  const [showConfirmClose, setShowConfirmClose] = useState(false)

  const handleClose = useCallback(() => {
    if (form.isDirty) {
      setShowConfirmClose(true)
      return
    }
    onClose()
  }, [form.isDirty, onClose])

  const handleConfirmClose = useCallback(() => {
    setShowConfirmClose(false)
    onClose()
  }, [onClose])

  const handleCancelClose = useCallback(() => {
    setShowConfirmClose(false)
  }, [])

  const handleSave = useCallback(async () => {
    if (!hasInvoice) return // Can't save without an invoice
    const formData = form.getFormData()
    await updateInvoice.mutateAsync({
      invoiceId: invoice.id,
      invoiceData: formData.invoice,
      lineItems: formData.lineItems,
      deletedRowIds: formData.deletedRowIds,
    })
    onClose()
  }, [form, invoice.id, updateInvoice, onClose, hasInvoice])

  if (!isOpen) return null

  const fileName = document.original_name ?? 'Document'
  const storagePath = document.storage_path
  const fileType = document.file_type || document.original_name?.split('.').pop() || 'pdf'

  return (
    <AriaModalOverlay
      isDismissable
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      className={(state) =>
        cx(
          'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
          state.isEntering && 'duration-200 ease-out animate-in fade-in',
          state.isExiting && 'duration-150 ease-in animate-out fade-out'
        )
      }
    >
      <AriaModal
        className={(state) =>
          cx(
            'w-[95vw] h-[95vh] max-w-[1800px]',
            state.isEntering && 'duration-200 ease-out animate-in zoom-in-95',
            state.isExiting && 'duration-150 ease-in animate-out zoom-out-95'
          )
        }
      >
        <AriaDialog className="h-full flex flex-col rounded-2xl bg-gray-950 border border-gray-800 shadow-xl outline-none overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <AriaHeading
                slot="title"
                className="text-xl font-semibold text-white truncate"
                dir="auto"
              >
                {fileName}
              </AriaHeading>
              {isPending && !isExtracting && (
                <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded-full">
                  Not Extracted
                </span>
              )}
              {(isProcessing || isExtracting) && (
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full">
                  מעבד...
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </header>

          {/* Split Panel Content */}
          <div className="flex-1 min-h-0 flex p-6 overflow-hidden">
            <PanelGroup orientation="horizontal" className="h-full">
              {/* Left Panel - File Preview (40%) */}
              <Panel defaultSize={40} minSize={20} className="h-full min-w-[300px]">
                <div className="h-full overflow-hidden">
                  {storagePath ? (
                    <FileViewer
                      storagePath={storagePath}
                      fileType={fileType}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center bg-gray-900 rounded-lg border border-gray-800 text-gray-400">
                      No file available
                    </div>
                  )}
                </div>
              </Panel>

              {/* Resize Handle */}
              <PanelResizeHandle className="w-1 mx-3 bg-gray-800 hover:bg-green-500/50 transition-colors cursor-col-resize group relative">
                <div className="absolute inset-y-0 -left-2 -right-2" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-1 h-1 rounded-full bg-gray-400" />
                  <div className="w-1 h-1 rounded-full bg-gray-400" />
                  <div className="w-1 h-1 rounded-full bg-gray-400" />
                </div>
              </PanelResizeHandle>

              {/* Right Panel - Extracted Data (60%) */}
              <Panel defaultSize={60} minSize={20} className="h-full">
                <ExtractedDataPanel
                  form={form}
                  confidenceScore={invoice.confidence_score}
                  invoiceId={hasInvoice ? invoice.id : undefined}
                />
              </Panel>
            </PanelGroup>
          </div>

          {/* Footer */}
          <footer className="flex items-center justify-between px-6 py-4 border-t border-gray-800">
            <div>
              {/* Extract button for pending documents */}
              {isPending && onExtract && !isExtracting && (
                <button
                  type="button"
                  onClick={onExtract}
                  disabled={isExtracting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <SparklesIcon className="w-4 h-4" />
                  Extract with AI
                </button>
              )}
              {(isExtracting || isProcessing) && (
                <LoadingIndicator
                  type="dot-circle"
                  size="md"
                  rotateLabels
                  labelInterval={2500}
                />
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={updateInvoice.isPending || !form.isDirty || !hasInvoice}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateInvoice.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </footer>
        </AriaDialog>
      </AriaModal>

      {/* Unsaved changes confirmation dialog */}
      <ConfirmDialog
        isOpen={showConfirmClose}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        title="שינויים לא נשמרו"
        message="יש לך שינויים שלא נשמרו. האם אתה בטוח שברצונך לסגור?"
        confirmLabel="סגור בלי לשמור"
        cancelLabel="המשך עריכה"
        variant="warning"
      />
    </AriaModalOverlay>
  )
}
