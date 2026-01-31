import { useState, useEffect, useCallback } from 'react'
import {
  NoSymbolIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Modal } from '@/components/ui/base/modal/modal'
import { DuplicateActionButton } from './DuplicateActionButton'
import type { TransactionDuplicateCheckResult, DuplicateAction } from '@/lib/duplicates/types'

interface TransactionDuplicateModalProps {
  isOpen: boolean
  onClose: () => void
  fileName: string
  duplicateResult: TransactionDuplicateCheckResult | null
  onAction: (action: DuplicateAction) => void
  isLoading?: boolean
}

export function TransactionDuplicateModal({
  isOpen,
  onClose,
  fileName,
  duplicateResult,
  onAction,
  isLoading,
}: TransactionDuplicateModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0)
    }
  }, [isOpen])

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
  }, [isOpen, isLoading, executeSelectedAction, onClose])

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  if (!duplicateResult) return null

  const { duplicateCount, newCount, matches } = duplicateResult

  return (
    <Modal.Overlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <div className="flex items-start justify-between mb-4">
          <Modal.Title>Duplicate Transactions Detected</Modal.Title>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* File info */}
        <div className="mb-4 p-3 bg-background/50 rounded-lg">
          <p className="text-sm text-text font-medium truncate" title={fileName}>
            {fileName}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {duplicateCount === 1
              ? 'This transaction appears to already exist:'
              : `Found ${duplicateCount} duplicate transactions:`}
          </p>
        </div>

        {/* Matches list */}
        <div className="mb-4 space-y-2 max-h-32 overflow-y-auto">
          {matches.slice(0, 3).map((match, index) => (
            <div
              key={`${match.newTransaction.hash}-${index}`}
              className="flex items-center justify-between p-2 bg-background/30 rounded text-xs"
            >
              <span className="text-text-muted truncate flex-1" title={match.newTransaction.description}>
                {match.newTransaction.description}
              </span>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <span className="text-text-muted">
                  {match.existingTransaction.created_at ? formatDate(match.existingTransaction.created_at) : '-'}
                </span>
                <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">
                  Exact
                </span>
              </div>
            </div>
          ))}
          {matches.length > 3 && (
            <p className="text-xs text-text-muted text-center">
              +{matches.length - 3} more duplicates
            </p>
          )}
        </div>

        <Modal.Actions>
          <DuplicateActionButton
            icon={NoSymbolIcon}
            label="Skip duplicates"
            description={`Import only ${newCount} new transactions`}
            onClick={() => onAction('skip')}
            disabled={isLoading}
            selected={selectedIndex === 0}
          />

          <DuplicateActionButton
            icon={ArrowPathIcon}
            label="Replace existing"
            description={`Update ${duplicateCount} existing transactions with new data`}
            onClick={() => onAction('replace')}
            disabled={isLoading}
            selected={selectedIndex === 1}
          />

          <DuplicateActionButton
            icon={DocumentDuplicateIcon}
            label="Keep both"
            description="Import all transactions and keep both copies"
            onClick={() => onAction('keep_both')}
            disabled={isLoading}
            selected={selectedIndex === 2}
          />
        </Modal.Actions>

        <p className="text-[10px] text-text-muted mt-4 text-center">
          Use arrow keys to navigate, Enter to select
        </p>
      </Modal.Content>
    </Modal.Overlay>
  )
}
