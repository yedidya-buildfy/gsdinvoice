import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getFileUrl } from '@/lib/storage'
import type { File } from '@/types/database'

interface UseDocumentsOptions {
  sourceType?: string
}

/**
 * Document with public URL for display
 */
export type DocumentWithUrl = File & { url: string }

/**
 * Add public URLs to documents for display
 */
export function getDocumentsWithUrls(documents: File[]): DocumentWithUrl[] {
  return documents.map((doc) => ({
    ...doc,
    url: getFileUrl(doc.storage_path),
  }))
}

/**
 * TanStack Query hook for fetching documents from the files table
 */
export function useDocuments(options?: UseDocumentsOptions) {
  const { sourceType } = options ?? {}

  return useQuery({
    queryKey: ['documents', sourceType],
    queryFn: async () => {
      let query = supabase.from('files').select('*')

      if (sourceType) {
        query = query.eq('source_type', sourceType)
      }

      const { data, error } = await query.order('created_at', {
        ascending: false,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data as File[]
    },
    staleTime: 30 * 1000, // 30 seconds, matches existing pattern
  })
}
