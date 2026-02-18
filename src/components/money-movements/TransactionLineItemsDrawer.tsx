/**
 * Drawer component for viewing and managing line items linked to a transaction
 * Opens when clicking on the linked count badge in Bank/CC tables
 */

import { useState, useEffect } from 'react'
import { XMarkIcon, TrashIcon, PlusIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { Modal } from '@/components/ui/base/modal/modal'
import { formatShekel, formatTransactionAmount, formatLineItemAmount } from '@/lib/currency'
import {
  getLineItemsForTransaction,
  getTransactionLinkSummary,
  unlinkLineItemFromTransaction,
  type LineItemWithInvoice,
  type TransactionLinkSummary,
} from '@/lib/services/lineItemMatcher'
import { TransactionLinkModal } from './TransactionLinkModal'
import type { Transaction } from '@/types/database'

interface TransactionLineItemsDrawerProps {
  isOpen: boolean
  onClose: () => void
  transaction: Transaction | null
  onUnlinkComplete?: () => void
}

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(dateString))
}

export function TransactionLineItemsDrawer({
  isOpen,
  onClose,
  transaction,
  onUnlinkComplete,
}: TransactionLineItemsDrawerProps) {
  // State
  const [lineItems, setLineItems] = useState<LineItemWithInvoice[]>([])
  const [summary, setSummary] = useState<TransactionLinkSummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isUnlinking, setIsUnlinking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Link modal state
  const [showLinkModal, setShowLinkModal] = useState(false)

  // Fetch linked items when drawer opens
  useEffect(() => {
    if (!isOpen || !transaction) return

    let cancelled = false

    async function fetchData() {
      if (!transaction) return
      setIsLoading(true)
      setError(null)
      setLineItems([])
      setSummary(null)

      try {
        const [items, summaryData] = await Promise.all([
          getLineItemsForTransaction(transaction.id),
          getTransactionLinkSummary(transaction.id),
        ])

        if (!cancelled) {
          setLineItems(items)
          setSummary(summaryData)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch linked items')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchData()

    return () => { cancelled = true }
  }, [isOpen, transaction])

  // Handle unlink
  const handleUnlink = async (lineItemId: string) => {
    setIsUnlinking(lineItemId)
    setError(null)

    try {
      const result = await unlinkLineItemFromTransaction(lineItemId)

      if (!result.success) {
        setError(result.error || 'Failed to unlink')
        return
      }

      // Remove from local state
      setLineItems(prev => prev.filter(item => item.id !== lineItemId))

      // Update summary
      if (summary) {
        setSummary({
          ...summary,
          linkedCount: summary.linkedCount - 1,
        })
      }

      onUnlinkComplete?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink')
    } finally {
      setIsUnlinking(null)
    }
  }

  // Handle link complete from modal
  const handleLinkComplete = () => {
    // Refetch data
    if (transaction) {
      setIsLoading(true)
      Promise.all([
        getLineItemsForTransaction(transaction.id),
        getTransactionLinkSummary(transaction.id),
      ]).then(([items, summaryData]) => {
        setLineItems(items)
        setSummary(summaryData)
      }).finally(() => {
        setIsLoading(false)
      })
    }
    onUnlinkComplete?.()
  }

  if (!transaction) return null

  return (
    <>
      <Modal.Overlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
        <Modal.Content className="!w-[calc(80vw-4rem)] !max-w-2xl !h-[calc(70vh-4rem)] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex-1">
              <Modal.Title>Linked Line Items</Modal.Title>
              <div className="text-sm text-text-muted mt-1" dir="auto">
                {transaction.description} - {formatTransactionAmount(transaction)}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:text-text transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Summary */}
          {summary && (
            <div className="flex items-center gap-4 mb-4 p-3 bg-surface/50 border border-text-muted/20 rounded-lg">
              <div className="flex-1">
                <div className="text-xs text-text-muted">Linked Items</div>
                <div className="font-medium text-text">{summary.linkedCount}</div>
              </div>
              <div className="flex-1">
                <div className="text-xs text-text-muted">Total Allocated</div>
                <div className="font-medium text-text">{formatShekel(summary.totalAllocatedAgorot)}</div>
              </div>
              <div className="flex-1">
                <div className="text-xs text-text-muted">Transaction Amount</div>
                <div className="font-medium text-text">{formatShekel(summary.transactionAmountAgorot)}</div>
              </div>
              <div className="flex-1">
                <div className="text-xs text-text-muted">Remaining</div>
                <div className={`font-medium ${summary.remainingAgorot > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {formatShekel(summary.remainingAgorot)}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-y-auto border border-text-muted/20 rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-text-muted">
                Loading...
              </div>
            ) : lineItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2">
                <DocumentTextIcon className="w-8 h-8" />
                <div>No line items linked to this transaction</div>
                <button
                  type="button"
                  onClick={() => setShowLinkModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors mt-2"
                >
                  <PlusIcon className="w-4 h-4" />
                  Link a Line Item
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-text-muted/20">
                    <th className="text-start py-2 px-3 text-text-muted font-medium">Vendor</th>
                    <th className="text-start py-2 px-3 text-text-muted font-medium">Description</th>
                    <th className="text-start py-2 px-3 text-text-muted font-medium w-24">Date</th>
                    <th className="text-end py-2 px-3 text-text-muted font-medium w-28">Amount</th>
                    <th className="text-center py-2 px-3 text-text-muted font-medium w-20">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((lineItem) => (
                    <tr
                      key={lineItem.id}
                      className="border-b border-text-muted/10 hover:bg-background/30"
                    >
                      <td className="py-2 px-3">
                        <div className="font-medium text-text" dir="auto">
                          {lineItem.invoice?.vendor_name || '-'}
                        </div>
                        {lineItem.invoice?.invoice_number && (
                          <div className="text-xs text-text-muted">
                            #{lineItem.invoice.invoice_number}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div className="text-text text-sm" dir="auto">
                          {lineItem.description || '-'}
                        </div>
                        {lineItem.reference_id && (
                          <div className="text-xs text-text-muted font-mono">
                            Ref: {lineItem.reference_id}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-text">
                        {lineItem.transaction_date ? formatDate(lineItem.transaction_date) : '-'}
                      </td>
                      <td className="py-2 px-3 text-end text-text">
                        {formatLineItemAmount({ total_agorot: lineItem.allocation_amount_agorot || lineItem.total_agorot || 0, currency: (lineItem as { currency?: string }).currency })}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleUnlink(lineItem.id)}
                          disabled={isUnlinking === lineItem.id}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50 text-xs"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                          {isUnlinking === lineItem.id ? 'Unlinking...' : 'Unlink'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          {lineItems.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={() => setShowLinkModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Link More
              </button>
              <div className="text-xs text-text-muted">
                {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''} linked
              </div>
            </div>
          )}
        </Modal.Content>
      </Modal.Overlay>

      {/* Link Modal */}
      <TransactionLinkModal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        transaction={transaction}
        onLinkComplete={handleLinkComplete}
      />
    </>
  )
}
