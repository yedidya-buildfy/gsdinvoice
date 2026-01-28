import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { InvoiceRow } from '@/types/database'

/**
 * TanStack Query hook for fetching invoice rows (line items) by invoice ID
 */
export function useInvoiceRows(invoiceId: string) {
  return useQuery({
    queryKey: ['invoice-rows', invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_rows')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true })

      if (error) {
        throw new Error(error.message)
      }

      return data as InvoiceRow[]
    },
    staleTime: 30 * 1000,
    enabled: !!invoiceId,
  })
}
