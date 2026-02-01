import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { checkLineItemDuplicates } from '@/lib/duplicates'
import type {
  ExtractionRequest,
  ExtendedExtractionResult,
  InvoiceExtraction,
  ExtractedLineItem,
  LineItemDuplicateInfo
} from '@/lib/extraction/types'
import type { DuplicateAction } from '@/lib/duplicates/types'

// Convert amounts to agorot (integer cents) for database storage
function toAgorot(amount: number | null | undefined): number | null {
  return amount != null ? Math.round(amount * 100) : null
}

/**
 * Ensures at least one line item exists.
 * If no line items were extracted, creates a single line item with the invoice total.
 */
function ensureLineItems(
  lineItems: ExtractedLineItem[],
  totals: InvoiceExtraction['totals'],
  vendorName: string | null
): ExtractedLineItem[] {
  // If line items exist, return them
  if (lineItems && lineItems.length > 0) {
    return lineItems
  }

  // Create a default line item with the total amount
  return [
    {
      date: null,
      description: vendorName || 'Invoice Total',
      reference_id: null,
      amount: totals.total,
      currency: totals.currency,
      vat_rate: totals.vat_rate,
      vat_amount: totals.vat_amount,
    },
  ]
}

// Response from edge function
interface EdgeFunctionResponse {
  success: boolean
  invoice_id?: string
  user_id?: string
  confidence?: number
  extracted?: InvoiceExtraction
  error?: string
}

/**
 * Hook for extracting data from a single document using Supabase Edge Function
 *
 * Calls the extract-invoice edge function which handles:
 * - Downloading file from storage
 * - Calling Gemini API for extraction
 * - Creating the invoice record
 *
 * After the edge function returns, this hook handles:
 * - Duplicate detection for line items
 * - Inserting line items (or returning duplicate info for UI)
 * - Updating file status
 */
export function useExtractDocument() {
  const queryClient = useQueryClient()

  return useMutation<ExtendedExtractionResult, Error, ExtractionRequest>({
    onMutate: async ({ fileId }) => {
      // Optimistically update the document status to 'processing' in the cache
      await queryClient.cancelQueries({ queryKey: ['documents'] })

      queryClient.setQueriesData<Array<{ id: string; status: string }>>(
        { queryKey: ['documents'] },
        (old) => old?.map((doc) =>
          doc.id === fileId ? { ...doc, status: 'processing' } : doc
        )
      )
    },
    mutationFn: async ({ fileId, storagePath, fileType }) => {
      console.log('[useExtractDocument] Calling edge function for file:', fileId)

      // Debug: Check if we have a valid session
      const { data: sessionData } = await supabase.auth.getSession()
      console.log('[useExtractDocument] Session check:', {
        hasSession: !!sessionData.session,
        hasAccessToken: !!sessionData.session?.access_token,
        expiresAt: sessionData.session?.expires_at,
        userId: sessionData.session?.user?.id,
      })

      if (!sessionData.session) {
        throw new Error('No active session - please log in again')
      }

      // Call the edge function
      const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>(
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
        console.error('[useExtractDocument] Edge function error:', error)
        throw new Error(error.message || 'Edge function failed')
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Extraction failed')
      }

      const { invoice_id, user_id, confidence, extracted } = data

      if (!invoice_id || !user_id || !extracted) {
        throw new Error('Invalid response from edge function')
      }

      console.log('[useExtractDocument] Edge function returned:', {
        invoice_id,
        confidence,
        lineItems: extracted.line_items?.length,
      })

      // Ensure we have at least one line item (create default if none extracted)
      const lineItems = ensureLineItems(
        extracted.line_items || [],
        extracted.totals,
        extracted.vendor?.name || null
      )

      // Prepare line items for insertion
      const rowsToInsert = lineItems.map((item) => ({
        invoice_id: invoice_id,
        description: item.description,
        reference_id: item.reference_id || null,
        transaction_date: item.date || null,
        total_agorot: toAgorot(item.amount),
        currency: item.currency || 'ILS',
        vat_rate: item.vat_rate || null,
        vat_amount_agorot: toAgorot(item.vat_amount),
      }))

      // Check for duplicates if we have multiple line items (billing summary scenario)
      if (lineItems.length > 1) {
        const lineItemsForCheck = lineItems.map((item) => ({
          reference_id: item.reference_id || null,
          transaction_date: item.date || null,
          amount_agorot: toAgorot(item.amount),
          currency: item.currency || 'ILS',
          description: item.description,
        }))

        const duplicateCheck = await checkLineItemDuplicates(
          user_id,
          extracted.vendor?.name || null,
          lineItemsForCheck
        )

        if (duplicateCheck.duplicateCount > 0) {
          // Update file status to processed (extraction succeeded)
          await supabase
            .from('files')
            .update({
              status: 'processed',
              extracted_data: JSON.parse(JSON.stringify(extracted)),
              processed_at: new Date().toISOString(),
            })
            .eq('id', fileId)

          // Return with duplicate info - let UI handle the modal
          return {
            success: true,
            invoice_id: invoice_id,
            confidence: confidence || extracted.confidence,
            lineItemDuplicates: {
              invoiceId: invoice_id,
              vendorName: extracted.vendor?.name || null,
              totalItems: duplicateCheck.totalItems,
              duplicateCount: duplicateCheck.duplicateCount,
              matches: duplicateCheck.matches,
              pendingLineItems: rowsToInsert,
            },
          }
        }
      }

      // No duplicates or single item - insert line items directly
      if (rowsToInsert.length > 0) {
        const { error: rowsError } = await supabase
          .from('invoice_rows')
          .insert(rowsToInsert)

        if (rowsError) {
          console.error('Failed to insert line items:', rowsError)
          // Don't throw - invoice was created, line items are secondary
        } else {
          console.log(`Inserted ${rowsToInsert.length} line items`)
        }
      }

      // Update file status to processed
      await supabase
        .from('files')
        .update({
          status: 'processed',
          extracted_data: JSON.parse(JSON.stringify(extracted)),
          processed_at: new Date().toISOString(),
        })
        .eq('id', fileId)

      return {
        success: true,
        invoice_id: invoice_id,
        confidence: confidence || extracted.confidence,
      }
    },
    onError: async (error, { fileId }) => {
      // Update file status to failed
      console.error('[useExtractDocument] Mutation error:', error)
      await supabase
        .from('files')
        .update({
          status: 'failed',
          error_message: error.message,
        })
        .eq('id', fileId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

/**
 * Handle line item duplicate action after user chooses
 */
export async function handleLineItemDuplicateAction(
  action: DuplicateAction,
  duplicateInfo: LineItemDuplicateInfo
): Promise<void> {
  const { pendingLineItems, matches } = duplicateInfo

  switch (action) {
    case 'skip': {
      // Only insert non-duplicate items
      const duplicateRefs = new Set(
        matches.flatMap((m) =>
          m.newItem.reference_id ? [m.newItem.reference_id] : []
        )
      )
      const duplicateDates = new Set(
        matches.flatMap((m) =>
          m.newItem.transaction_date ? [m.newItem.transaction_date] : []
        )
      )

      const newItems = pendingLineItems.filter((item) => {
        // Skip if reference_id matches a duplicate
        if (item.reference_id && duplicateRefs.has(item.reference_id)) {
          return false
        }
        // Skip if date+amount matches a duplicate
        if (item.transaction_date && duplicateDates.has(item.transaction_date)) {
          // Check if amount also matches
          const matchingDupe = matches.find(
            (m) =>
              m.newItem.transaction_date === item.transaction_date &&
              m.newItem.amount_agorot === item.total_agorot
          )
          if (matchingDupe) return false
        }
        return true
      })

      if (newItems.length > 0) {
        const { error } = await supabase.from('invoice_rows').insert(newItems)
        if (error) {
          console.error('Failed to insert new line items:', error)
        } else {
          console.log(`Inserted ${newItems.length} new line items (skipped ${matches.length} duplicates)`)
        }
      }
      break
    }

    case 'replace': {
      // Delete existing duplicate items, then insert all new ones
      const existingIds = matches.flatMap((m) => m.existingItems.map((e) => e.id))

      if (existingIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('invoice_rows')
          .delete()
          .in('id', existingIds)

        if (deleteError) {
          console.error('Failed to delete existing line items:', deleteError)
        }
      }

      // Insert all pending line items
      const { error: insertError } = await supabase
        .from('invoice_rows')
        .insert(pendingLineItems)

      if (insertError) {
        console.error('Failed to insert line items:', insertError)
      } else {
        console.log(`Replaced ${existingIds.length} items, inserted ${pendingLineItems.length} line items`)
      }
      break
    }

    case 'keep_both': {
      // Insert all pending items regardless of duplicates
      const { error } = await supabase
        .from('invoice_rows')
        .insert(pendingLineItems)

      if (error) {
        console.error('Failed to insert line items:', error)
      } else {
        console.log(`Inserted ${pendingLineItems.length} line items (keeping duplicates)`)
      }
      break
    }
  }
}

/**
 * Hook for extracting data from multiple documents using Supabase Edge Function
 * Returns array of LineItemDuplicateInfo for documents that have duplicates
 */
export function useExtractMultipleDocuments() {
  const queryClient = useQueryClient()

  return useMutation<LineItemDuplicateInfo[], Error, ExtractionRequest[]>({
    onMutate: async (documents) => {
      if (documents.length === 0) return

      const fileIds = new Set(documents.map((d) => d.fileId))

      // Optimistically update all document statuses to 'processing' in the cache
      await queryClient.cancelQueries({ queryKey: ['documents'] })

      queryClient.setQueriesData<Array<{ id: string; status: string }>>(
        { queryKey: ['documents'] },
        (old) => old?.map((doc) =>
          fileIds.has(doc.id) ? { ...doc, status: 'processing' } : doc
        )
      )
    },
    mutationFn: async (documents): Promise<LineItemDuplicateInfo[]> => {
      if (documents.length === 0) return []

      // Debug: Check if we have a valid session
      const { data: sessionData } = await supabase.auth.getSession()
      console.log('[useExtractMultiple] Session check:', {
        hasSession: !!sessionData.session,
        hasAccessToken: !!sessionData.session?.access_token,
        expiresAt: sessionData.session?.expires_at,
        userId: sessionData.session?.user?.id,
      })

      if (!sessionData.session) {
        throw new Error('No active session - please log in again')
      }

      console.log('[useExtractMultiple] Processing', documents.length, 'documents via edge function')

      // Process documents in parallel batches of 3 (respects rate limits)
      const BATCH_SIZE = 3
      const results: Array<{
        fileId: string
        success: boolean
        invoiceId?: string
        userId?: string
        extracted?: InvoiceExtraction
        error?: string
      }> = []

      for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE)

        const batchResults = await Promise.all(
          batch.map(async (doc) => {
            try {
              const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>(
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
                throw new Error(error.message || 'Edge function failed')
              }

              if (!data?.success) {
                throw new Error(data?.error || 'Extraction failed')
              }

              return {
                fileId: doc.fileId,
                success: true,
                invoiceId: data.invoice_id,
                userId: data.user_id,
                extracted: data.extracted,
              }
            } catch (error) {
              return {
                fileId: doc.fileId,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }
            }
          })
        )

        results.push(...batchResults)

        // Small delay between batches for rate limiting
        if (i + BATCH_SIZE < documents.length) {
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
      }

      // Collect duplicate infos for UI handling
      const duplicateInfos: LineItemDuplicateInfo[] = []

      // Process successful extractions - handle line items with duplicate detection
      const successfulResults = results.filter((r) => r.success && r.extracted && r.invoiceId && r.userId)

      for (const r of successfulResults) {
        const invoiceId = r.invoiceId!
        const userId = r.userId!
        const extracted = r.extracted!

        // Ensure at least one line item
        const lineItems = ensureLineItems(
          extracted.line_items || [],
          extracted.totals,
          extracted.vendor?.name || null
        )

        const rowsToInsert = lineItems.map((item) => ({
          invoice_id: invoiceId,
          description: item.description,
          reference_id: item.reference_id || null,
          transaction_date: item.date || null,
          total_agorot: toAgorot(item.amount),
          currency: item.currency || 'ILS',
          vat_rate: item.vat_rate || null,
          vat_amount_agorot: toAgorot(item.vat_amount),
        }))

        // Check for duplicates if we have multiple line items
        if (lineItems.length > 1) {
          const lineItemsForCheck = lineItems.map((item) => ({
            reference_id: item.reference_id || null,
            transaction_date: item.date || null,
            amount_agorot: toAgorot(item.amount),
            currency: item.currency || 'ILS',
            description: item.description,
          }))

          const duplicateCheck = await checkLineItemDuplicates(
            userId,
            extracted.vendor?.name || null,
            lineItemsForCheck
          )

          if (duplicateCheck.duplicateCount > 0) {
            // Store duplicate info for UI to handle
            duplicateInfos.push({
              invoiceId,
              vendorName: extracted.vendor?.name || null,
              totalItems: duplicateCheck.totalItems,
              duplicateCount: duplicateCheck.duplicateCount,
              matches: duplicateCheck.matches,
              pendingLineItems: rowsToInsert,
            })

            // Update file status to processed (extraction succeeded, duplicates need handling)
            await supabase
              .from('files')
              .update({
                status: 'processed',
                extracted_data: JSON.parse(JSON.stringify(extracted)),
                processed_at: new Date().toISOString(),
              })
              .eq('id', r.fileId)

            // Don't insert line items - let UI handle it
            continue
          }
        }

        // No duplicates - insert directly
        if (rowsToInsert.length > 0) {
          const { error: rowsError } = await supabase
            .from('invoice_rows')
            .insert(rowsToInsert)

          if (rowsError) {
            console.error('Line items insert failed:', rowsError)
          }
        }

        // Update file status to processed
        await supabase
          .from('files')
          .update({
            status: 'processed',
            extracted_data: JSON.parse(JSON.stringify(extracted)),
            processed_at: new Date().toISOString(),
          })
          .eq('id', r.fileId)
      }

      // Update failed files
      const failedResults = results.filter((r) => !r.success)
      if (failedResults.length > 0) {
        await Promise.all(
          failedResults.map((r) =>
            supabase
              .from('files')
              .update({
                status: 'failed',
                error_message: r.error || 'Unknown error',
              })
              .eq('id', r.fileId)
          )
        )
      }

      console.log('[useExtractMultiple] Complete:', {
        total: documents.length,
        success: successfulResults.length,
        failed: failedResults.length,
        withDuplicates: duplicateInfos.length,
      })

      return duplicateInfos
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
