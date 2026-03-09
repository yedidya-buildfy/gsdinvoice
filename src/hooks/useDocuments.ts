import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getSignedFileUrl } from '@/lib/storage'
import { useAuth } from '@/contexts/AuthContext'
import { useTeam } from '@/contexts/TeamContext'
import type { File } from '@/types/database'

interface UseDocumentsOptions {
  sourceType?: string
}

/**
 * Document with public URL for display
 */
export type DocumentWithUrl = File & { url: string }

async function attachSignedUrls(documents: File[]): Promise<DocumentWithUrl[]> {
  return await Promise.all(
    documents.map(async (doc) => {
      try {
        const url = await getSignedFileUrl(doc.storage_path)
        return { ...doc, url }
      } catch (error) {
        console.error('[useDocuments] Failed to create signed URL:', doc.storage_path, error)
        return { ...doc, url: '' }
      }
    })
  )
}

/**
 * TanStack Query hook for fetching documents from the files table
 */
export function useDocuments(options?: UseDocumentsOptions) {
  const { sourceType } = options ?? {}
  const { user } = useAuth()
  const { currentTeam } = useTeam()

  return useQuery({
    queryKey: ['documents', user?.id, currentTeam?.id, sourceType],
    queryFn: async () => {
      let query = supabase.from('files').select('*')

      // Filter by team
      if (currentTeam?.id) {
        query = query.eq('team_id', currentTeam.id)
      } else {
        query = query.is('team_id', null)
      }

      if (sourceType) {
        query = query.eq('source_type', sourceType)
      }

      const { data, error } = await query.order('created_at', {
        ascending: false,
      })

      if (error) {
        throw new Error(error.message)
      }

      return await attachSignedUrls(data as File[])
    },
    enabled: !!user?.id && !!currentTeam,
    staleTime: 30 * 1000, // 30 seconds, matches existing pattern
  })
}
