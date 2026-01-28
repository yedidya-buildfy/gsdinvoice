import { useRef, useState, useCallback, useEffect } from 'react'
import {
  CloudArrowUpIcon,
  DocumentIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { useFileUpload } from '@/hooks/useFileUpload'
import { FileDuplicateModal } from '@/components/duplicates/FileDuplicateModal'

interface FileUploaderProps {
  onUploadComplete?: () => void
}

const ACCEPTED_FILE_TYPES = '.pdf,.jpg,.jpeg,.png,.xlsx,.csv'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const {
    currentFile,
    currentProgress,
    isUploading,
    addFiles,
    error,
    duplicateResult,
    handleDuplicateAction,
    clearDuplicateResult,
  } = useFileUpload()

  const prevIsUploadingRef = useRef(isUploading)

  // Call onUploadComplete when uploads finish
  useEffect(() => {
    if (prevIsUploadingRef.current && !isUploading && onUploadComplete) {
      onUploadComplete()
    }
    prevIsUploadingRef.current = isUploading
  }, [isUploading, onUploadComplete])

  const handleClick = () => {
    if (!isUploading) {
      inputRef.current?.click()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (selectedFiles && selectedFiles.length > 0) {
      addFiles(Array.from(selectedFiles))
    }
    // Reset input to allow selecting same file again
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isUploading) {
      setIsDragOver(true)
    }
  }, [isUploading])

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

      if (isUploading) return

      const droppedFiles = e.dataTransfer.files
      if (droppedFiles && droppedFiles.length > 0) {
        addFiles(Array.from(droppedFiles))
      }
    },
    [addFiles, isUploading]
  )

  return (
    <div className="w-full">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={isUploading ? -1 : 0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (!isUploading && (e.key === 'Enter' || e.key === ' ')) {
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
          ${isUploading
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
          <CloudArrowUpIcon
            className={`w-8 h-8 transition-colors ${
              isDragOver ? 'text-green-500' : 'text-gray-400'
            }`}
          />
        </div>
        <p className="text-lg font-medium text-white">
          {isDragOver ? 'Drop files here' : 'Drop files or click to upload'}
        </p>
        <p className="mt-1 text-sm text-gray-400">
          Supports: PDF, JPG, PNG, XLSX, CSV
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileChange}
          className="hidden"
          aria-label="File input"
          disabled={isUploading}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start space-x-3">
            <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Upload progress card - only shows during upload */}
      {currentFile && (
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
              <span>{currentProgress === 100 ? 'Complete' : 'Uploading...'}</span>
              <span>{currentProgress}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  currentProgress === 100
                    ? 'bg-green-500'
                    : 'bg-gradient-to-r from-green-500 to-green-400'
                }`}
                style={{ width: `${currentProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Detection Modal */}
      <FileDuplicateModal
        isOpen={!!duplicateResult}
        onClose={clearDuplicateResult}
        fileName={duplicateResult?.file.name ?? ''}
        matches={duplicateResult?.matches ?? []}
        onAction={handleDuplicateAction}
      />
    </div>
  )
}
