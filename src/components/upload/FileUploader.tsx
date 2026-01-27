import { useRef, useState, useCallback, useEffect } from 'react'
import { CloudArrowUpIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useFileUpload } from '@/hooks/useFileUpload'
import { UploadProgress } from './UploadProgress'

interface FileUploaderProps {
  onUploadComplete?: () => void
}

const ACCEPTED_FILE_TYPES = '.pdf,.jpg,.jpeg,.png,.xlsx,.csv'

export function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const {
    files,
    addFiles,
    removeFile,
    uploadAll,
    clearCompleted,
    isUploading,
  } = useFileUpload()

  const pendingCount = files.filter((f) => f.status === 'pending').length
  const prevIsUploadingRef = useRef(isUploading)

  // Call onUploadComplete when uploads finish
  useEffect(() => {
    if (prevIsUploadingRef.current && !isUploading && onUploadComplete) {
      // Check if any files succeeded
      const hasSuccess = files.some((f) => f.status === 'success')
      if (hasSuccess) {
        onUploadComplete()
      }
    }
    prevIsUploadingRef.current = isUploading
  }, [isUploading, files, onUploadComplete])

  const handleClick = () => {
    inputRef.current?.click()
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

      const droppedFiles = e.dataTransfer.files
      if (droppedFiles && droppedFiles.length > 0) {
        addFiles(Array.from(droppedFiles))
      }
    },
    [addFiles]
  )

  const handleUpload = async () => {
    await uploadAll()
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
        <CloudArrowUpIcon
          className={`w-12 h-12 mb-3 transition-colors ${
            isDragOver ? 'text-primary' : 'text-text-muted'
          }`}
        />
        <p className="text-text font-medium">
          Drag files here or click to browse
        </p>
        <p className="text-sm text-text-muted mt-1">
          PDF, JPG, PNG, XLSX, CSV
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileChange}
          className="hidden"
          aria-label="File input"
        />
      </div>

      {/* File list with progress */}
      <UploadProgress
        files={files}
        onRemove={removeFile}
        onClear={clearCompleted}
      />

      {/* Upload button */}
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading}
          className={`
            mt-4 w-full flex items-center justify-center gap-2
            px-4 py-2 rounded-lg font-medium
            transition-colors
            ${
              isUploading
                ? 'bg-primary/50 cursor-not-allowed'
                : 'bg-primary hover:bg-primary/90'
            }
            text-white
          `}
        >
          {isUploading ? (
            <>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              Upload {pendingCount} {pendingCount === 1 ? 'file' : 'files'}
            </>
          )}
        </button>
      )}
    </div>
  )
}
