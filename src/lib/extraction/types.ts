/**
 * Types for AI-powered document extraction
 * Used by client hooks and Edge Function
 */

/**
 * Request parameters for document extraction
 */
export interface ExtractionRequest {
  fileId: string
  storagePath: string
  fileType: string // pdf, png, jpg, jpeg
}

/**
 * Response from the extract-invoice Edge Function
 */
export interface ExtractionResult {
  success: boolean
  invoice_id?: string
  confidence?: number
  error?: string
}

/**
 * Line item extracted from an invoice
 */
export interface LineItem {
  description: string | null
  quantity: number | null
  unit_price: number | null
  total: number | null
}

/**
 * Complete extracted invoice data structure
 * Matches the Gemini structured output schema
 */
export interface InvoiceExtraction {
  vendor_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  subtotal: number | null
  vat_amount: number | null
  total_amount: number | null
  currency: string
  confidence: number
  line_items: LineItem[]
}

/**
 * Document extraction status
 * Used for tracking extraction progress in UI
 */
export type ExtractionStatus = 'pending' | 'processing' | 'extracted' | 'error'
