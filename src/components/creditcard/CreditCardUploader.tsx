import { useRef, useState, useCallback, useEffect } from 'react'
import {
  CreditCardIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import { useCreditCardUpload } from '@/hooks/useCreditCardUpload'

interface CreditCardUploaderProps {
  onUploadComplete?: () => void
}

const ACCEPTED_FILE_TYPES = '.xlsx,.csv'

export function CreditCardUploader({ onUploadComplete }: CreditCardUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const {
    file,
    status,
    error,
    parsedCount,
    savedCount,
    duplicateCount,
    selectFile,
    processFile,
    reset,
  } = useCreditCardUpload()

  const prevStatusRef = useRef(status)

  // Call onUploadComplete when status becomes 'success'
  useEffect(() => {
    if (prevStatusRef.current !== 'success' && status === 'success' && onUploadComplete) {
      onUploadComplete()
    }
    prevStatusRef.current = status
  }, [status, onUploadComplete])

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      selectFile(selectedFile)
    }
    // Reset input to allow selecting same file again
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

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

      const droppedFile = e.dataTransfer.files?.[0]
      if (droppedFile) {
        selectFile(droppedFile)
      }
    },
    [selectFile]
  )

  const handleProcess = async () => {
    await processFile()
  }

  const handleReset = () => {
    reset()
  }

  return (
    <div className="w-full">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
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
          cursor-pointer transition-colors
          ${
            isDragOver
              ? 'border-primary bg-primary/10'
              : 'border-text-muted/40 hover:border-primary hover:bg-primary/5'
          }
        `}
      >
        <CreditCardIcon
          className={`w-12 h-12 mb-3 transition-colors ${
            isDragOver ? 'text-primary' : 'text-text-muted'
          }`}
        />
        <p className="text-text font-medium">
          Drag credit card statement or click to browse
        </p>
        <p className="text-sm text-text-muted mt-1">XLSX, CSV</p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileChange}
          className="hidden"
          aria-label="Credit card statement file input"
        />
      </div>

      {/* File info and status */}
      {file && (
        <div className="mt-4 p-4 bg-surface rounded-lg">
          <p className="font-medium text-text mb-2">{file.name}</p>

          {/* Status display */}
          {status === 'idle' && (
            <p className="text-sm text-text-muted">
              Ready to process. Click "Import Transactions" below.
            </p>
          )}

          {status === 'parsing' && (
            <div className="flex items-center gap-2 text-primary">
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              <span className="text-sm">Parsing file...</span>
            </div>
          )}

          {status === 'saving' && (
            <div className="flex items-center gap-2 text-primary">
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              <span className="text-sm">
                Saving transactions... ({parsedCount} parsed)
              </span>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircleIcon className="w-5 h-5" />
                <span className="text-sm font-medium">Import successful!</span>
              </div>
              <div className="text-sm text-text-muted">
                <p>Imported {savedCount} transactions</p>
                {duplicateCount > 0 && (
                  <p>{duplicateCount} duplicates skipped</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="mt-2 px-3 py-1 text-sm text-primary hover:underline"
              >
                Import another file
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-600">
                <ExclamationCircleIcon className="w-5 h-5" />
                <span className="text-sm font-medium">Import failed</span>
              </div>
              <p className="text-sm text-red-600">{error}</p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-2 px-3 py-1 text-sm text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Process button */}
      {file && status === 'idle' && (
        <button
          type="button"
          onClick={handleProcess}
          className="
            mt-4 w-full flex items-center justify-center gap-2
            px-4 py-2 rounded-lg font-medium
            transition-colors
            bg-primary hover:bg-primary/90
            text-white
          "
        >
          Import Transactions
        </button>
      )}
    </div>
  )
}
