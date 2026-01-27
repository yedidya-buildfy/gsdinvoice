import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Invoice } from '@/types/database'

/**
 * Options for filtering invoices
 */
export interface UseInvoicesOptions {
  /** Filter by invoice status (pending_review, approved, etc.) */
  status?: string
  /** Filter by source file ID */
  fileId?: string
}

/**
 * Invoice with optional file relationship for display
 */
export type InvoiceWithFile = Invoice & {
  file?: {
    original_name: string
    storage_path: string
  } | null
}

/**
 * TanStack Query hook for fetching invoices from the database
 *
 * @param options - Optional filters for status and file_id
 * @returns Query result with invoices data
 *
 * @example
 * // Fetch all invoices
 * const { data: invoices, isLoading } = useInvoices()
 *
 * @example
 * // Fetch invoices pending review
 * const { data: pendingInvoices } = useInvoices({ status: 'pending_review' })
 *
 * @example
 * // Fetch invoices from a specific file
 * const { data: fileInvoices } = useInvoices({ fileId: 'abc-123' })
 */
export function useInvoices(options?: UseInvoicesOptions) {
  const { status, fileId } = options ?? {}

  return useQuery({
    queryKey: ['invoices', status, fileId],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('*, file:files(original_name, storage_path)')

      if (status) {
        query = query.eq('status', status)
      }

      if (fileId) {
        query = query.eq('file_id', fileId)
      }

      const { data, error } = await query.order('created_at', {
        ascending: false,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data as InvoiceWithFile[]
    },
    staleTime: 30 * 1000, // 30 seconds, matches existing pattern
  })
}
