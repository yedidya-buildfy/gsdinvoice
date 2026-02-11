import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface ApprovalUpdate {
  invoiceId: string
  isApproved: boolean
}

export function useUpdateInvoiceApproval() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ invoiceId, isApproved }: ApprovalUpdate) => {
      const { data, error } = await supabase
        .from('invoices')
        .update({
          is_approved: isApproved,
          approved_at: isApproved ? new Date().toISOString() : null,
        })
        .eq('id', invoiceId)
        .select('id, is_approved')
        .single()

      if (error) {
        console.error('[useUpdateInvoiceApproval] Supabase error:', error.message, error.details, error.hint)
        throw error
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error) => {
      console.error('[useUpdateInvoiceApproval] Mutation failed:', error)
    },
  })
}
