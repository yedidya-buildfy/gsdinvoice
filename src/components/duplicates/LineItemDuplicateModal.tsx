import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  NoSymbolIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { Modal } from '@/components/ui/base/modal/modal'
import { DuplicateActionButton } from './DuplicateActionButton'
import { formatCurrency } from '@/lib/utils/currency'
import type { LineItemDuplicateMatch, DuplicateAction } from '@/lib/duplicates/types'

type TabType = 'all' | 'duplicates' | 'new'

interface PendingLineItem {
  invoice_id: string
  description: string | null
  reference_id: string | null
  transaction_date: string | null
  total_agorot: number | null
  currency: string
  vat_rate: number | null
  vat_amount_agorot: number | null
}

interface LineItemDuplicateModalProps {
  isOpen: boolean
  onClose: () => void
  vendorName: string | null
  totalItems: number
  duplicateCount: number
  matches: LineItemDuplicateMatch[]
  pendingLineItems: PendingLineItem[]
  onAction: (action: DuplicateAction) => void
  isLoading?: boolean
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(dateString))
}

export function LineItemDuplicateModal({
  isOpen,
  onClose,
  vendorName,
  totalItems,
  duplicateCount,
  matches,
  pendingLineItems,
  onAction,
  isLoading,
}: LineItemDuplicateModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeTab, setActiveTab] = useState<TabType>('all')

  const tabs: TabType[] = ['all', 'duplicates', 'new']

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0)
      setActiveTab('all')
    }
  }, [isOpen])

  const newItemsCount = totalItems - duplicateCount

  // Build a set of duplicate reference_ids for quick lookup
  const duplicateRefIds = useMemo(() => {
    const set = new Set<string>()
    for (const match of matches) {
      if (match.newItem.reference_id) {
        set.add(match.newItem.reference_id)
      }
    }
    return set
  }, [matches])

  // Build items list with duplicate status
  const allItems = useMemo(() => {
    return pendingLineItems.map((item) => ({
      ...item,
      isDuplicate: item.reference_id ? duplicateRefIds.has(item.reference_id) : false,
    }))
  }, [pendingLineItems, duplicateRefIds])

  // Filter items based on active tab, with duplicates first in "all" tab
  const displayItems = useMemo(() => {
    const duplicates = allItems.filter((item) => item.isDuplicate)
    const newItems = allItems.filter((item) => !item.isDuplicate)

    switch (activeTab) {
      case 'duplicates':
        return duplicates
      case 'new':
        return newItems
      default:
        return [...duplicates, ...newItems]
    }
  }, [allItems, activeTab])

  // Get currency from first item (they should all be the same)
  const currency = pendingLineItems[0]?.currency || 'ILS'

  // Navigate tabs with arrow keys
  const navigateTab = useCallback((direction: 'left' | 'right') => {
    const currentIndex = tabs.indexOf(activeTab)
    if (direction === 'left' && currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1])
    } else if (direction === 'right' && currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1])
    }
  }, [activeTab, tabs])

  // Execute action based on selected index
  const executeSelectedAction = useCallback(() => {
    switch (selectedIndex) {
      case 0:
        onAction('skip')
        break
      case 1:
        onAction('replace')
        break
      case 2:
        onAction('keep_both')
        break
    }
  }, [selectedIndex, onAction])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % 3)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + 3) % 3)
          break
        case 'ArrowLeft':
          e.preventDefault()
          navigateTab('left')
          break
        case 'ArrowRight':
          e.preventDefault()
          navigateTab('right')
          break
        case 'Enter':
          e.preventDefault()
          if (!isLoading) {
            executeSelectedAction()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isLoading, executeSelectedAction, navigateTab, onClose])

  const tabLabels: Record<TabType, string> = {
    all: `All (${totalItems})`,
    duplicates: `Duplicates (${duplicateCount})`,
    new: `New (${newItemsCount})`,
  }

  return (
    <Modal.Overlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Content className="max-w-5xl w-[95vw]">
        <div className="flex items-start justify-between mb-4">
          <Modal.Title>Duplicate Line Items Found</Modal.Title>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Summary */}
        <div className="mb-4 p-3 bg-background/50 rounded-lg">
          {vendorName && (
            <p className="text-sm text-text font-medium mb-1">{vendorName}</p>
          )}
          <p className="text-xs text-text-muted">
            {duplicateCount} of {totalItems} line items already exist in your records.
            {newItemsCount > 0 && ` ${newItemsCount} new items found.`}
          </p>
        </div>

        {/* Tabs with arrow navigation */}
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => navigateTab('left')}
            disabled={activeTab === 'all'}
            className="p-1 rounded hover:bg-background/50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeftIcon className="w-4 h-4 text-text-muted" />
          </button>

          <div className="flex items-center gap-1 flex-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === tab
                    ? 'bg-primary text-white'
                    : 'bg-background/30 text-text-muted hover:bg-background/50 hover:text-text'
                }`}
              >
                {tabLabels[tab]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => navigateTab('right')}
            disabled={activeTab === 'new'}
            className="p-1 rounded hover:bg-background/50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRightIcon className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Items list */}
        <div className="mb-4 space-y-2 max-h-64 overflow-y-auto">
          {displayItems.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">
              No items in this category
            </p>
          ) : (
            displayItems.map((item, i) => (
              <div
                key={`${item.reference_id || i}-${item.transaction_date}`}
                className={`p-3 rounded text-sm ${
                  item.isDuplicate
                    ? 'bg-red-500/10 border-l-2 border-red-500'
                    : 'bg-green-500/10 border-l-2 border-green-500'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.transaction_date && (
                      <span className="text-text-muted text-xs shrink-0">
                        {formatDate(item.transaction_date)}
                      </span>
                    )}
                    <span className="text-text truncate">
                      {item.description || 'Line item'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {item.total_agorot != null && (
                      <span className="text-text font-medium min-w-[120px] text-right whitespace-nowrap">
                        {formatCurrency(item.total_agorot, currency)}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        item.isDuplicate
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}
                    >
                      {item.isDuplicate ? 'Duplicate' : 'New'}
                    </span>
                  </div>
                </div>
                {item.reference_id && (
                  <div className="mt-1 text-xs text-text-muted truncate" title={item.reference_id}>
                    Ref: {item.reference_id}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <Modal.Actions>
          <DuplicateActionButton
            icon={NoSymbolIcon}
            label={newItemsCount > 0 ? `Add only new items (${newItemsCount})` : "Don't add any"}
            description={
              newItemsCount > 0
                ? 'Skip duplicates and add only new line items'
                : 'All items are duplicates - nothing will be added'
            }
            onClick={() => onAction('skip')}
            disabled={isLoading}
            selected={selectedIndex === 0}
          />

          <DuplicateActionButton
            icon={ArrowPathIcon}
            label="Replace existing"
            description={`Delete ${duplicateCount} existing items and add all ${totalItems} from this document`}
            onClick={() => onAction('replace')}
            disabled={isLoading}
            selected={selectedIndex === 1}
          />

          <DuplicateActionButton
            icon={DocumentDuplicateIcon}
            label="Keep both"
            description={`Add all ${totalItems} items (may create duplicates)`}
            onClick={() => onAction('keep_both')}
            disabled={isLoading}
            selected={selectedIndex === 2}
          />
        </Modal.Actions>

        <p className="text-[10px] text-text-muted mt-4 text-center">
          Use up/down arrows to select action, left/right to change tab, Enter to confirm
        </p>
      </Modal.Content>
    </Modal.Overlay>
  )
}
