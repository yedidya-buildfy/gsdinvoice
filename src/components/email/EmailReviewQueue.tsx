import { useState, useMemo } from 'react'
import {
  EnvelopeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import { formatCurrency } from '@/lib/currency'
import type { Invoice } from '@/types/database'
import type { DocumentWithUrl } from '@/hooks/useDocuments'

interface EmailReviewQueueProps {
  documents: (DocumentWithUrl & { invoice: (Invoice & { bankLinkStatus?: string }) | null })[]
  onApprove: (invoiceId: string) => void
  onView: (documentId: string) => void
  onBulkApprove: (invoiceIds: string[]) => void
  approvingIds: Set<string>
}

export function EmailReviewQueue({
  documents,
  onApprove,
  onView,
  onBulkApprove,
  approvingIds,
}: EmailReviewQueueProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Filter to only email-sourced, unapproved documents with invoices
  const emailReceipts = useMemo(() => {
    return documents
      .filter((doc) => {
        const source = doc.source ?? 'upload'
        return source === 'email' && doc.invoice && !doc.invoice.is_approved
      })
      .sort((a, b) => {
        // Sort by confidence score descending
        const confA = a.invoice?.confidence_score ?? 0
        const confB = b.invoice?.confidence_score ?? 0
        return confB - confA
      })
  }, [documents])

  if (emailReceipts.length === 0) return null

  const highConfidence = emailReceipts.filter(
    (doc) => (doc.invoice?.confidence_score ?? 0) >= 80
  )

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-primary/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <EnvelopeIcon className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium text-text">
            Email Receipts for Review
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
            {emailReceipts.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {highConfidence.length > 0 && isExpanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onBulkApprove(highConfidence.map((d) => d.invoice!.id))
              }}
              className="text-xs px-3 py-1 rounded bg-primary text-white hover:bg-primary/80 transition-colors"
            >
              Approve {highConfidence.length} high confidence
            </button>
          )}
          {isExpanded ? (
            <ChevronUpIcon className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-text-muted" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-primary/10">
          <div className="max-h-64 overflow-y-auto divide-y divide-text-muted/10">
            {emailReceipts.map((doc) => {
              const invoice = doc.invoice!
              const confidence = invoice.confidence_score ?? 0

              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          confidence >= 80
                            ? 'bg-green-400'
                            : confidence >= 50
                              ? 'bg-yellow-400'
                              : 'bg-red-400'
                        }`}
                        title={`${confidence}% confidence`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-text truncate">
                        {invoice.vendor_name || doc.original_name}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        {invoice.total_amount_agorot != null && (
                          <span>{formatCurrency(invoice.total_amount_agorot, invoice.currency ?? 'ILS')}</span>
                        )}
                        {invoice.invoice_date && (
                          <span>{new Date(invoice.invoice_date).toLocaleDateString()}</span>
                        )}
                        <span className="text-text-muted/60">{confidence}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() => onView(doc.id)}
                      className="p-1.5 rounded text-text-muted hover:text-text hover:bg-background transition-colors"
                      title="View"
                    >
                      <EyeIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onApprove(invoice.id)}
                      disabled={approvingIds.has(invoice.id)}
                      className="p-1.5 rounded text-text-muted hover:text-green-400 hover:bg-green-400/10 disabled:opacity-50 transition-colors"
                      title="Approve"
                    >
                      {approvingIds.has(invoice.id) ? (
                        <div className="h-4 w-4 border-2 border-text-muted/30 border-t-primary rounded-full animate-spin" />
                      ) : (
                        <CheckIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
