import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  CheckIcon,
  ArrowUpTrayIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  TableCellsIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
import type { DocumentWithInvoice } from './DocumentTable'
import { formatCurrency } from '@/lib/currency'
import { isImageType } from '@/lib/storage'
import { ExtractionStatus } from './ExtractionStatus'
import {
  BankLinkBadge,
  ConfidenceBadge,
  formatFileSize,
  formatDate,
  getLineItemsCount,
  getExtractionStatus,
  checkboxClass,
} from './documentHelpers'
import type { DocumentColumnKey } from '@/types/columnVisibility'

interface DocumentCardGridProps {
  documents: DocumentWithInvoice[]
  isLoading?: boolean
  selectedIds?: Set<string>
  onSelectionChange?: (selectedIds: Set<string>) => void
  onRowClick?: (document: DocumentWithInvoice) => void
  onBankLinkClick?: (invoiceId: string, vendorName: string | null) => void
  onApprovalToggle?: (invoiceId: string, isApproved: boolean) => void
  approvingIds?: Set<string>
  isVisible?: (col: DocumentColumnKey) => boolean
}

/** PDF first-page thumbnail using react-pdf */
function PdfThumbnail({ url }: { url: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <DocumentTextIcon className="h-12 w-12 text-red-400/60" />
      </div>
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden pointer-events-none">
      <Document
        file={url}
        onLoadError={() => setFailed(true)}
        loading={
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        }
      >
        <Page
          pageNumber={1}
          width={200}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          loading={null}
        />
      </Document>
    </div>
  )
}

/** Large file preview — image, PDF via react-pdf, or type-icon fallback */
function FileThumbnail({ url, fileType, name }: { url?: string; fileType: string; name?: string | null }) {
  const [imgError, setImgError] = useState(false)

  if (isImageType(fileType) && url && !imgError) {
    return (
      <img
        src={url}
        alt={name || 'Document'}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={() => setImgError(true)}
      />
    )
  }

  if (fileType === 'pdf' && url) {
    return <PdfThumbnail url={url} />
  }

  const iconClass = 'h-12 w-12'
  let icon = <DocumentIcon className={`${iconClass} text-text-muted/40`} />
  if (fileType === 'xlsx') icon = <TableCellsIcon className={`${iconClass} text-green-400/60`} />
  else if (fileType === 'csv') icon = <TableCellsIcon className={`${iconClass} text-blue-400/60`} />

  return (
    <div className="w-full h-full flex items-center justify-center">
      {icon}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-lg border border-text-muted/20 overflow-hidden animate-pulse">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <div className="h-4 w-4 bg-text-muted/20 rounded" />
        <div className="flex items-center gap-2">
          <div className="h-5 w-16 bg-text-muted/20 rounded-full" />
          <div className="h-5 w-10 bg-text-muted/20 rounded" />
        </div>
      </div>
      {/* Preview */}
      <div className="mx-2 h-52 bg-text-muted/10 rounded-md" />
      {/* Content */}
      <div className="px-2.5 pt-2.5 pb-1 space-y-1.5">
        <div className="h-4 w-3/4 bg-text-muted/20 rounded" />
        <div className="h-3 w-1/2 bg-text-muted/20 rounded" />
        <div className="flex items-baseline justify-between pt-1">
          <div className="h-5 w-16 bg-text-muted/20 rounded" />
          <div className="h-3 w-14 bg-text-muted/20 rounded" />
        </div>
      </div>
      {/* Actions footer */}
      <div className="border-t border-text-muted/10 px-2.5 py-2 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-3 w-16 bg-text-muted/20 rounded" />
          <div className="h-5 w-5 bg-text-muted/20 rounded" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-3 w-20 bg-text-muted/20 rounded" />
          <div className="h-5 w-12 bg-text-muted/20 rounded" />
        </div>
      </div>
    </div>
  )
}

export function DocumentCardGrid({
  documents,
  isLoading,
  selectedIds = new Set(),
  onSelectionChange,
  onRowClick,
  onBankLinkClick,
  onApprovalToggle,
  approvingIds = new Set(),
  isVisible = () => true,
}: DocumentCardGridProps) {
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (documents.length === 0) {
    return null
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
      {documents.map((doc) => {
        const isSelected = selectedIds.has(doc.id)
        const invoice = doc.invoice

        return (
          <div
            key={doc.id}
            onClick={() => onRowClick?.(doc)}
            className={`bg-surface rounded-lg border overflow-hidden transition-colors cursor-pointer flex flex-col ${
              isSelected
                ? 'ring-2 ring-primary bg-primary/5 border-primary/40'
                : 'border-text-muted/20 hover:border-primary/40'
            }`}
          >
            {/* Zone 1: Toolbar — checkbox + size, AI status + confidence + source */}
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <div onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectOne(doc.id)}
                    className={checkboxClass}
                  />
                </div>
                {invoice?.invoice_date && (
                  <span className="text-xs text-text-muted">
                    {formatDate(invoice.invoice_date)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {isVisible('aiStatus') && (
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
                )}
                {isVisible('confidence') && (
                  <ConfidenceBadge score={invoice?.confidence_score ?? null} />
                )}
                {isVisible('source') && (
                  doc.source === 'email' ? (
                    <EnvelopeIcon className="h-4 w-4 text-primary" title="Email" />
                  ) : (
                    <ArrowUpTrayIcon className="h-4 w-4 text-text-muted" title="Upload" />
                  )
                )}
              </div>
            </div>

            {/* Zone 2: Preview — full-width, tall */}
            <div className="mx-2 h-52 rounded-md overflow-hidden bg-black/20 flex-shrink-0">
              <FileThumbnail
                url={doc.url}
                fileType={doc.file_type || 'unknown'}
                name={doc.original_name}
              />
            </div>

            {/* Zone 3: Identity — vendor, filename, type */}
            <div className="px-2.5 pt-2.5 pb-1">
              {isVisible('vendor') && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-text truncate" dir="auto">
                    {invoice?.vendor_name || 'Unknown vendor'}
                  </p>
                  {isVisible('type') && (
                    <span className="shrink-0 text-xs text-text-muted uppercase font-medium">
                      {doc.file_type || '?'}
                    </span>
                  )}
                </div>
              )}
              {isVisible('name') && (
                <p
                  className="text-xs text-text-muted truncate"
                  title={doc.original_name || undefined}
                >
                  {doc.original_name || 'Unnamed document'}
                </p>
              )}
            </div>

            {/* Zone 4: Date added + Financials */}
            <div className="px-2.5 py-1.5">
              {isVisible('added') && doc.created_at && (
                <p className="text-xs text-text-muted mb-1">{formatDate(doc.created_at)}</p>
              )}
              {(isVisible('total') || isVisible('vatAmount')) && (
                <div className="flex items-baseline justify-between gap-2">
                  {isVisible('total') && (
                    <span className="text-base font-bold text-text">
                      {invoice?.total_amount_agorot
                        ? formatCurrency(invoice.total_amount_agorot, invoice.currency || 'ILS')
                        : '-'}
                    </span>
                  )}
                  {isVisible('vatAmount') && invoice?.vat_amount_agorot ? (
                    <span className="text-xs text-text-muted">
                      VAT {formatCurrency(invoice.vat_amount_agorot, invoice.currency || 'ILS')}
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {/* Zone 5: Actions footer — labeled rows */}
            <div className="mt-auto border-t border-text-muted/10 px-2.5 py-2 space-y-2">
              {/* Approved row */}
              {isVisible('approval') && invoice && (
                <div
                  className="flex items-center justify-between"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs text-text-muted">Approved</span>
                  <button
                    type="button"
                    onClick={() => onApprovalToggle?.(invoice.id, !invoice.is_approved)}
                    disabled={approvingIds.has(invoice.id)}
                    className="inline-flex items-center justify-center disabled:opacity-50"
                    title={invoice.is_approved ? 'Unapprove' : 'Approve'}
                  >
                    {approvingIds.has(invoice.id) ? (
                      <div className="h-5 w-5 border-2 border-text-muted/30 border-t-primary rounded-full animate-spin" />
                    ) : invoice.is_approved ? (
                      <div className="h-5 w-5 rounded border-2 border-green-400 bg-green-400/20 flex items-center justify-center">
                        <CheckIcon className="h-3.5 w-3.5 text-green-400" />
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded border-2 border-text-muted/40 hover:border-green-400 transition-colors" />
                    )}
                  </button>
                </div>
              )}

              {/* Link to Transaction row */}
              {isVisible('bankLink') && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Link to Transaction</span>
                  <BankLinkBadge
                    status={invoice?.bankLinkStatus}
                    stats={invoice?.line_item_stats}
                    onClick={
                      invoice?.id && onBankLinkClick
                        ? () => onBankLinkClick(invoice.id, invoice.vendor_name)
                        : undefined
                    }
                  />
                </div>
              )}

              {/* Items row */}
              {isVisible('items') && getLineItemsCount(invoice) > 0 && (
                <div className="text-xs text-text-muted">
                  {getLineItemsCount(invoice)} items
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
