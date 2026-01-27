import {
  ClockIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import type { UploadingFile } from '@/hooks/useFileUpload'
import { formatFileSize } from '@/lib/storage'

interface UploadProgressProps {
  files: UploadingFile[]
  onRemove: (index: number) => void
  onClear: () => void
}

export function UploadProgress({ files, onRemove, onClear }: UploadProgressProps) {
  const hasSuccessFiles = files.some((f) => f.status === 'success')

  if (files.length === 0) return null

  return (
    <div className="mt-4 bg-surface rounded-lg p-4">
      <div className="space-y-3">
        {files.map((file, index) => (
          <div
            key={`${file.file.name}-${index}`}
            className="flex items-center justify-between gap-3 py-2 border-b border-text-muted/10 last:border-b-0"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <StatusIcon status={file.status} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text truncate" title={file.file.name}>
                  {file.file.name}
                </p>
                <p className="text-xs text-text-muted">
                  {formatFileSize(file.file.size)}
                  {file.error && (
                    <span className="text-red-500 ms-2">{file.error}</span>
                  )}
                </p>
              </div>
            </div>

            {(file.status === 'pending' || file.status === 'error') && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="p-1 text-text-muted hover:text-red-500 transition-colors"
                aria-label="Remove file"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {hasSuccessFiles && (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 text-sm text-primary hover:text-primary/80 transition-colors"
        >
          Clear completed
        </button>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: UploadingFile['status'] }) {
  switch (status) {
    case 'pending':
      return <ClockIcon className="w-5 h-5 text-text-muted flex-shrink-0" />
    case 'uploading':
      return (
        <ArrowPathIcon className="w-5 h-5 text-primary flex-shrink-0 animate-spin" />
      )
    case 'success':
      return (
        <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
      )
    case 'error':
      return <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
    default:
      return null
  }
}
