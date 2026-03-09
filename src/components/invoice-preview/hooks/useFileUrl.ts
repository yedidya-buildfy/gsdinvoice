import { useState, useEffect } from 'react'
import { getSignedFileUrl, getFileBlobUrl } from '@/lib/storage'

interface UseFileUrlResult {
  url: string | null
  loading: boolean
  error: string | null
}

/**
 * Returns a usable URL for a stored file.
 * For PDFs, returns a blob URL (avoids CORS issues with pdfjs).
 * For other types, returns a signed URL.
 */
export function useFileUrl(storagePath: string, fileType?: string): UseFileUrlResult {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isPdf = fileType === 'pdf' || storagePath.toLowerCase().endsWith('.pdf')

  useEffect(() => {
    let cancelled = false
    let blobUrl: string | null = null

    if (!storagePath) {
      setError('No file path provided')
      setLoading(false)
      return
    }

    setLoading(true)
    void (async () => {
      try {
        const fileUrl = isPdf
          ? await getFileBlobUrl(storagePath)
          : await getSignedFileUrl(storagePath)
        if (cancelled) {
          if (isPdf) URL.revokeObjectURL(fileUrl)
          return
        }
        if (isPdf) blobUrl = fileUrl
        setUrl(fileUrl)
        setError(null)
      } catch (err) {
        if (cancelled) return
        console.error('[useFileUrl] Error getting file URL:', err)
        setError(err instanceof Error ? err.message : 'Failed to get file URL')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [storagePath, isPdf])

  return { url, loading, error }
}
