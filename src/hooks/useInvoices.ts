import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Invoice } from '@/types/database'

/**
 * Options for filtering invoices
 */
export interface UseInvoicesOptions {
  /** Filter by invoice status (pending, approved, matched, partial) */
  status?: string
  /** Filter by source file ID */
  fileId?: string
}

/**
 * Bank link status for an invoice based on its line items
 */
export type BankLinkStatus = 'yes' | 'partly' | 'no'

/**
 * Invoice with optional file relationship and line items count for display
 */
export type InvoiceWithFile = Invoice & {
  file?: {
    original_name: string
    storage_path: string
  } | null
  invoice_rows?: { count: number }[]
  line_item_stats?: {
    total: number
    linked: number
  }
  bankLinkStatus?: BankLinkStatus
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
 * const { data: pendingInvoices } = useInvoices({ status: 'pending' })
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
        .select('*, file:files(original_name, storage_path), invoice_rows(id, transaction_id)')

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

      // Compute bank link status for each invoice
      type InvoiceWithRows = Omit<InvoiceWithFile, 'invoice_rows'> & {
        invoice_rows?: { id: string; transaction_id: string | null }[]
      }

      const invoicesWithStatus = (data as InvoiceWithRows[]).map((invoice) => {
        const rows = invoice.invoice_rows ?? []
        const total = rows.length
        const linked = rows.filter((row) => row.transaction_id !== null).length

        let bankLinkStatus: BankLinkStatus = 'no'
        if (total > 0) {
          if (linked === total) {
            bankLinkStatus = 'yes'
          } else if (linked > 0) {
            bankLinkStatus = 'partly'
          }
        }

        // Convert to the expected format with count
        return {
          ...invoice,
          invoice_rows: [{ count: total }],
          line_item_stats: { total, linked },
          bankLinkStatus,
        }
      })

      return invoicesWithStatus as InvoiceWithFile[]
    },
    staleTime: 30 * 1000, // 30 seconds, matches existing pattern
  })
}
