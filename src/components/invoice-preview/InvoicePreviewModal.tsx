import { useRef, useCallback } from 'react'
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  Heading as AriaHeading,
} from 'react-aria-components'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { cx } from '@/utils/cx'
import { FileViewer } from './FileViewer'
import { ExtractedDataPanel } from './ExtractedDataPanel'
import { useInvoiceForm } from './hooks/useInvoiceForm'
import { useUpdateInvoice } from './hooks/useUpdateInvoice'
import { useInvoiceRows } from './hooks/useInvoiceRows'
import type { InvoiceWithFile } from '@/hooks/useInvoices'

interface InvoicePreviewModalProps {
  invoice: InvoiceWithFile
  isOpen: boolean
  onClose: () => void
}

export function InvoicePreviewModal({
  invoice,
  isOpen,
  onClose,
}: InvoicePreviewModalProps) {
  const { data: invoiceRows } = useInvoiceRows(invoice.id)
  const form = useInvoiceForm(invoice, invoiceRows ?? [])
  const updateInvoice = useUpdateInvoice()
  const hasWarnedRef = useRef(false)

  const handleClose = useCallback(() => {
    if (form.isDirty && !hasWarnedRef.current) {
      hasWarnedRef.current = true
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to close?'
      )
      if (!confirmed) {
        hasWarnedRef.current = false
        return
      }
    }
    hasWarnedRef.current = false
    onClose()
  }, [form.isDirty, onClose])

  const handleSave = useCallback(async () => {
    const formData = form.getFormData()
    await updateInvoice.mutateAsync({
      invoiceId: invoice.id,
      invoiceData: formData.invoice,
      lineItems: formData.lineItems,
      deletedRowIds: formData.deletedRowIds,
    })
    onClose()
  }, [form, invoice.id, updateInvoice, onClose])

  if (!isOpen) return null

  const fileName = invoice.file?.original_name ?? 'Invoice'
  const storagePath = invoice.file?.storage_path

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
            <AriaHeading
              slot="title"
              className="text-xl font-semibold text-white truncate"
              dir="auto"
            >
              {fileName}
            </AriaHeading>
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
                      fileType={invoice.file?.original_name?.split('.').pop() ?? 'pdf'}
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
                />
              </Panel>
            </PanelGroup>
          </div>

          {/* Footer */}
          <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
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
              disabled={updateInvoice.isPending || !form.isDirty}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateInvoice.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </footer>
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  )
}
