/**
 * AI extraction service for invoice data extraction
 * Primary: Gemini 3.0 Flash Preview | Fallback: Kimi K2.5 via Together AI
 */

import type { InvoiceExtraction } from './types'

// Primary: Gemini 3.0 Flash Preview
const GEMINI_MODEL = 'gemini-3-flash-preview'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Fallback: Kimi K2.5 via Together AI
const TOGETHER_URL = 'https://api.together.xyz/v1/chat/completions'
const KIMI_MODEL = 'moonshotai/Kimi-K2.5'

/**
 * Get the Gemini API key from environment
 */
export function getGeminiApiKey(): string | null {
  return import.meta.env.VITE_GEMINI_API_KEY || null
}

/**
 * Get the Together API key from environment (for Kimi fallback)
 */
export function getTogetherApiKey(): string | null {
  return import.meta.env.VITE_TOGETHER_API_KEY || null
}

/**
 * Extract the first complete JSON object from text by matching balanced braces
 */
function extractJsonFromText(text: string): string | null {
  const trimmed = text.trim()

  // Find the first '{' and extract balanced JSON
  const startIndex = trimmed.indexOf('{')
  if (startIndex === -1) return null

  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = startIndex; i < trimmed.length; i++) {
    const char = trimmed[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\' && inString) {
      escapeNext = true
      continue
    }

    if (char === '"' && !escapeNext) {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') {
        depth++
      } else if (char === '}') {
        depth--
        if (depth === 0) {
          // Found complete JSON object
          return trimmed.slice(startIndex, i + 1)
        }
      }
    }
  }

  // Fallback: try the old greedy regex if balanced parsing failed
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }

  return null
}

// JSON Schema for structured output - uses Gemini's nullable format
const INVOICE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    vendor: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        vat_id: { type: 'string', nullable: true },
        country: { type: 'string', nullable: true },
      },
      required: ['name'],
    },
    document: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['billing_summary', 'invoice', 'receipt', 'credit_note'] },
        number: { type: 'string', nullable: true },
        date: { type: 'string', nullable: true },
        billing_period: {
          type: 'object',
          nullable: true,
          properties: {
            start: { type: 'string', nullable: true },
            end: { type: 'string', nullable: true },
          },
        },
      },
      required: ['type'],
    },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          description: { type: 'string' },
          reference_id: { type: 'string', nullable: true },
          amount: { type: 'number' },
          currency: { type: 'string' },
          vat_rate: { type: 'number', nullable: true },
          vat_amount: { type: 'number', nullable: true },
        },
        required: ['date', 'description', 'amount', 'currency'],
      },
    },
    totals: {
      type: 'object',
      properties: {
        subtotal: { type: 'number', nullable: true },
        vat_rate: { type: 'number', nullable: true },
        vat_amount: { type: 'number', nullable: true },
        total: { type: 'number' },
        currency: { type: 'string' },
      },
      required: ['total', 'currency'],
    },
    confidence: { type: 'number' },
  },
  required: ['vendor', 'document', 'line_items', 'totals', 'confidence'],
}

// The extraction prompt
const EXTRACTION_PROMPT = `Extract invoice/billing data from this file and return a JSON object with this exact structure:

{
  "vendor": {
    "name": "Company Name",
    "vat_id": "VAT registration number or null",
    "country": "Country or null"
  },
  "document": {
    "type": "billing_summary | invoice | receipt | credit_note",
    "number": "Invoice/document number or null",
    "date": "YYYY-MM-DD or null",
    "billing_period": {
      "start": "YYYY-MM-DD or null",
      "end": "YYYY-MM-DD or null"
    }
  },
  "line_items": [
    {
      "date": "YYYY-MM-DD",
      "description": "Description of the charge/item",
      "reference_id": "Transaction ID or invoice line reference",
      "amount": 123.45,
      "currency": "USD",
      "vat_rate": 0,
      "vat_amount": 0
    }
  ],
  "totals": {
    "subtotal": 1000.00,
    "vat_rate": 17,
    "vat_amount": 170.00,
    "total": 1170.00,
    "currency": "USD"
  },
  "confidence": 95
}

CRITICAL - LINE ITEM RULES (each line_item must match ONE bank transaction):

1. BILLING SUMMARY / TRANSACTION LIST (e.g., Meta Ads, Google Ads, subscription charges):
   - Each payment/charge = one line_item with its OWN date
   - These are SEPARATE bank transactions, keep them separate
   - Example: 133 Meta ad payments = 133 line_items

2. ITEMIZED INVOICE (products/services on a single invoice):
   - Return ONLY ONE line_item with the TOTAL amount
   - Use the invoice date as the line_item date
   - Description should be vendor name or "Invoice [number]"
   - The individual products are NOT separate bank transactions
   - Example: Invoice with 5 products totaling $500 = 1 line_item of $500

3. SIMPLE RECEIPT = one line_item with the total amount

HOW TO DECIDE:
- If each row has a DIFFERENT DATE = billing summary (multiple line_items)
- If all rows share ONE date or no dates = itemized invoice (ONE line_item with total)

OTHER RULES:
- NEVER include summary/total rows as line items
- All dates must be in YYYY-MM-DD format
- All amounts must be numbers (no currency symbols)
- Currency codes must be 3 uppercase letters (USD, ILS, EUR, etc.)
- Extract VAT info from metadata if available (e.g., "VAT Rate: 17%")
- Handle Hebrew and English correctly

Return ONLY the JSON object, no other text.`

/**
 * Get MIME type for file extension
 */
export function getMimeType(fileType: string): string | null {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'csv':
      return 'text/csv'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    default:
      return null
  }
}

/**
 * Check if file type is a spreadsheet
 */
export function isSpreadsheetType(fileType: string): boolean {
  const type = fileType.toLowerCase()
  return type === 'csv' || type === 'xlsx'
}

/**
 * Convert ArrayBuffer to base64
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        codeExecutionResult?: {
          output?: string
        }
      }>
    }
    finishReason?: string
  }>
  error?: {
    message?: string
  }
}

/**
 * Extract invoice data using Gemini API
 */
export async function extractWithGemini(
  apiKey: string,
  base64Data: string,
  mimeType: string
): Promise<InvoiceExtraction> {
  console.log('[GEMINI] Starting extraction...')
  console.log('[GEMINI] Model:', GEMINI_MODEL)
  console.log('[GEMINI] URL:', GEMINI_URL)
  console.log('[GEMINI] Data size:', Math.round(base64Data.length / 1024), 'KB base64')
  console.log('[GEMINI] MIME type:', mimeType)

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      thinkingConfig: {
        thinkingLevel: 'MINIMAL',
      },
    },
  }

  console.log('[GEMINI] Sending request...')
  const startTime = Date.now()

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(requestBody),
  })

  const elapsed = Date.now() - startTime
  console.log('[GEMINI] Response received in', elapsed, 'ms')
  console.log('[GEMINI] Status:', response.status, response.statusText)

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[GEMINI] Error response body:', errorText)
    let errorData: { error?: { message?: string }; raw?: string }
    try {
      errorData = JSON.parse(errorText)
    } catch {
      errorData = { raw: errorText }
    }
    console.error('[GEMINI] Parsed error:', JSON.stringify(errorData, null, 2))
    throw new Error(
      `Gemini API error: ${response.status} - ${errorData?.error?.message || errorData?.raw || 'Unknown error'}`
    )
  }

  const data: GeminiResponse = await response.json()
  console.log('[GEMINI] Response keys:', Object.keys(data))

  if (!data.candidates || data.candidates.length === 0) {
    console.error('[GEMINI] No candidates in response:', JSON.stringify(data, null, 2))
    throw new Error('Gemini returned no candidates')
  }

  const candidate = data.candidates[0]
  console.log('[GEMINI] Candidate finishReason:', candidate.finishReason)

  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    console.error('[GEMINI] Response blocked/filtered:', candidate.finishReason)
    console.error('[GEMINI] Full candidate:', JSON.stringify(candidate, null, 2))
    throw new Error(`Gemini response blocked: ${candidate.finishReason}`)
  }

  if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts)) {
    console.error('[GEMINI] Invalid candidate structure:', JSON.stringify(candidate, null, 2))
    throw new Error(`Gemini invalid response structure - finishReason: ${candidate.finishReason || 'unknown'}`)
  }

  console.log('[GEMINI] Parts count:', candidate.content.parts.length)

  // Extract JSON from response parts
  let jsonText: string | null = null

  for (let i = 0; i < candidate.content.parts.length; i++) {
    const part = candidate.content.parts[i]
    console.log(`[GEMINI] Part ${i} keys:`, Object.keys(part))

    if (part.text) {
      console.log(`[GEMINI] Part ${i} text length:`, part.text.length)
      console.log(`[GEMINI] Part ${i} text preview:`, part.text.substring(0, 200))
      const extracted = extractJsonFromText(part.text)
      if (extracted) {
        jsonText = extracted
        console.log('[GEMINI] JSON extracted from part', i)
        break
      }
    }

    if (part.codeExecutionResult?.output) {
      console.log(`[GEMINI] Part ${i} has codeExecutionResult`)
      const extracted = extractJsonFromText(part.codeExecutionResult.output)
      if (extracted) {
        jsonText = extracted
        console.log('[GEMINI] JSON extracted from codeExecutionResult')
        break
      }
    }
  }

  if (!jsonText) {
    console.error('[GEMINI] No JSON found in any part')
    console.error('[GEMINI] All parts:', JSON.stringify(candidate.content.parts, null, 2))
    throw new Error('Gemini response contained no valid JSON')
  }

  console.log('[GEMINI] Parsing JSON...')
  let parsed: InvoiceExtraction | InvoiceExtraction[]
  try {
    parsed = JSON.parse(jsonText)
  } catch (parseError) {
    console.error('[GEMINI] JSON parse failed:', parseError)
    console.error('[GEMINI] Raw JSON text:', jsonText.substring(0, 500))
    throw new Error('Failed to parse Gemini response as JSON')
  }

  if (Array.isArray(parsed)) {
    console.log('[GEMINI] Response is array, taking first element')
    parsed = parsed[0]
  }

  const extracted = parsed as InvoiceExtraction

  if (!extracted.vendor || !extracted.totals) {
    console.error('[GEMINI] Incomplete extraction:', JSON.stringify(extracted, null, 2))
    throw new Error('Gemini extraction incomplete - missing vendor or totals')
  }

  console.log('[GEMINI] Extraction successful:', {
    vendor: extracted.vendor?.name,
    documentType: extracted.document?.type,
    lineItemCount: extracted.line_items?.length,
    total: extracted.totals?.total,
    confidence: extracted.confidence,
  })

  return extracted
}

// ============================================================================
// KIMI K2.5 EXTRACTION (FALLBACK - IMAGES ONLY)
// ============================================================================

interface KimiResponse {
  choices?: Array<{
    message?: {
      role?: string
      content?: string
    }
    finish_reason?: string
  }>
  error?: {
    message?: string
  }
}

/**
 * Extract invoice data using Kimi K2.5 via Together AI
 * Note: Only supports images (PNG, JPG, WEBP), not PDFs or spreadsheets
 */
export async function extractWithKimi(
  apiKey: string,
  base64Data: string,
  mimeType: string
): Promise<InvoiceExtraction> {
  console.log('[KIMI] Starting fallback extraction...')
  console.log('[KIMI] Model:', KIMI_MODEL)
  console.log('[KIMI] URL:', TOGETHER_URL)
  console.log('[KIMI] Data size:', Math.round(base64Data.length / 1024), 'KB base64')
  console.log('[KIMI] MIME type:', mimeType)

  const requestBody = {
    model: KIMI_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`,
            },
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 131072,
  }

  console.log('[KIMI] Sending request...')
  const startTime = Date.now()

  const response = await fetch(TOGETHER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  })

  const elapsed = Date.now() - startTime
  console.log('[KIMI] Response received in', elapsed, 'ms')
  console.log('[KIMI] Status:', response.status, response.statusText)

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[KIMI] Error response body:', errorText)
    let errorData: { error?: { message?: string }; raw?: string }
    try {
      errorData = JSON.parse(errorText)
    } catch {
      errorData = { raw: errorText }
    }
    console.error('[KIMI] Parsed error:', JSON.stringify(errorData, null, 2))
    throw new Error(
      `Kimi API error: ${response.status} - ${errorData?.error?.message || errorData?.raw || 'Unknown error'}`
    )
  }

  const data: KimiResponse = await response.json()
  console.log('[KIMI] Response keys:', Object.keys(data))

  if (!data.choices || data.choices.length === 0) {
    console.error('[KIMI] No choices in response:', JSON.stringify(data, null, 2))
    throw new Error('Kimi returned no choices')
  }

  const choice = data.choices[0]
  console.log('[KIMI] Choice finish_reason:', choice.finish_reason)
  console.log('[KIMI] Choice message role:', choice.message?.role)

  const content = choice.message?.content
  if (!content) {
    console.error('[KIMI] No content in message:', JSON.stringify(choice, null, 2))
    throw new Error('Kimi response has no content')
  }

  console.log('[KIMI] Content length:', content.length)
  console.log('[KIMI] Content preview:', content.substring(0, 200))

  const jsonText = extractJsonFromText(content)
  if (!jsonText) {
    console.error('[KIMI] No JSON found in content')
    console.error('[KIMI] Full content:', content.substring(0, 1000))
    throw new Error('Kimi response contained no valid JSON')
  }

  console.log('[KIMI] Parsing JSON...')
  let parsed: InvoiceExtraction | InvoiceExtraction[]
  try {
    parsed = JSON.parse(jsonText)
  } catch (parseError) {
    console.error('[KIMI] JSON parse failed:', parseError)
    console.error('[KIMI] Raw JSON text:', jsonText.substring(0, 500))
    throw new Error('Failed to parse Kimi response as JSON')
  }

  if (Array.isArray(parsed)) {
    console.log('[KIMI] Response is array, taking first element')
    parsed = parsed[0]
  }

  const extracted = parsed as InvoiceExtraction

  if (!extracted.vendor || !extracted.totals) {
    console.error('[KIMI] Incomplete extraction:', JSON.stringify(extracted, null, 2))
    throw new Error('Kimi extraction incomplete - missing vendor or totals')
  }

  console.log('[KIMI] Extraction successful:', {
    vendor: extracted.vendor?.name,
    documentType: extracted.document?.type,
    lineItemCount: extracted.line_items?.length,
    total: extracted.totals?.total,
    confidence: extracted.confidence,
  })

  return extracted
}

/**
 * Check if MIME type is supported by Kimi (images only)
 */
export function isKimiSupportedType(mimeType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)
}
