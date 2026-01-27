import {
  DocumentTextIcon,
  TableCellsIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline'

interface DocumentThumbnailProps {
  url: string
  fileType: string
  fileName: string
}

export function DocumentThumbnail({
  url,
  fileType,
  fileName,
}: DocumentThumbnailProps) {
  // Image files show actual thumbnail
  if (fileType === 'image') {
    return (
      <div className="w-full aspect-square bg-surface-alt rounded-t-lg overflow-hidden">
        <img
          src={url}
          alt={fileName}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
    )
  }

  // PDF files
  if (fileType === 'pdf') {
    return (
      <div className="w-full aspect-square bg-red-500/20 rounded-t-lg flex flex-col items-center justify-center">
        <DocumentTextIcon className="w-12 h-12 text-red-500" />
        <span className="mt-2 text-xs font-medium text-red-500">PDF</span>
      </div>
    )
  }

  // Excel files
  if (fileType === 'xlsx') {
    return (
      <div className="w-full aspect-square bg-green-500/20 rounded-t-lg flex flex-col items-center justify-center">
        <TableCellsIcon className="w-12 h-12 text-green-500" />
        <span className="mt-2 text-xs font-medium text-green-500">XLSX</span>
      </div>
    )
  }

  // CSV files
  if (fileType === 'csv') {
    return (
      <div className="w-full aspect-square bg-blue-500/20 rounded-t-lg flex flex-col items-center justify-center">
        <TableCellsIcon className="w-12 h-12 text-blue-500" />
        <span className="mt-2 text-xs font-medium text-blue-500">CSV</span>
      </div>
    )
  }

  // Fallback for unknown types
  return (
    <div className="w-full aspect-square bg-surface-alt rounded-t-lg flex flex-col items-center justify-center">
      <DocumentIcon className="w-12 h-12 text-text-muted" />
      <span className="mt-2 text-xs font-medium text-text-muted">FILE</span>
    </div>
  )
}
