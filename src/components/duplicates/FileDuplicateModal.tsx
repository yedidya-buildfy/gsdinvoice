import { useState, useEffect, useCallback } from 'react'
import {
  NoSymbolIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Modal } from '@/components/ui/base/modal/modal'
import { DuplicateActionButton } from './DuplicateActionButton'
import { formatDisplayDateFull } from '@/lib/utils/dateFormatter'
import type { FileDuplicateMatch, DuplicateAction } from '@/lib/duplicates/types'

interface FileDuplicateModalProps {
  isOpen: boolean
  onClose: () => void
  fileName: string
  matches: FileDuplicateMatch[]
  onAction: (action: DuplicateAction, replaceFileId?: string) => void
  isLoading?: boolean
}

export function FileDuplicateModal({
  isOpen,
  onClose,
  fileName,
  matches,
  onAction,
  isLoading,
}: FileDuplicateModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0)
    }
  }, [isOpen])

  // Get the first match for replacement option
  const primaryMatch = matches[0]

  // Execute action based on selected index
  const executeSelectedAction = useCallback(() => {
    switch (selectedIndex) {
      case 0:
        onAction('skip')
        break
      case 1:
        onAction('replace', primaryMatch?.existingFile.id)
        break
      case 2:
        onAction('keep_both')
        break
    }
  }, [selectedIndex, onAction, primaryMatch])

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

  
  return (
    <Modal.Overlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <div className="flex items-start justify-between mb-4">
          <Modal.Title>Duplicate File Detected</Modal.Title>
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
            {matches.length === 1
              ? 'This file appears to already exist:'
              : `Found ${matches.length} potential matches:`}
          </p>
        </div>

        {/* Matches list */}
        <div className="mb-4 space-y-2 max-h-32 overflow-y-auto">
          {matches.slice(0, 3).map((match) => (
            <div
              key={match.existingFile.id}
              className="flex items-center justify-between p-2 bg-background/30 rounded text-xs"
            >
              <span className="text-text-muted truncate flex-1" title={match.existingFile.original_name}>
                {match.existingFile.original_name}
              </span>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <span className="text-text-muted">
                  {match.existingFile.created_at ? formatDisplayDateFull(match.existingFile.created_at) : '-'}
                </span>
                {match.matchType === 'exact' ? (
                  <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">
                    Exact
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px]">
                    Similar
                  </span>
                )}
              </div>
            </div>
          ))}
          {matches.length > 3 && (
            <p className="text-xs text-text-muted text-center">
              +{matches.length - 3} more matches
            </p>
          )}
        </div>

        <Modal.Actions>
          <DuplicateActionButton
            icon={NoSymbolIcon}
            label="Don't upload"
            description="Skip this file and continue with others"
            onClick={() => onAction('skip')}
            disabled={isLoading}
            selected={selectedIndex === 0}
          />

          <DuplicateActionButton
            icon={ArrowPathIcon}
            label="Replace existing"
            description={`Delete "${primaryMatch?.existingFile.original_name}" and upload new file`}
            onClick={() => onAction('replace', primaryMatch?.existingFile.id)}
            disabled={isLoading}
            selected={selectedIndex === 1}
          />

          <DuplicateActionButton
            icon={DocumentDuplicateIcon}
            label="Keep both"
            description="Upload anyway and keep both copies"
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
