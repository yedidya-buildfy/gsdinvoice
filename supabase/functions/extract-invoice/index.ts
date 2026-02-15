// Supabase Edge Function for AI-powered invoice extraction
// Primary: GPT-5 mini via OpenAI (double-read) | Fallback: Gemini 3.0 Flash (double-read)
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Primary: GPT-5 mini via OpenAI
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-5-mini';

// Fallback: Gemini 3.0 Flash Preview
const GEMINI_MODEL = 'gemini-3-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================
const RETRY_CONFIG = {
  maxAttempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 32000,
  jitterFactor: 0.2, // ±20% randomness
};

// Stale lock timeout - if processing for longer than this, consider it stuck
const STALE_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// RETRY UTILITIES
// ============================================================================
class RetryableError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

function parseRetryAfter(retryAfterHeader: string | null): number | undefined {
  if (!retryAfterHeader) return undefined;

  // Check if it's a number (seconds)
  const seconds = parseInt(retryAfterHeader, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Check if it's an HTTP-date
  try {
    const date = new Date(retryAfterHeader);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }
  } catch {
    // Ignore parse errors
  }

  return undefined;
}

function calculateDelay(
  attemptNumber: number,
  retryAfterMs?: number,
): number {
  // If server specified Retry-After, respect it (but cap at max)
  if (retryAfterMs) {
    return Math.min(retryAfterMs, RETRY_CONFIG.maxDelayMs);
  }

  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s...
  const exponentialDelay = Math.min(
    RETRY_CONFIG.initialDelayMs * Math.pow(2, attemptNumber - 1),
    RETRY_CONFIG.maxDelayMs,
  );

  // Add jitter to prevent thundering herd
  const jitter = exponentialDelay * RETRY_CONFIG.jitterFactor * (Math.random() - 0.5);
  return Math.max(100, Math.round(exponentialDelay + jitter));
}

function isRetryableStatus(status: number): boolean {
  // 429 = Rate Limited, 503 = Service Unavailable, 500 = Server Error, 502 = Bad Gateway
  return status === 429 || status === 503 || status === 500 || status === 502;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  operationName: string,
): Promise<T> {
  for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      console.log(`[RETRY] ${operationName} - Attempt ${attempt}/${RETRY_CONFIG.maxAttempts}`);
      return await fn();
    } catch (error) {
      const isRetryable = error instanceof RetryableError && isRetryableStatus(error.status);
      const isLastAttempt = attempt === RETRY_CONFIG.maxAttempts;

      if (!isRetryable || isLastAttempt) {
        console.error(`[RETRY] ${operationName} - Final failure on attempt ${attempt}:`,
          error instanceof Error ? error.message : String(error));
        throw error;
      }

      const retryAfterMs = error instanceof RetryableError ? error.retryAfterMs : undefined;
      const delayMs = calculateDelay(attempt, retryAfterMs);

      console.warn(`[RETRY] ${operationName} - Attempt ${attempt} failed with status ${error.status}, waiting ${delayMs}ms before retry...`);
      await sleep(delayMs);
    }
  }

  throw new Error(`${operationName} - Retry loop exited unexpectedly`);
}

// Convert amounts to agorot (integer cents) for database storage
function toAgorot(amount: number | null | undefined): number | null {
  if (amount == null || isNaN(amount)) return null;
  return Math.round(amount * 100);
}

// Normalize currency to uppercase 3-letter code (for DB constraint)
function normalizeCurrency(currency: string | null | undefined): string {
  if (!currency) return "ILS";
  const normalized = currency.toUpperCase().trim().slice(0, 3);
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "ILS";
}

// Extract the first complete JSON object from text by matching balanced braces
function extractJsonFromText(text: string): string | null {
  const trimmed = text.trim();

  // Find the first '{' and extract balanced JSON
  const startIndex = trimmed.indexOf('{');
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          // Found complete JSON object
          return trimmed.slice(startIndex, i + 1);
        }
      }
    }
  }

  // Fallback: try the old greedy regex if balanced parsing failed
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return null;
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
      },
      required: ['name'],
    },
    document: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['billing_summary', 'invoice', 'receipt', 'credit_note', 'not_invoice'] },
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
    // Note: confidence is calculated from double-read comparison, not returned by AI
  },
  required: ['vendor', 'document', 'line_items', 'totals'],
};

// The extraction prompt
const EXTRACTION_PROMPT = `Extract invoice/billing data from this file and return a JSON object with this exact structure:

{
  "vendor": {
    "name": "Company Name",
    "vat_id": "VAT registration number or null"
  },
  "document": {
    "type": "billing_summary | invoice | receipt | credit_note | not_invoice",
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
  }
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

Return ONLY the JSON object, no other text.`;

// Supported MIME types
function getMimeType(fileType: string): string | null {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'csv':
      return 'text/csv';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    default:
      return null;
  }
}

// Check if file type is a spreadsheet
function isSpreadsheetType(fileType: string): boolean {
  const type = fileType.toLowerCase();
  return type === 'csv' || type === 'xlsx';
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert XLSX to CSV strings (one per sheet)
async function xlsxToCsvSheets(blob: Blob): Promise<Array<{ name: string; csv: string }>> {
  const buffer = await blob.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    codepage: 65001,
    cellDates: true,
    dateNF: 'yyyy-mm-dd',
  });

  const sheets: Array<{ name: string; csv: string }> = [];
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(worksheet, {
      blankrows: false,
      strip: true,
    });
    if (csv.trim()) {
      sheets.push({ name: sheetName, csv });
    }
  }

  return sheets;
}

// InvoiceExtraction type
interface ExtractedLineItem {
  date: string;
  description: string;
  reference_id?: string | null;
  amount: number;
  currency: string;
  vat_rate?: number;
  vat_amount?: number;
}

interface InvoiceExtraction {
  vendor: {
    name: string;
    vat_id?: string | null;
  };
  document: {
    type: 'billing_summary' | 'invoice' | 'receipt' | 'credit_note' | 'not_invoice';
    number?: string | null;
    date?: string | null;
    billing_period?: {
      start?: string | null;
      end?: string | null;
    };
  };
  line_items: ExtractedLineItem[];
  totals: {
    subtotal?: number | null;
    vat_rate?: number | null;
    vat_amount?: number | null;
    total: number;
    currency: string;
  };
  confidence?: number; // Calculated from double-read comparison, not from AI
}

// ============================================================================
// DOUBLE-READ COMPARISON & MERGE
// ============================================================================
interface ExtractionComparison {
  extraction1: InvoiceExtraction;
  extraction2: InvoiceExtraction;
  matchScore: number; // 0-100 real confidence
  differences: string[];
  mergedResult: InvoiceExtraction;
}

/**
 * Normalize vendor name for comparison (lowercase, trim, remove common suffixes)
 */
function normalizeVendorName(name: string | undefined | null): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+(ltd|inc|llc|בע"מ|בעמ)\.?$/i, '')
    .replace(/\s+/g, ' ');
}

/**
 * Compare two extractions and calculate real confidence based on matching
 */
function compareExtractions(
  e1: InvoiceExtraction,
  e2: InvoiceExtraction
): ExtractionComparison {
  const differences: string[] = [];
  let matchPoints = 0;
  let totalPoints = 0;

  // 1. Compare vendor name (10 points)
  totalPoints += 10;
  const vendor1 = normalizeVendorName(e1.vendor?.name);
  const vendor2 = normalizeVendorName(e2.vendor?.name);
  if (vendor1 === vendor2) {
    matchPoints += 10;
  } else {
    differences.push(`Vendor: "${e1.vendor?.name}" vs "${e2.vendor?.name}"`);
  }

  // 2. Compare document type (5 points)
  totalPoints += 5;
  if (e1.document?.type === e2.document?.type) {
    matchPoints += 5;
  } else {
    differences.push(`Doc type: "${e1.document?.type}" vs "${e2.document?.type}"`);
  }

  // 3. Compare total amount (30 points) - critical
  totalPoints += 30;
  const total1 = e1.totals?.total || 0;
  const total2 = e2.totals?.total || 0;
  const totalDiff = Math.abs(total1 - total2);
  if (totalDiff < 0.01) {
    matchPoints += 30;
  } else if (totalDiff < 1) {
    matchPoints += 20; // Minor rounding difference
    differences.push(`Total: ${total1} vs ${total2} (minor diff)`);
  } else {
    differences.push(`Total: ${total1} vs ${total2}`);
  }

  // 4. Compare currency (5 points)
  totalPoints += 5;
  const curr1 = (e1.totals?.currency || 'ILS').toUpperCase();
  const curr2 = (e2.totals?.currency || 'ILS').toUpperCase();
  if (curr1 === curr2) {
    matchPoints += 5;
  } else {
    differences.push(`Currency: "${curr1}" vs "${curr2}"`);
  }

  // 5. Compare line item count (20 points)
  totalPoints += 20;
  const count1 = e1.line_items?.length || 0;
  const count2 = e2.line_items?.length || 0;
  if (count1 === count2) {
    matchPoints += 20;
  } else if (Math.abs(count1 - count2) === 1) {
    matchPoints += 10; // Off by one - partial credit
    differences.push(`Line items count: ${count1} vs ${count2} (off by 1)`);
  } else {
    differences.push(`Line items count: ${count1} vs ${count2}`);
  }

  // 6. Compare line item amounts (30 points) - if same count
  if (count1 === count2 && count1 > 0) {
    totalPoints += 30;
    // Sort amounts for comparison (order might differ)
    const amounts1 = e1.line_items.map(i => Math.round(i.amount * 100)).sort((a, b) => a - b);
    const amounts2 = e2.line_items.map(i => Math.round(i.amount * 100)).sort((a, b) => a - b);

    let amountMatches = 0;
    for (let i = 0; i < amounts1.length; i++) {
      if (amounts1[i] === amounts2[i]) {
        amountMatches++;
      }
    }
    const amountMatchRate = amountMatches / amounts1.length;
    matchPoints += Math.round(30 * amountMatchRate);

    if (amountMatchRate < 1) {
      differences.push(`Line item amounts: ${Math.round(amountMatchRate * 100)}% match`);
    }
  } else if (count1 !== count2) {
    // Different counts - compare total of line items
    totalPoints += 30;
    const sum1 = e1.line_items?.reduce((acc, i) => acc + (i.amount || 0), 0) || 0;
    const sum2 = e2.line_items?.reduce((acc, i) => acc + (i.amount || 0), 0) || 0;
    if (Math.abs(sum1 - sum2) < 0.01) {
      matchPoints += 15; // Sums match even if counts differ
    }
  }

  const matchScore = Math.round((matchPoints / totalPoints) * 100);

  // Merge strategy: prefer extraction with more line items (more detailed)
  // If same count, prefer the one with higher self-reported confidence
  let mergedResult: InvoiceExtraction;
  if (count1 > count2) {
    mergedResult = { ...e1 };
  } else if (count2 > count1) {
    mergedResult = { ...e2 };
  } else {
    mergedResult = (e1.confidence || 0) >= (e2.confidence || 0) ? { ...e1 } : { ...e2 };
  }

  // Override confidence with our calculated match score
  mergedResult.confidence = matchScore;

  console.log('[COMPARE] Match score:', matchScore);
  console.log('[COMPARE] Differences:', differences);

  return {
    extraction1: e1,
    extraction2: e2,
    matchScore,
    differences,
    mergedResult,
  };
}

/**
 * Ensure extraction has at least one line item (fallback to totals)
 */
function ensureLineItems(extraction: InvoiceExtraction): InvoiceExtraction {
  if (extraction.line_items && extraction.line_items.length > 0) {
    return extraction;
  }

  console.log('[ENSURE] No line items found, creating fallback from totals');

  return {
    ...extraction,
    line_items: [{
      date: extraction.document?.date || new Date().toISOString().split('T')[0],
      description: extraction.vendor?.name || 'Invoice Total',
      amount: extraction.totals?.total || 0,
      currency: extraction.totals?.currency || 'ILS',
      vat_rate: extraction.totals?.vat_rate || undefined,
      vat_amount: extraction.totals?.vat_amount || undefined,
    }],
  };
}

// ============================================================================
// GEMINI EXTRACTION (FALLBACK - with retry)
// ============================================================================
async function extractWithGemini(
  apiKey: string,
  base64Data: string,
  mimeType: string,
): Promise<InvoiceExtraction> {
  console.log('[GEMINI] Starting extraction with retry logic...');
  console.log('[GEMINI] Model:', GEMINI_MODEL);
  console.log('[GEMINI] Data size:', Math.round(base64Data.length / 1024), 'KB base64');
  console.log('[GEMINI] MIME type:', mimeType);

  return retryWithBackoff(async () => {
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
    };

    console.log('[GEMINI] Sending request...');
    const startTime = Date.now();

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    const elapsed = Date.now() - startTime;
    console.log('[GEMINI] Response received in', elapsed, 'ms');
    console.log('[GEMINI] Status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GEMINI] Error response body:', errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { raw: errorText };
      }
      console.error('[GEMINI] Parsed error:', JSON.stringify(errorData, null, 2));

      // Check for rate limit and extract Retry-After header
      const retryAfterMs = parseRetryAfter(
        response.headers.get('Retry-After') || response.headers.get('retry-after')
      );

      // Throw RetryableError for transient failures
      if (isRetryableStatus(response.status)) {
        throw new RetryableError(
          `Gemini API error: ${response.status} - ${errorData?.error?.message || errorData?.raw || 'Unknown error'}`,
          response.status,
          retryAfterMs,
        );
      }

      // Non-retryable error (400, 401, 403, etc.)
      throw new Error(
        `Gemini API error: ${response.status} - ${errorData?.error?.message || errorData?.raw || 'Unknown error'}`
      );
    }

    const data = await response.json();
    console.log('[GEMINI] Response keys:', Object.keys(data));

    if (!data.candidates || data.candidates.length === 0) {
      console.error('[GEMINI] No candidates in response:', JSON.stringify(data, null, 2));
      throw new Error('Gemini returned no candidates');
    }

    const candidate = data.candidates[0];
    console.log('[GEMINI] Candidate finishReason:', candidate.finishReason);

    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.error('[GEMINI] Response blocked/filtered:', candidate.finishReason);
      console.error('[GEMINI] Full candidate:', JSON.stringify(candidate, null, 2));
      throw new Error(`Gemini response blocked: ${candidate.finishReason}`);
    }

    if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts)) {
      console.error('[GEMINI] Invalid candidate structure:', JSON.stringify(candidate, null, 2));
      throw new Error(`Gemini invalid response structure - finishReason: ${candidate.finishReason || 'unknown'}`);
    }

    console.log('[GEMINI] Parts count:', candidate.content.parts.length);

    // Extract JSON from response parts
    let jsonText: string | null = null;

    for (let i = 0; i < candidate.content.parts.length; i++) {
      const part = candidate.content.parts[i];
      console.log(`[GEMINI] Part ${i} keys:`, Object.keys(part));

      if (part.text) {
        console.log(`[GEMINI] Part ${i} text length:`, part.text.length);
        console.log(`[GEMINI] Part ${i} text preview:`, part.text.substring(0, 200));
        const extracted = extractJsonFromText(part.text);
        if (extracted) {
          jsonText = extracted;
          console.log('[GEMINI] JSON extracted from part', i);
          break;
        }
      }

      if (part.codeExecutionResult?.output) {
        console.log(`[GEMINI] Part ${i} has codeExecutionResult`);
        const extracted = extractJsonFromText(part.codeExecutionResult.output);
        if (extracted) {
          jsonText = extracted;
          console.log('[GEMINI] JSON extracted from codeExecutionResult');
          break;
        }
      }
    }

    if (!jsonText) {
      console.error('[GEMINI] No JSON found in any part');
      console.error('[GEMINI] All parts:', JSON.stringify(candidate.content.parts, null, 2));
      throw new Error('Gemini response contained no valid JSON');
    }

    console.log('[GEMINI] Parsing JSON...');
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[GEMINI] JSON parse failed:', parseError);
      console.error('[GEMINI] Raw JSON text:', jsonText.substring(0, 500));
      throw new Error('Failed to parse Gemini response as JSON');
    }

    if (Array.isArray(parsed)) {
      console.log('[GEMINI] Response is array, taking first element');
      parsed = parsed[0];
    }

    const extracted = parsed as InvoiceExtraction;

    if (!extracted.vendor || !extracted.totals) {
      console.error('[GEMINI] Incomplete extraction:', JSON.stringify(extracted, null, 2));
      throw new Error('Gemini extraction incomplete - missing vendor or totals');
    }

    console.log('[GEMINI] Extraction successful:', {
      vendor: extracted.vendor?.name,
      documentType: extracted.document?.type,
      lineItemCount: extracted.line_items?.length,
      total: extracted.totals?.total,
      currency: extracted.totals?.currency,
    });

    return extracted;
  }, 'Gemini extraction');
}

// ============================================================================
// DOUBLE-READ EXTRACTION WITH GEMINI (FALLBACK - calls Gemini twice in parallel for verification)
// ============================================================================
async function extractWithDoubleRead(
  apiKey: string,
  base64Data: string,
  mimeType: string,
): Promise<InvoiceExtraction> {
  console.log('[DOUBLE-READ] Starting parallel extraction...');
  const startTime = Date.now();

  // Run two extractions in parallel
  const [result1, result2] = await Promise.allSettled([
    extractWithGemini(apiKey, base64Data, mimeType),
    extractWithGemini(apiKey, base64Data, mimeType),
  ]);

  const elapsed = Date.now() - startTime;
  console.log('[DOUBLE-READ] Both extractions completed in', elapsed, 'ms');

  // Check results
  const extraction1 = result1.status === 'fulfilled' ? result1.value : null;
  const extraction2 = result2.status === 'fulfilled' ? result2.value : null;

  if (result1.status === 'rejected') {
    console.error('[DOUBLE-READ] Extraction 1 failed:', result1.reason);
  }
  if (result2.status === 'rejected') {
    console.error('[DOUBLE-READ] Extraction 2 failed:', result2.reason);
  }

  // If both failed, throw error
  if (!extraction1 && !extraction2) {
    throw new Error('Both parallel extractions failed');
  }

  // If only one succeeded, use it with lower confidence
  if (!extraction1 || !extraction2) {
    const singleResult = extraction1 || extraction2!;
    console.log('[DOUBLE-READ] Only one extraction succeeded, using with reduced confidence');

    // Ensure line items exist
    const withLineItems = ensureLineItems(singleResult);

    // Reduce confidence since we couldn't verify
    withLineItems.confidence = Math.min(withLineItems.confidence || 50, 60);

    return withLineItems;
  }

  // Both succeeded - compare and merge
  console.log('[DOUBLE-READ] Both extractions succeeded, comparing...');
  console.log('[DOUBLE-READ] Extraction 1:', {
    vendor: extraction1.vendor?.name,
    docType: extraction1.document?.type,
    lineItems: extraction1.line_items?.length,
    total: extraction1.totals?.total,
  });
  console.log('[DOUBLE-READ] Extraction 2:', {
    vendor: extraction2.vendor?.name,
    docType: extraction2.document?.type,
    lineItems: extraction2.line_items?.length,
    total: extraction2.totals?.total,
  });

  // Ensure both have line items before comparing
  const e1 = ensureLineItems(extraction1);
  const e2 = ensureLineItems(extraction2);

  // Compare and get merged result with real confidence
  const comparison = compareExtractions(e1, e2);

  console.log('[DOUBLE-READ] Final result:', {
    vendor: comparison.mergedResult.vendor?.name,
    lineItems: comparison.mergedResult.line_items?.length,
    total: comparison.mergedResult.totals?.total,
    realConfidence: comparison.matchScore,
    differences: comparison.differences,
  });

  return comparison.mergedResult;
}

// ============================================================================
// GPT-5 MINI EXTRACTION (PRIMARY - supports images and PDFs, with retry)
// Uses minimal reasoning effort and low verbosity for fast extraction
// ============================================================================
async function extractWithOpenAI(
  apiKey: string,
  base64Data: string,
  mimeType: string,
): Promise<InvoiceExtraction> {
  console.log('[OPENAI] Starting fallback extraction with retry logic...');
  console.log('[OPENAI] Model:', OPENAI_MODEL);
  console.log('[OPENAI] Data size:', Math.round(base64Data.length / 1024), 'KB base64');
  console.log('[OPENAI] MIME type:', mimeType);

  return retryWithBackoff(async () => {
    const requestBody = {
      model: OPENAI_MODEL,
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
      reasoning: { effort: 'minimal' },
      verbosity: 'low',
      max_tokens: 16384,
    };

    console.log('[OPENAI] Sending request...');
    const startTime = Date.now();

    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const elapsed = Date.now() - startTime;
    console.log('[OPENAI] Response received in', elapsed, 'ms');
    console.log('[OPENAI] Status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OPENAI] Error response body:', errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { raw: errorText };
      }
      console.error('[OPENAI] Parsed error:', JSON.stringify(errorData, null, 2));

      // Check for rate limit and extract Retry-After header
      const retryAfterMs = parseRetryAfter(
        response.headers.get('Retry-After') || response.headers.get('retry-after')
      );

      // Throw RetryableError for transient failures
      if (isRetryableStatus(response.status)) {
        throw new RetryableError(
          `OpenAI API error: ${response.status} - ${errorData?.error?.message || errorData?.raw || 'Unknown error'}`,
          response.status,
          retryAfterMs,
        );
      }

      // Non-retryable error (400, 401, 403, etc.)
      throw new Error(
        `OpenAI API error: ${response.status} - ${errorData?.error?.message || errorData?.raw || 'Unknown error'}`
      );
    }

    const data = await response.json();
    console.log('[OPENAI] Response keys:', Object.keys(data));

    if (!data.choices || data.choices.length === 0) {
      console.error('[OPENAI] No choices in response:', JSON.stringify(data, null, 2));
      throw new Error('OpenAI returned no choices');
    }

    const choice = data.choices[0];
    console.log('[OPENAI] Choice finish_reason:', choice.finish_reason);
    console.log('[OPENAI] Choice message role:', choice.message?.role);

    const content = choice.message?.content;
    if (!content) {
      console.error('[OPENAI] No content in message:', JSON.stringify(choice, null, 2));
      throw new Error('OpenAI response has no content');
    }

    console.log('[OPENAI] Content length:', content.length);
    console.log('[OPENAI] Content preview:', content.substring(0, 200));

    const jsonText = extractJsonFromText(content);
    if (!jsonText) {
      console.error('[OPENAI] No JSON found in content');
      console.error('[OPENAI] Full content:', content.substring(0, 1000));
      throw new Error('OpenAI response contained no valid JSON');
    }

    console.log('[OPENAI] Parsing JSON...');
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[OPENAI] JSON parse failed:', parseError);
      console.error('[OPENAI] Raw JSON text:', jsonText.substring(0, 500));
      throw new Error('Failed to parse OpenAI response as JSON');
    }

    if (Array.isArray(parsed)) {
      console.log('[OPENAI] Response is array, taking first element');
      parsed = parsed[0];
    }

    const extracted = parsed as InvoiceExtraction;

    if (!extracted.vendor || !extracted.totals) {
      console.error('[OPENAI] Incomplete extraction:', JSON.stringify(extracted, null, 2));
      throw new Error('OpenAI extraction incomplete - missing vendor or totals');
    }

    console.log('[OPENAI] Extraction successful:', {
      vendor: extracted.vendor?.name,
      documentType: extracted.document?.type,
      lineItemCount: extracted.line_items?.length,
      total: extracted.totals?.total,
      currency: extracted.totals?.currency,
    });

    return extracted;
  }, 'OpenAI extraction');
}

// ============================================================================
// DOUBLE-READ EXTRACTION WITH OPENAI (PRIMARY - calls OpenAI twice in parallel for verification)
// ============================================================================
async function extractWithOpenAIDoubleRead(
  apiKey: string,
  base64Data: string,
  mimeType: string,
): Promise<InvoiceExtraction> {
  console.log('[OPENAI-DOUBLE-READ] Starting parallel extraction...');
  const startTime = Date.now();

  // Run two extractions in parallel
  const [result1, result2] = await Promise.allSettled([
    extractWithOpenAI(apiKey, base64Data, mimeType),
    extractWithOpenAI(apiKey, base64Data, mimeType),
  ]);

  const elapsed = Date.now() - startTime;
  console.log('[OPENAI-DOUBLE-READ] Both extractions completed in', elapsed, 'ms');

  // Check results
  const extraction1 = result1.status === 'fulfilled' ? result1.value : null;
  const extraction2 = result2.status === 'fulfilled' ? result2.value : null;

  if (result1.status === 'rejected') {
    console.error('[OPENAI-DOUBLE-READ] Extraction 1 failed:', result1.reason);
  }
  if (result2.status === 'rejected') {
    console.error('[OPENAI-DOUBLE-READ] Extraction 2 failed:', result2.reason);
  }

  // If both failed, throw error
  if (!extraction1 && !extraction2) {
    throw new Error('Both parallel OpenAI extractions failed');
  }

  // If only one succeeded, use it with lower confidence
  if (!extraction1 || !extraction2) {
    const singleResult = extraction1 || extraction2!;
    console.log('[OPENAI-DOUBLE-READ] Only one extraction succeeded, using with reduced confidence');

    // Ensure line items exist
    const withLineItems = ensureLineItems(singleResult);

    // Reduce confidence since we couldn't verify
    withLineItems.confidence = Math.min(withLineItems.confidence || 50, 60);

    return withLineItems;
  }

  // Both succeeded - compare and merge
  console.log('[OPENAI-DOUBLE-READ] Both extractions succeeded, comparing...');
  console.log('[OPENAI-DOUBLE-READ] Extraction 1:', {
    vendor: extraction1.vendor?.name,
    docType: extraction1.document?.type,
    lineItems: extraction1.line_items?.length,
    total: extraction1.totals?.total,
  });
  console.log('[OPENAI-DOUBLE-READ] Extraction 2:', {
    vendor: extraction2.vendor?.name,
    docType: extraction2.document?.type,
    lineItems: extraction2.line_items?.length,
    total: extraction2.totals?.total,
  });

  // Ensure both have line items before comparing
  const e1 = ensureLineItems(extraction1);
  const e2 = ensureLineItems(extraction2);

  // Compare and get merged result with real confidence
  const comparison = compareExtractions(e1, e2);

  console.log('[OPENAI-DOUBLE-READ] Final result:', {
    vendor: comparison.mergedResult.vendor?.name,
    lineItems: comparison.mergedResult.line_items?.length,
    total: comparison.mergedResult.totals?.total,
    realConfidence: comparison.matchScore,
    differences: comparison.differences,
  });

  return comparison.mergedResult;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  console.log('='.repeat(60));
  console.log('[MAIN] Invoice extraction started');
  console.log('[MAIN] Timestamp:', new Date().toISOString());

  // Initialize Supabase client with service role for RLS bypass
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    console.error("[MAIN] Missing Supabase env vars");
    return new Response(
      JSON.stringify({ success: false, error: "Server configuration error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let fileId: string | undefined;

  try {
    // Parse request body
    const body = await req.json();
    console.log("[MAIN] Request body:", JSON.stringify(body));

    fileId = body.file_id;
    const storagePath = body.storage_path;
    const fileType = body.file_type;

    if (!fileId || !storagePath || !fileType) {
      throw new Error(
        "Missing required parameters: file_id, storage_path, file_type"
      );
    }

    console.log('[MAIN] File ID:', fileId);
    console.log('[MAIN] Storage path:', storagePath);
    console.log('[MAIN] File type:', fileType);

    // Validate file type is supported
    const mimeType = getMimeType(fileType);
    if (!mimeType) {
      throw new Error(
        `Unsupported file type: ${fileType}. Supported: PDF, PNG, JPG, JPEG, WEBP, CSV, XLSX`
      );
    }
    console.log('[MAIN] MIME type:', mimeType);

    // Check API keys
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    console.log('[MAIN] GEMINI_API_KEY configured:', !!geminiApiKey, geminiApiKey ? `(${geminiApiKey.length} chars)` : '');
    console.log('[MAIN] OPENAI_API_KEY configured:', !!openaiApiKey, openaiApiKey ? `(${openaiApiKey.length} chars)` : '');

    if (!geminiApiKey && !openaiApiKey) {
      throw new Error("No API keys configured - need GEMINI_API_KEY or OPENAI_API_KEY");
    }

    // ========================================================================
    // STATUS GUARD: Prevent duplicate processing
    // ========================================================================
    // Only process if status is 'pending' or 'failed'
    console.log('[MAIN] Attempting to acquire processing lock...');

    const { data: fileRecord, error: updateError } = await supabase
      .from("files")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
        error_message: null, // Clear previous error on retry
      })
      .eq("id", fileId)
      .in("status", ["pending", "failed"])
      .select("user_id, retry_count, team_id")
      .single();

    // Check for query error first (before checking fileRecord)
    if (updateError) {
      // PGRST116 = "The result contains 0 rows" - means file doesn't match our conditions
      if (updateError.code === 'PGRST116') {
        console.log('[MAIN] Could not acquire lock - file already processed or processing');
        return new Response(
          JSON.stringify({
            success: false,
            error: "File is already being processed, not found, or already completed",
            already_processing: true,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      // Other database errors
      console.error("[MAIN] File update error:", updateError);
      throw new Error(`Failed to update file status: ${updateError.message}`);
    }

    if (!fileRecord) {
      // This shouldn't happen after the error check, but keep as fallback
      console.log('[MAIN] No file record returned (unexpected)');
      return new Response(
        JSON.stringify({
          success: false,
          error: "File not found or already processed",
          already_processing: true,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userId = fileRecord.user_id;
    const teamId = fileRecord.team_id;
    const currentRetryCount = (fileRecord.retry_count || 0) + 1;
    console.log('[MAIN] User ID:', userId);
    console.log('[MAIN] Team ID:', teamId);
    console.log('[MAIN] Retry count:', currentRetryCount);

    // Update retry count
    await supabase
      .from("files")
      .update({ retry_count: currentRetryCount })
      .eq("id", fileId);

    // Download file from storage
    console.log("[MAIN] Downloading from storage:", storagePath);
    const downloadStart = Date.now();
    const { data: blob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(storagePath);

    if (downloadError) {
      console.error("[MAIN] Download error:", downloadError);
      throw new Error(`Download failed: ${downloadError.message}`);
    }

    if (!blob) {
      throw new Error("No blob data returned from storage");
    }

    console.log('[MAIN] Download complete in', Date.now() - downloadStart, 'ms');
    console.log('[MAIN] File size:', blob.size, 'bytes');

    // Prepare base64 data
    let base64Data: string;

    if (isSpreadsheetType(fileType)) {
      console.log('[MAIN] Processing spreadsheet...');
      let csvContent: string;

      if (fileType.toLowerCase() === 'csv') {
        csvContent = await blob.text();
        if (csvContent.charCodeAt(0) === 0xfeff) {
          csvContent = csvContent.slice(1);
        }
        console.log('[MAIN] CSV content length:', csvContent.length);
      } else {
        const sheets = await xlsxToCsvSheets(blob);
        console.log(
          '[MAIN] XLSX sheets:',
          sheets.map((s) => ({ name: s.name, length: s.csv.length }))
        );
        csvContent = sheets
          .map((sheet) => `=== SHEET: ${sheet.name} ===\n${sheet.csv}`)
          .join('\n\n');
      }

      const encoder = new TextEncoder();
      const bytes = encoder.encode(csvContent);
      let binary = '';
      bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
      base64Data = btoa(binary);
    } else {
      // For images and PDFs
      const MAX_SIZE = 20 * 1024 * 1024;
      if (blob.size > MAX_SIZE) {
        throw new Error(
          `File too large: ${Math.round(blob.size / 1024 / 1024)}MB. Maximum is 20MB.`
        );
      }

      const arrayBuffer = await blob.arrayBuffer();
      base64Data = arrayBufferToBase64(arrayBuffer);
    }

    console.log('[MAIN] Base64 data prepared, length:', base64Data.length);

    // Try extraction with fallback
    let extracted: InvoiceExtraction;
    let usedProvider: 'gemini' | 'gemini_double' | 'openai' | 'openai_double';

    // Check if file type is supported by OpenAI (images and PDFs only)
    const isOpenAISupportedType = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(mimeType);

    // Try OpenAI double-read first if available (primary provider)
    if (openaiApiKey && isOpenAISupportedType) {
      try {
        console.log('[MAIN] Attempting OpenAI double-read extraction (primary)...');
        extracted = await extractWithOpenAIDoubleRead(openaiApiKey, base64Data, mimeType);
        usedProvider = 'openai_double';
        console.log('[MAIN] OpenAI double-read extraction succeeded');
      } catch (openaiError) {
        console.error('[MAIN] OpenAI double-read extraction failed:', openaiError);
        console.error('[MAIN] OpenAI error message:', openaiError instanceof Error ? openaiError.message : String(openaiError));

        // Try Gemini double-read as fallback
        if (geminiApiKey) {
          console.log('[MAIN] Falling back to Gemini double-read...');
          try {
            extracted = await extractWithDoubleRead(geminiApiKey, base64Data, mimeType);
            usedProvider = 'gemini_double';
            console.log('[MAIN] Gemini fallback succeeded');
          } catch (geminiError) {
            console.error('[MAIN] Gemini fallback also failed:', geminiError);
            console.error('[MAIN] Gemini error message:', geminiError instanceof Error ? geminiError.message : String(geminiError));
            throw new Error(
              `Both providers failed. OpenAI: ${openaiError instanceof Error ? openaiError.message : String(openaiError)}. Gemini: ${geminiError instanceof Error ? geminiError.message : String(geminiError)}`
            );
          }
        } else {
          console.error('[MAIN] No fallback available (GEMINI_API_KEY not set)');
          throw openaiError;
        }
      }
    } else if (geminiApiKey) {
      // OpenAI not available or file type not supported by OpenAI - use Gemini
      try {
        console.log('[MAIN] Using Gemini double-read (OpenAI not available for this file type)...');
        extracted = await extractWithDoubleRead(geminiApiKey, base64Data, mimeType);
        usedProvider = 'gemini_double';
        console.log('[MAIN] Gemini double-read extraction succeeded');
      } catch (geminiError) {
        console.error('[MAIN] Gemini double-read extraction failed:', geminiError);
        console.error('[MAIN] Gemini error message:', geminiError instanceof Error ? geminiError.message : String(geminiError));
        throw geminiError;
      }
    } else {
      // No suitable provider available
      throw new Error(
        `No suitable AI provider available. OpenAI supports images/PDFs only (file type: ${mimeType}). GEMINI_API_KEY not configured.`
      );
    }

    console.log('[MAIN] Final extraction provider:', usedProvider);
    console.log('[MAIN] Final extraction result:', {
      vendor: extracted.vendor?.name,
      documentType: extracted.document?.type,
      lineItemCount: extracted.line_items?.length,
      total: extracted.totals?.total,
      currency: extracted.totals?.currency,
      confidence: extracted.confidence,
    });

    // Insert into invoices table with normalized currency
    console.log('[MAIN] Inserting invoice into database...');
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        user_id: userId,
        team_id: teamId,
        file_id: fileId,
        vendor_name: extracted.vendor?.name,
        invoice_number: extracted.document?.number,
        invoice_date: extracted.document?.date,
        subtotal_agorot: toAgorot(extracted.totals?.subtotal),
        vat_amount_agorot: toAgorot(extracted.totals?.vat_amount),
        total_amount_agorot: toAgorot(extracted.totals?.total),
        currency: normalizeCurrency(extracted.totals?.currency),
        confidence_score: extracted.confidence,
        status: "pending",
      })
      .select()
      .single();

    if (invoiceError) {
      console.error("[MAIN] Invoice insert error:", invoiceError);
      throw new Error(`Failed to create invoice: ${invoiceError.message}`);
    }

    console.log("[MAIN] Invoice created:", invoice.id);

    // Update file status to processed
    await supabase
      .from("files")
      .update({ status: "processed" })
      .eq("id", fileId);

    console.log('[MAIN] File status updated to processed');
    console.log('[MAIN] Extraction complete');
    console.log('='.repeat(60));

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        invoice_id: invoice.id,
        user_id: userId,
        confidence: extracted.confidence,
        provider: usedProvider,
        extracted: extracted,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[MAIN] Extraction error:", error);
    console.error(
      "[MAIN] Error stack:",
      error instanceof Error ? error.stack : "no stack"
    );

    // Update file status to error if we have a file_id
    if (fileId) {
      try {
        // Get current retry count to include in error
        const { data: currentFile } = await supabase
          .from("files")
          .select("retry_count, max_retries")
          .eq("id", fileId)
          .single();

        const retryCount = currentFile?.retry_count || 0;
        const maxRetries = currentFile?.max_retries || 3;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        await supabase
          .from("files")
          .update({
            status: "failed",
            error_message: `[Attempt ${retryCount}/${maxRetries}] ${errorMessage}`,
          })
          .eq("id", fileId);
        console.log(`[MAIN] File status updated to failed (attempt ${retryCount}/${maxRetries})`);
      } catch (updateError) {
        console.error("[MAIN] Failed to update file status:", updateError);
      }
    }

    console.log('='.repeat(60));

    // Return error response
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
