import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { extractInvoiceWithGemini } from '@/lib/gemini/extractInvoice'
import type { ExtractionRequest, ExtractionResult, InvoiceExtraction, ExtractedLineItem } from '@/lib/extraction/types'

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

/**
 * Hook for extracting data from a single document using client-side Gemini API
 *
 * Downloads file from storage, sends to Gemini for extraction, saves result to database.
 */
export function useExtractDocument() {
  const queryClient = useQueryClient()

  return useMutation<ExtractionResult, Error, ExtractionRequest>({
    mutationFn: async ({ fileId, storagePath, fileType }) => {
      // Update file status to processing
      await supabase
        .from('files')
        .update({ status: 'processing' })
        .eq('id', fileId)

      try {
        // Download file from Supabase Storage
        const { data: blob, error: downloadError } = await supabase.storage
          .from('documents')
          .download(storagePath)

        if (downloadError) {
          throw new Error(`Download failed: ${downloadError.message}`)
        }

        if (!blob) {
          throw new Error('No file data returned from storage')
        }

        console.log('Downloaded file:', { size: blob.size, type: blob.type, fileType })

        // Extract invoice data using Gemini
        const extracted = await extractInvoiceWithGemini(blob, fileType)

        // Get user_id from the file record
        const { data: fileRecord, error: fileError } = await supabase
          .from('files')
          .select('user_id')
          .eq('id', fileId)
          .single()

        if (fileError || !fileRecord) {
          throw new Error(`Failed to get file record: ${fileError?.message || 'Not found'}`)
        }

        // Insert into invoices table with amounts converted to agorot
        // Map new structure to database columns
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            user_id: fileRecord.user_id,
            file_id: fileId,
            vendor_name: extracted.vendor?.name || null,
            invoice_number: extracted.document?.number || null,
            invoice_date: extracted.document?.date || null,
            subtotal_agorot: toAgorot(extracted.totals?.subtotal),
            vat_amount_agorot: toAgorot(extracted.totals?.vat_amount),
            total_amount_agorot: toAgorot(extracted.totals?.total),
            currency: extracted.totals?.currency || 'ILS',
            confidence_score: extracted.confidence,
            status: 'pending',
          })
          .select()
          .single()

        if (invoiceError) {
          throw new Error(`Failed to create invoice: ${invoiceError.message}`)
        }

        // Ensure we have at least one line item (create default if none extracted)
        const lineItems = ensureLineItems(
          extracted.line_items || [],
          extracted.totals,
          extracted.vendor?.name || null
        )

        // Insert line items into invoice_rows table
        if (lineItems.length > 0) {
          const rowsToInsert = lineItems.map((item) => ({
            invoice_id: invoice.id,
            description: item.description,
            reference_id: item.reference_id || null,
            transaction_date: item.date || null,
            total_agorot: toAgorot(item.amount),
            currency: item.currency || 'ILS',
            vat_rate: item.vat_rate || null,
            vat_amount_agorot: toAgorot(item.vat_amount),
          }))

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

        // Update file status to extracted
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
          invoice_id: invoice.id,
          confidence: extracted.confidence,
        }
      } catch (error) {
        // Update file status to failed (UI will derive 'not_invoice' from error_message)
        await supabase
          .from('files')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('id', fileId)

        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

/**
 * Hook for extracting data from multiple documents with optimized batching
 */
export function useExtractMultipleDocuments() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, ExtractionRequest[]>({
    mutationFn: async (documents) => {
      if (documents.length === 0) return

      const fileIds = documents.map((d) => d.fileId)

      // Pre-fetch all file records in one query to get user_ids
      const { data: fileRecords, error: filesError } = await supabase
        .from('files')
        .select('id, user_id')
        .in('id', fileIds)

      if (filesError) {
        throw new Error(`Failed to fetch file records: ${filesError.message}`)
      }

      const userIdByFileId = new Map(fileRecords?.map((f) => [f.id, f.user_id]) || [])

      // Batch update all files to processing status
      await supabase
        .from('files')
        .update({ status: 'processing' })
        .in('id', fileIds)

      // Process documents in parallel batches of 3 (respects rate limits)
      const BATCH_SIZE = 3
      const results: Array<{
        fileId: string
        success: boolean
        extracted?: InvoiceExtraction
        error?: string
      }> = []

      for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE)

        const batchResults = await Promise.all(
          batch.map(async (doc) => {
            try {
              const { data: blob, error: downloadError } = await supabase.storage
                .from('documents')
                .download(doc.storagePath)

              if (downloadError) {
                throw new Error(`Download failed: ${downloadError.message}`)
              }

              if (!blob) {
                throw new Error('No file data returned from storage')
              }

              const extracted = await extractInvoiceWithGemini(blob, doc.fileType)

              return { fileId: doc.fileId, success: true, extracted }
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

      // Batch insert all successful invoices and their line items
      const successfulResults = results.filter((r) => r.success && r.extracted)
      if (successfulResults.length > 0) {
        const invoicesToInsert = successfulResults
          .filter((r) => userIdByFileId.has(r.fileId))
          .map((r) => ({
            user_id: userIdByFileId.get(r.fileId)!,
            file_id: r.fileId,
            vendor_name: r.extracted!.vendor?.name || null,
            invoice_number: r.extracted!.document?.number || null,
            invoice_date: r.extracted!.document?.date || null,
            subtotal_agorot: toAgorot(r.extracted!.totals?.subtotal),
            vat_amount_agorot: toAgorot(r.extracted!.totals?.vat_amount),
            total_amount_agorot: toAgorot(r.extracted!.totals?.total),
            currency: r.extracted!.totals?.currency || 'ILS',
            confidence_score: r.extracted!.confidence,
            status: 'pending',
          }))

        const { data: insertedInvoices, error: invoiceError } = await supabase
          .from('invoices')
          .insert(invoicesToInsert)
          .select('id, file_id')

        if (invoiceError) {
          console.error('Batch invoice insert failed:', invoiceError)
        }

        // Insert line items for each invoice
        if (insertedInvoices && insertedInvoices.length > 0) {
          const invoiceIdByFileId = new Map(
            insertedInvoices.map((inv) => [inv.file_id, inv.id])
          )

          const allRowsToInsert = successfulResults.flatMap((r) => {
            const invoiceId = invoiceIdByFileId.get(r.fileId)
            if (!invoiceId) return []

            // Ensure at least one line item
            const lineItems = ensureLineItems(
              r.extracted!.line_items || [],
              r.extracted!.totals,
              r.extracted!.vendor?.name || null
            )

            return lineItems.map((item) => ({
              invoice_id: invoiceId,
              description: item.description,
              reference_id: item.reference_id || null,
              transaction_date: item.date || null,
              total_agorot: toAgorot(item.amount),
              currency: item.currency || 'ILS',
              vat_rate: item.vat_rate || null,
              vat_amount_agorot: toAgorot(item.vat_amount),
            }))
          })

          if (allRowsToInsert.length > 0) {
            const { error: rowsError } = await supabase
              .from('invoice_rows')
              .insert(allRowsToInsert)

            if (rowsError) {
              console.error('Batch line items insert failed:', rowsError)
            } else {
              console.log(`Inserted ${allRowsToInsert.length} line items total`)
            }
          }
        }
      }

      // Batch update successful files
      const successfulIds = successfulResults.map((r) => r.fileId)
      if (successfulIds.length > 0) {
        const now = new Date().toISOString()

        // Update each successful file with its extracted data
        await Promise.all(
          successfulResults.map((r) =>
            supabase
              .from('files')
              .update({
                status: 'processed',
                extracted_data: JSON.parse(JSON.stringify(r.extracted)),
                processed_at: now,
              })
              .eq('id', r.fileId)
          )
        )
      }

      // Batch update failed files (UI will derive 'not_invoice' from error_message)
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
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
