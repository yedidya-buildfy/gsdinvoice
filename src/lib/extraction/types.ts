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
  fileType: string // pdf, png, jpg, jpeg, csv, xlsx
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
 * Vendor information extracted from document
 */
export interface ExtractedVendor {
  name: string | null
  vat_id?: string | null
  country?: string | null
}

/**
 * Document metadata
 */
export interface ExtractedDocument {
  type: 'billing_summary' | 'invoice' | 'receipt' | 'credit_note' | 'not_invoice'
  number?: string | null
  date?: string | null
  billing_period?: {
    start: string | null
    end: string | null
  } | null
}

/**
 * Line item extracted from an invoice - each represents a matchable transaction
 */
export interface ExtractedLineItem {
  date: string | null
  description: string | null
  reference_id?: string | null
  amount: number | null
  currency: string
  vat_rate?: number | null
  vat_amount?: number | null
}

/**
 * Totals extracted from document
 */
export interface ExtractedTotals {
  subtotal?: number | null
  vat_rate?: number | null
  vat_amount?: number | null
  total: number | null
  currency: string
}

/**
 * Complete extracted invoice data structure
 * Matches the new Gemini structured output schema
 */
export interface InvoiceExtraction {
  vendor: ExtractedVendor
  document: ExtractedDocument
  line_items: ExtractedLineItem[]
  totals: ExtractedTotals
  confidence: number
}

/**
 * Legacy format for backwards compatibility
 * TODO: Remove after migration
 */
export interface LegacyInvoiceExtraction {
  vendor_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  subtotal: number | null
  vat_amount: number | null
  total_amount: number | null
  currency: string
  confidence: number
  line_items: Array<{
    description: string | null
    quantity: number | null
    unit_price: number | null
    total: number | null
  }>
}

/**
 * Document extraction status
 * Used for tracking extraction progress in UI
 */
export type ExtractionStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'not_invoice'

/**
 * Line item duplicate info returned when duplicates are detected
 */
export interface LineItemDuplicateInfo {
  invoiceId: string
  vendorName: string | null
  totalItems: number
  duplicateCount: number
  matches: Array<{
    newItem: {
      reference_id: string | null
      transaction_date: string | null
      amount_agorot: number | null
      description: string | null
    }
    existingItems: Array<{
      id: string
      invoice_id: string
      reference_id: string | null
      transaction_date: string | null
      total_agorot: number | null
      description: string | null
    }>
    matchType: 'exact_reference' | 'date_amount'
  }>
  pendingLineItems: Array<{
    invoice_id: string
    description: string | null
    reference_id: string | null
    transaction_date: string | null
    total_agorot: number | null
    currency: string
    vat_rate: number | null
    vat_amount_agorot: number | null
  }>
}

/**
 * Extended extraction result that may include line item duplicate info
 */
export interface ExtendedExtractionResult extends ExtractionResult {
  lineItemDuplicates?: LineItemDuplicateInfo
}
