"use client"

import { useFileUrl } from './hooks'
import { PDFViewer, SpreadsheetViewer, ImageViewer } from './viewers'
import {
  DocumentIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

interface FileViewerProps {
  storagePath: string
  fileType: string
}

type FileCategory = 'pdf' | 'spreadsheet' | 'image' | 'unknown'

function getFileCategory(fileType: string): FileCategory {
  const type = fileType.toLowerCase()

  if (type === 'pdf' || type === 'application/pdf') {
    return 'pdf'
  }

  if (
    type === 'csv' ||
    type === 'xlsx' ||
    type === 'xls' ||
    type === 'text/csv' ||
    type.includes('spreadsheet') ||
    type.includes('excel') ||
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    type === 'application/vnd.ms-excel'
  ) {
    return 'spreadsheet'
  }

  if (
    type.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type)
  ) {
    return 'image'
  }

  return 'unknown'
}

export function FileViewer({ storagePath, fileType }: FileViewerProps) {
  const { url, loading, error } = useFileUrl(storagePath)
  const category = getFileCategory(fileType)

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 rounded-lg border border-gray-800">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading preview...</p>
        </div>
      </div>
    )
  }

  if (error || !url) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 rounded-lg border border-gray-800">
        <div className="text-center">
          <ExclamationTriangleIcon className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <p className="text-red-400">{error || 'Failed to load file'}</p>
        </div>
      </div>
    )
  }

  if (category === 'pdf') {
    return <PDFViewer url={url} />
  }

  if (category === 'spreadsheet') {
    return <SpreadsheetViewer url={url} fileType={fileType} />
  }

  if (category === 'image') {
    return <ImageViewer url={url} />
  }

  return (
    <div className="h-full flex items-center justify-center bg-gray-900 rounded-lg border border-gray-800">
      <div className="text-center">
        <DocumentIcon className="w-16 h-16 text-gray-700 mx-auto mb-4" />
        <p className="text-gray-400">Preview not available for this file type</p>
        <p className="text-xs text-gray-500 mt-2">{fileType}</p>
      </div>
    </div>
  )
}
