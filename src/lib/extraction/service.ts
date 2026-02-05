/**
 * Invoice extraction service
 * Downloads files from Supabase Storage and extracts data using AI
 * Primary: Gemini 3.0 Flash | Fallback: GPT-5 mini via OpenAI (images + PDFs)
 */

import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { BUCKET_NAME } from '@/lib/storage'
import type { InvoiceExtraction } from './types'
import {
  extractWithGemini,
  extractWithOpenAI,
  getGeminiApiKey,
  getOpenAIApiKey,
  getMimeType,
  isSpreadsheetType,
  isOpenAISupportedType,
  arrayBufferToBase64,
} from './gemini'

// Convert amounts to agorot (integer cents) for database storage
export function toAgorot(amount: number | null | undefined): number | null {
  if (amount == null || isNaN(amount)) return null
  return Math.round(amount * 100)
}

// Normalize currency to uppercase 3-letter code (for DB constraint)
export function normalizeCurrency(currency: string | null | undefined): string {
  if (!currency) return 'ILS'
  const normalized = currency.toUpperCase().trim().slice(0, 3)
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'ILS'
}

/**
 * Convert XLSX blob to CSV strings (one per sheet)
 */
async function xlsxToCsvSheets(blob: Blob): Promise<Array<{ name: string; csv: string }>> {
  const buffer = await blob.arrayBuffer()
  const workbook = XLSX.read(buffer, {
    type: 'array',
    codepage: 65001,
    cellDates: true,
    dateNF: 'yyyy-mm-dd',
  })

  const sheets: Array<{ name: string; csv: string }> = []
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(worksheet, {
      blankrows: false,
      strip: true,
    })
    if (csv.trim()) {
      sheets.push({ name: sheetName, csv })
    }
  }

  return sheets
}

export interface ExtractionServiceResult {
  success: boolean
  extracted?: InvoiceExtraction
  provider?: 'gemini' | 'openai'
  error?: string
}

/**
 * Download and extract invoice data from a file
 * Uses Gemini as primary, falls back to GPT-5 mini for images/PDFs if Gemini fails
 */
export async function extractInvoiceFromFile(
  storagePath: string,
  fileType: string
): Promise<ExtractionServiceResult> {
  console.log('[EXTRACT] Starting extraction for:', storagePath)
  console.log('[EXTRACT] File type:', fileType)

  // Check API keys
  const geminiApiKey = getGeminiApiKey()
  const openaiApiKey = getOpenAIApiKey()

  console.log('[EXTRACT] GEMINI_API_KEY configured:', !!geminiApiKey)
  console.log('[EXTRACT] OPENAI_API_KEY configured:', !!openaiApiKey)

  if (!geminiApiKey && !openaiApiKey) {
    return {
      success: false,
      error: 'No API keys configured - need VITE_GEMINI_API_KEY or VITE_OPENAI_API_KEY',
    }
  }

  // Validate file type
  const mimeType = getMimeType(fileType)
  if (!mimeType) {
    return {
      success: false,
      error: `Unsupported file type: ${fileType}. Supported: PDF, PNG, JPG, JPEG, WEBP, CSV, XLSX`,
    }
  }

  try {
    // Download file from storage
    console.log('[EXTRACT] Downloading from storage...')
    const downloadStart = Date.now()
    const { data: blob, error: downloadError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(storagePath)

    if (downloadError) {
      console.error('[EXTRACT] Download error:', downloadError)
      return {
        success: false,
        error: `Download failed: ${downloadError.message}`,
      }
    }

    if (!blob) {
      return {
        success: false,
        error: 'No data returned from storage',
      }
    }

    console.log('[EXTRACT] Download complete in', Date.now() - downloadStart, 'ms')
    console.log('[EXTRACT] File size:', blob.size, 'bytes')

    // Prepare base64 data
    let base64Data: string
    let actualMimeType = mimeType

    if (isSpreadsheetType(fileType)) {
      console.log('[EXTRACT] Processing spreadsheet...')
      let csvContent: string

      if (fileType.toLowerCase() === 'csv') {
        csvContent = await blob.text()
        // Remove BOM if present
        if (csvContent.charCodeAt(0) === 0xfeff) {
          csvContent = csvContent.slice(1)
        }
        console.log('[EXTRACT] CSV content length:', csvContent.length)
      } else {
        const sheets = await xlsxToCsvSheets(blob)
        console.log(
          '[EXTRACT] XLSX sheets:',
          sheets.map((s) => ({ name: s.name, length: s.csv.length }))
        )
        csvContent = sheets
          .map((sheet) => `=== SHEET: ${sheet.name} ===\n${sheet.csv}`)
          .join('\n\n')
      }

      // Convert to base64 as plain text for Gemini
      const encoder = new TextEncoder()
      const bytes = encoder.encode(csvContent)
      let binary = ''
      bytes.forEach((byte) => (binary += String.fromCharCode(byte)))
      base64Data = btoa(binary)
      actualMimeType = 'text/plain' // Gemini handles text better than CSV MIME type
    } else {
      // For images and PDFs
      const MAX_SIZE = 20 * 1024 * 1024
      if (blob.size > MAX_SIZE) {
        return {
          success: false,
          error: `File too large: ${Math.round(blob.size / 1024 / 1024)}MB. Maximum is 20MB.`,
        }
      }

      const arrayBuffer = await blob.arrayBuffer()
      base64Data = arrayBufferToBase64(arrayBuffer)
    }

    console.log('[EXTRACT] Base64 data prepared, length:', base64Data.length)

    // Try extraction with fallback
    let extracted: InvoiceExtraction
    let usedProvider: 'gemini' | 'openai'

    // Try Gemini first if available
    if (geminiApiKey) {
      try {
        console.log('[EXTRACT] Attempting Gemini extraction...')
        extracted = await extractWithGemini(geminiApiKey, base64Data, actualMimeType)
        usedProvider = 'gemini'
        console.log('[EXTRACT] Gemini extraction succeeded')
      } catch (geminiError) {
        console.error('[EXTRACT] Gemini extraction failed:', geminiError)

        // Try OpenAI GPT-5 mini fallback - supports images AND PDFs
        if (openaiApiKey && isOpenAISupportedType(mimeType)) {
          console.log('[EXTRACT] Falling back to OpenAI GPT-5 mini...')
          try {
            extracted = await extractWithOpenAI(openaiApiKey, base64Data, mimeType)
            usedProvider = 'openai'
            console.log('[EXTRACT] OpenAI fallback succeeded')
          } catch (openaiError) {
            console.error('[EXTRACT] OpenAI fallback also failed:', openaiError)
            return {
              success: false,
              error: `Both providers failed. Gemini: ${geminiError instanceof Error ? geminiError.message : String(geminiError)}. OpenAI: ${openaiError instanceof Error ? openaiError.message : String(openaiError)}`,
            }
          }
        } else if (openaiApiKey && !isOpenAISupportedType(mimeType)) {
          console.error('[EXTRACT] OpenAI fallback not available for this file type (only supports images and PDFs)')
          return {
            success: false,
            error: `Gemini failed and OpenAI fallback not available for ${mimeType} files. Gemini error: ${geminiError instanceof Error ? geminiError.message : String(geminiError)}`,
          }
        } else {
          console.error('[EXTRACT] No fallback available (VITE_OPENAI_API_KEY not set)')
          return {
            success: false,
            error: geminiError instanceof Error ? geminiError.message : String(geminiError),
          }
        }
      }
    } else {
      // Only OpenAI available - check if file type is supported
      if (!isOpenAISupportedType(mimeType)) {
        return {
          success: false,
          error: `OpenAI GPT-5 mini supports images and PDFs. For ${fileType} files, configure VITE_GEMINI_API_KEY.`,
        }
      }
      console.log('[EXTRACT] Using OpenAI GPT-5 mini (Gemini not configured)...')
      extracted = await extractWithOpenAI(openaiApiKey!, base64Data, mimeType)
      usedProvider = 'openai'
    }

    console.log('[EXTRACT] Extraction complete:', {
      provider: usedProvider,
      vendor: extracted.vendor?.name,
      documentType: extracted.document?.type,
      lineItemCount: extracted.line_items?.length,
      total: extracted.totals?.total,
      confidence: extracted.confidence,
    })

    return {
      success: true,
      extracted,
      provider: usedProvider,
    }
  } catch (error) {
    console.error('[EXTRACT] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Create invoice record in database
 */
export async function createInvoiceRecord(
  userId: string,
  fileId: string,
  extracted: InvoiceExtraction
): Promise<{ invoiceId: string | null; error: string | null }> {
  console.log('[DB] Creating invoice record...')

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      user_id: userId,
      file_id: fileId,
      vendor_name: extracted.vendor?.name || null,
      invoice_number: extracted.document?.number || null,
      invoice_date: extracted.document?.date || null,
      subtotal_agorot: toAgorot(extracted.totals?.subtotal),
      vat_amount_agorot: toAgorot(extracted.totals?.vat_amount),
      total_amount_agorot: toAgorot(extracted.totals?.total),
      currency: normalizeCurrency(extracted.totals?.currency),
      confidence_score: extracted.confidence,
      status: 'pending',
    })
    .select('id')
    .single()

  if (invoiceError) {
    console.error('[DB] Invoice insert error:', invoiceError)
    return {
      invoiceId: null,
      error: `Failed to create invoice: ${invoiceError.message}`,
    }
  }

  console.log('[DB] Invoice created:', invoice.id)
  return {
    invoiceId: invoice.id,
    error: null,
  }
}
