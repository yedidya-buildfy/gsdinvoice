import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { InvoiceUpdate, InvoiceRowInsert, InvoiceRowUpdate } from '@/types/database'

interface UpdateInvoiceParams {
  invoiceId: string
  invoiceData: InvoiceUpdate
  lineItems: (InvoiceRowInsert | InvoiceRowUpdate)[]
  deletedRowIds: string[]
}

/**
 * TanStack Query mutation hook for updating invoice and its line items
 */
export function useUpdateInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      invoiceId,
      invoiceData,
      lineItems,
      deletedRowIds,
    }: UpdateInvoiceParams) => {
      // Update the invoice
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update(invoiceData)
        .eq('id', invoiceId)

      if (invoiceError) {
        throw new Error(`Failed to update invoice: ${invoiceError.message}`)
      }

      // Delete removed line items
      if (deletedRowIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('invoice_rows')
          .delete()
          .in('id', deletedRowIds)

        if (deleteError) {
          throw new Error(`Failed to delete line items: ${deleteError.message}`)
        }
      }

      // Separate new items (inserts) from existing items (updates)
      const newItems = lineItems.filter(
        (item): item is InvoiceRowInsert => !('id' in item) || !item.id
      )
      const existingItems = lineItems.filter(
        (item): item is InvoiceRowUpdate & { id: string } =>
          'id' in item && !!item.id
      )

      // Insert new line items
      if (newItems.length > 0) {
        const { error: insertError } = await supabase
          .from('invoice_rows')
          .insert(newItems)

        if (insertError) {
          throw new Error(`Failed to insert line items: ${insertError.message}`)
        }
      }

      // Update existing line items
      for (const item of existingItems) {
        const { id, ...updateData } = item
        const { error: updateError } = await supabase
          .from('invoice_rows')
          .update(updateData)
          .eq('id', id)

        if (updateError) {
          throw new Error(`Failed to update line item: ${updateError.message}`)
        }
      }

      return { success: true }
    },
    onSuccess: (_, { invoiceId }) => {
      // Invalidate relevant queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice-rows', invoiceId] })
    },
    onError: (error) => {
      console.error('[useUpdateInvoice] Error:', error)
    },
  })
}
