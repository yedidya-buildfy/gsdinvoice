import { useRef, useState, useCallback, useEffect } from 'react'
import {
  TableCellsIcon,
  DocumentIcon,
  XCircleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { useBankStatementUpload } from '@/hooks/useBankStatementUpload'

interface BankUploaderProps {
  onUploadComplete?: () => void
}

const ACCEPTED_FILE_TYPES = '.xlsx,.csv'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function BankUploader({ onUploadComplete }: BankUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const {
    currentFile,
    status,
    progress,
    error,
    savedCount,
    duplicateCount,
    isProcessing,
    addFile,
  } = useBankStatementUpload()

  const prevStatusRef = useRef(status)

  // Call onUploadComplete when status becomes 'success'
  useEffect(() => {
    if (prevStatusRef.current !== 'success' && status === 'success' && onUploadComplete) {
      onUploadComplete()
    }
    prevStatusRef.current = status
  }, [status, onUploadComplete])

  const handleClick = () => {
    if (!isProcessing) {
      inputRef.current?.click()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      addFile(selectedFile)
    }
    // Reset input to allow selecting same file again
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isProcessing) {
      setIsDragOver(true)
    }
  }, [isProcessing])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      if (isProcessing) return

      const droppedFile = e.dataTransfer.files?.[0]
      if (droppedFile) {
        addFile(droppedFile)
      }
    },
    [addFile, isProcessing]
  )

  const getStatusText = () => {
    if (status === 'parsing') return 'Parsing file...'
    if (status === 'saving') return 'Saving transactions...'
    if (status === 'success') return 'Import complete'
    return 'Processing...'
  }

  return (
    <div className="w-full">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={isProcessing ? -1 : 0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (!isProcessing && (e.key === 'Enter' || e.key === ' ')) {
            handleClick()
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center
          w-full min-h-[160px] p-6
          border-2 border-dashed rounded-lg
          transition-all duration-200
          ${isProcessing
            ? 'border-gray-700 bg-gray-900/50 cursor-not-allowed opacity-50'
            : isDragOver
              ? 'border-green-500 bg-green-500/10 cursor-pointer'
              : 'border-gray-700 hover:border-gray-600 bg-gray-900/50 cursor-pointer'
          }
        `}
      >
        <div className={`
          w-16 h-16 rounded-full flex items-center justify-center mb-4
          ${isDragOver ? 'bg-green-500/20' : 'bg-gray-800'}
        `}>
          <TableCellsIcon
            className={`w-8 h-8 transition-colors ${
              isDragOver ? 'text-green-500' : 'text-gray-400'
            }`}
          />
        </div>
        <p className="text-lg font-medium text-white">
          {isDragOver ? 'Drop file here' : 'Drag bank statement or click to browse'}
        </p>
        <p className="mt-1 text-sm text-gray-400">XLSX, CSV</p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileChange}
          className="hidden"
          aria-label="Bank statement file input"
          disabled={isProcessing}
        />
      </div>

      {/* Error message */}
      {error && status === 'error' && (
        <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start space-x-3">
            <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Progress card - only shows during processing or success */}
      {currentFile && status !== 'error' && (
        <div className="mt-4 p-4 rounded-lg bg-gray-900 border border-gray-800">
          {/* File info */}
          <div className="flex items-center space-x-3 mb-3">
            <DocumentIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {currentFile.name}
              </p>
              <p className="text-xs text-gray-500">
                {formatFileSize(currentFile.size)}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span className="flex items-center gap-2">
                {status === 'success' && (
                  <CheckCircleIcon className="w-4 h-4 text-green-500" />
                )}
                {getStatusText()}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  status === 'success'
                    ? 'bg-green-500'
                    : 'bg-gradient-to-r from-green-500 to-green-400'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Success summary */}
          {status === 'success' && (
            <div className="mt-3 text-xs text-gray-400">
              <span className="text-green-400">{savedCount} imported</span>
              {duplicateCount > 0 && (
                <span className="ml-2">{duplicateCount} duplicates skipped</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
