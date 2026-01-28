"use client"

import { useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowPathIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PDFViewerProps {
  url: string
}

const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

export function PDFViewer({ url }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages)
      setIsLoading(false)
      setError(null)
    },
    []
  )

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error('[PDFViewer] Error loading PDF:', err)
    setError('Failed to load PDF')
    setIsLoading(false)
  }, [])

  const goToPrevPage = useCallback(() => {
    setPageNumber((prev) => Math.max(1, prev - 1))
  }, [])

  const goToNextPage = useCallback(() => {
    setPageNumber((prev) => Math.min(numPages ?? prev, prev + 1))
  }, [numPages])

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP))
  }, [])

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP))
  }, [])

  const resetZoom = useCallback(() => {
    setScale(1)
  }, [])

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 rounded-lg border border-gray-800">
        <div className="text-center">
          <DocumentIcon className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-gray-900 rounded-lg border border-gray-800 overflow-hidden flex flex-col">
      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-400">
            {isLoading ? (
              'Loading...'
            ) : (
              <>
                Page {pageNumber} of {numPages ?? '?'}
              </>
            )}
          </span>
          <button
            type="button"
            onClick={goToNextPage}
            disabled={!numPages || pageNumber >= numPages}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= MIN_ZOOM}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Zoom out"
          >
            <MagnifyingGlassMinusIcon className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-400 min-w-[4rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={resetZoom}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label="Reset zoom"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= MAX_ZOOM}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Zoom in"
          >
            <MagnifyingGlassPlusIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* PDF Container */}
      <div className="flex-1 min-h-0 overflow-auto flex justify-center p-4 bg-gray-950">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p>Loading PDF...</p>
              </div>
            </div>
          }
          className="flex justify-center"
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            loading={
              <div className="flex items-center justify-center text-gray-400 p-4">
                Loading page...
              </div>
            }
            className="shadow-lg"
          />
        </Document>
      </div>
    </div>
  )
}
