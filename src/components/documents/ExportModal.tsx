import { useState, useEffect, useCallback } from 'react'
import {
  ArrowDownTrayIcon,
  XMarkIcon,
  ArchiveBoxIcon,
  DocumentIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline'
import { Modal } from '@/components/ui/base/modal/modal'
import type { DocumentExportFormat, ExportProgress } from '@/lib/export/types'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  itemCount: number
  allPdfs: boolean
  onExport: (format: DocumentExportFormat) => void
  progress: ExportProgress
  isExporting: boolean
  onCancel: () => void
}

const FORMAT_OPTIONS: {
  value: DocumentExportFormat
  label: string
  description: (allPdfs: boolean) => string
  icon: typeof ArchiveBoxIcon
}[] = [
  {
    value: 'zip',
    label: 'Documents ZIP',
    description: () => 'Download all files in a ZIP archive',
    icon: ArchiveBoxIcon,
  },
  {
    value: 'merged-pdf',
    label: 'Merged PDF',
    description: (allPdfs) => allPdfs ? 'Combine all documents into a single PDF' : 'Only available when all selected files are PDFs',
    icon: DocumentIcon,
  },
  {
    value: 'individual',
    label: 'Individual Files',
    description: () => 'Download each file separately',
    icon: DocumentArrowDownIcon,
  },
]

export function ExportModal({
  isOpen,
  onClose,
  itemCount,
  allPdfs,
  onExport,
  progress,
  isExporting,
  onCancel,
}: ExportModalProps) {
  const [format, setFormat] = useState<DocumentExportFormat>('zip')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Auto-switch to 'zip' if merged-pdf becomes disabled
  useEffect(() => {
    if (!allPdfs && format === 'merged-pdf') {
      setFormat('zip')
      setSelectedIndex(0)
    }
  }, [allPdfs, format])

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(format === 'zip' ? 0 : format === 'merged-pdf' ? 1 : 2)
    }
  }, [isOpen, format])

  // Helper to check if an option is disabled
  const isOptionDisabled = useCallback((optionValue: DocumentExportFormat) => {
    return optionValue === 'merged-pdf' && !allPdfs
  }, [allPdfs])

  // Execute action based on selected index
  const executeSelectedAction = useCallback(() => {
    const selectedOption = FORMAT_OPTIONS[selectedIndex]
    if (selectedOption && !isOptionDisabled(selectedOption.value)) {
      onExport(selectedOption.value)
    }
  }, [selectedIndex, isOptionDisabled, onExport])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || isExporting) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          let nextIndex = (selectedIndex + 1) % FORMAT_OPTIONS.length
          // Skip disabled options
          while (isOptionDisabled(FORMAT_OPTIONS[nextIndex].value) && nextIndex !== selectedIndex) {
            nextIndex = (nextIndex + 1) % FORMAT_OPTIONS.length
          }
          setSelectedIndex(nextIndex)
          setFormat(FORMAT_OPTIONS[nextIndex].value)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          let prevIndex = (selectedIndex - 1 + FORMAT_OPTIONS.length) % FORMAT_OPTIONS.length
          // Skip disabled options
          while (isOptionDisabled(FORMAT_OPTIONS[prevIndex].value) && prevIndex !== selectedIndex) {
            prevIndex = (prevIndex - 1 + FORMAT_OPTIONS.length) % FORMAT_OPTIONS.length
          }
          setSelectedIndex(prevIndex)
          setFormat(FORMAT_OPTIONS[prevIndex].value)
          break
        }
        case 'Enter':
          e.preventDefault()
          if (itemCount > 0) {
            executeSelectedAction()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isExporting, selectedIndex, itemCount, isOptionDisabled, executeSelectedAction])

  return (
    <Modal.Overlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Content className="max-w-sm">
        <div className="flex items-start justify-between mb-4">
          <Modal.Title>Export Documents</Modal.Title>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-text-muted mb-4">
          {itemCount} document{itemCount !== 1 ? 's' : ''} will be exported
        </p>

        {/* Format selection */}
        <div className="space-y-2 mb-6">
          {FORMAT_OPTIONS.map((opt, index) => {
            const disabled = isOptionDisabled(opt.value)
            const selected = format === opt.value
            return (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors border ${
                  disabled
                    ? 'cursor-not-allowed opacity-50 bg-background/30 border-text-muted/10'
                    : selected
                    ? 'cursor-pointer bg-primary/20 border-2 border-primary ring-2 ring-primary/20'
                    : 'cursor-pointer bg-background/50 border-text-muted/20 hover:bg-background'
                }`}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={opt.value}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => {
                    if (!disabled) {
                      setFormat(opt.value)
                      setSelectedIndex(index)
                    }
                  }}
                  className="sr-only"
                />
                <opt.icon className={`w-5 h-5 mt-0.5 shrink-0 ${
                  disabled ? 'text-text-muted/50' : selected ? 'text-primary' : 'text-text-muted'
                }`} />
                <div>
                  <div className={`text-sm font-medium ${
                    disabled ? 'text-text-muted/50' : selected ? 'text-primary' : 'text-text'
                  }`}>
                    {opt.label}
                  </div>
                  <div className={`text-xs mt-0.5 ${
                    disabled ? 'text-text-muted/50' : 'text-text-muted'
                  }`}>
                    {opt.description(allPdfs)}
                  </div>
                </div>
              </label>
            )
          })}
        </div>

        {/* Progress bar */}
        {isExporting && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-text-muted mb-1">
              <span>{progress.currentStep}</span>
              <span>{progress.progress}%</span>
            </div>
            <div className="w-full bg-background rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error display */}
        {progress.status === 'error' && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
            {progress.error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          {isExporting ? (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => onExport(format)}
                disabled={itemCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Export
              </button>
            </>
          )}
        </div>
      </Modal.Content>
    </Modal.Overlay>
  )
}
