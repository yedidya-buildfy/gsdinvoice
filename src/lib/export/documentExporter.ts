import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { supabase } from '@/lib/supabase'
import { BUCKET_NAME } from '@/lib/storage'
import type { ExportProgress } from './types'

interface ExportableFile {
  id: string
  original_name: string
  storage_path: string
  file_type: string
}

type ProgressCallback = (progress: ExportProgress) => void

async function downloadFromStorage(storagePath: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(storagePath)

  if (error || !data) {
    throw new Error(`Failed to download ${storagePath}: ${error?.message}`)
  }

  return new Uint8Array(await data.arrayBuffer())
}

export async function downloadFilesAsZip(
  files: ExportableFile[],
  onProgress?: ProgressCallback,
  signal?: AbortSignal
) {
  const zip = new JSZip()

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

    const file = files[i]
    onProgress?.({
      status: 'downloading',
      currentStep: `Downloading ${file.original_name}`,
      progress: Math.round((i / files.length) * 80),
    })

    const data = await downloadFromStorage(file.storage_path)
    zip.file(file.original_name, data)
  }

  onProgress?.({
    status: 'processing',
    currentStep: 'Creating ZIP archive',
    progress: 85,
  })

  const blob = await zip.generateAsync({ type: 'blob' })

  onProgress?.({
    status: 'complete',
    currentStep: 'Done',
    progress: 100,
  })

  const today = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `documents_${today}.zip`)
}

export async function mergeFilesIntoPDF(
  files: ExportableFile[],
  onProgress?: ProgressCallback,
  signal?: AbortSignal
) {
  const mergedPdf = await PDFDocument.create()

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

    const file = files[i]
    onProgress?.({
      status: 'downloading',
      currentStep: `Processing ${file.original_name}`,
      progress: Math.round((i / files.length) * 80),
    })

    const data = await downloadFromStorage(file.storage_path)

    if (file.file_type === 'pdf') {
      const sourcePdf = await PDFDocument.load(data)
      const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices())
      for (const page of pages) {
        mergedPdf.addPage(page)
      }
    } else {
      // For images, embed them as a page
      const page = mergedPdf.addPage()
      let image
      if (file.file_type === 'png') {
        image = await mergedPdf.embedPng(data)
      } else {
        image = await mergedPdf.embedJpg(data)
      }

      const { width, height } = image.scale(1)
      const pageWidth = page.getWidth()
      const pageHeight = page.getHeight()
      const scale = Math.min(pageWidth / width, pageHeight / height, 1)

      page.drawImage(image, {
        x: (pageWidth - width * scale) / 2,
        y: (pageHeight - height * scale) / 2,
        width: width * scale,
        height: height * scale,
      })
    }
  }

  onProgress?.({
    status: 'processing',
    currentStep: 'Finalizing PDF',
    progress: 90,
  })

  const pdfBytes = await mergedPdf.save()
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })

  onProgress?.({
    status: 'complete',
    currentStep: 'Done',
    progress: 100,
  })

  const today = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `documents_${today}.pdf`)
}

export async function downloadFileIndividually(file: ExportableFile) {
  const data = await downloadFromStorage(file.storage_path)
  const blob = new Blob([data.buffer as ArrayBuffer])
  triggerDownload(blob, file.original_name)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
