import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ExtractionRequest, ExtractionResult } from '@/lib/extraction/types'

/**
 * Hook for extracting data from a single document via Edge Function
 *
 * Invokes the extract-invoice Edge Function and invalidates relevant queries on success.
 *
 * @example
 * const { mutate: extractDocument, isPending } = useExtractDocument()
 * extractDocument({ fileId: 'abc', storagePath: '123/file.pdf', fileType: 'pdf' })
 */
export function useExtractDocument() {
  const queryClient = useQueryClient()

  return useMutation<ExtractionResult, Error, ExtractionRequest>({
    mutationFn: async ({ fileId, storagePath, fileType }) => {
      const { data, error } = await supabase.functions.invoke<ExtractionResult>(
        'extract-invoice',
        {
          body: {
            file_id: fileId,
            storage_path: storagePath,
            file_type: fileType,
          },
        }
      )

      if (error) {
        throw new Error(error.message || 'Edge Function invocation failed')
      }

      if (!data) {
        throw new Error('No response data from extraction')
      }

      if (!data.success) {
        throw new Error(data.error || 'Extraction failed')
      }

      return data
    },
    onSuccess: () => {
      // Invalidate queries to refresh document and invoice lists
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

/**
 * Hook for extracting data from multiple documents sequentially
 *
 * Processes documents one at a time with a delay between requests to avoid rate limits.
 * Use this for batch extraction when user selects multiple documents.
 *
 * @example
 * const { mutate: extractAll, isPending } = useExtractMultipleDocuments()
 * extractAll([
 *   { fileId: 'abc', storagePath: '123/file1.pdf', fileType: 'pdf' },
 *   { fileId: 'def', storagePath: '456/file2.jpg', fileType: 'jpg' },
 * ])
 */
export function useExtractMultipleDocuments() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, ExtractionRequest[]>({
    mutationFn: async (documents) => {
      // Process documents sequentially to avoid rate limits
      for (const doc of documents) {
        const { data, error } = await supabase.functions.invoke<ExtractionResult>(
          'extract-invoice',
          {
            body: {
              file_id: doc.fileId,
              storage_path: doc.storagePath,
              file_type: doc.fileType,
            },
          }
        )

        if (error) {
          throw new Error(`Extraction failed for ${doc.fileId}: ${error.message}`)
        }

        if (!data?.success) {
          throw new Error(`Extraction failed for ${doc.fileId}: ${data?.error || 'Unknown error'}`)
        }

        // Add 500ms delay between requests to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    },
    onSettled: () => {
      // Always invalidate queries, even on error, to reflect partial progress
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
