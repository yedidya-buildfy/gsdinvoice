import { useState, useEffect } from 'react'
import { getFileUrl } from '@/lib/storage'

interface UseFileUrlResult {
  url: string | null
  loading: boolean
  error: string | null
}

export function useFileUrl(storagePath: string): UseFileUrlResult {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!storagePath) {
      setError('No file path provided')
      setLoading(false)
      return
    }

    try {
      const fileUrl = getFileUrl(storagePath)
      setUrl(fileUrl)
      setError(null)
    } catch (err) {
      console.error('[useFileUrl] Error getting file URL:', err)
      setError(err instanceof Error ? err.message : 'Failed to get file URL')
    } finally {
      setLoading(false)
    }
  }, [storagePath])

  return { url, loading, error }
}
