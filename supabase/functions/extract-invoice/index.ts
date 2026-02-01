// Supabase Edge Function for AI-powered invoice extraction
// Primary: Gemini 3.0 Flash Preview | Fallback: Kimi K2.5 via Together AI
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Primary: Gemini 3.0 Flash Preview
const GEMINI_MODEL = 'gemini-3.0-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Fallback: Kimi K2.5 via Together AI
const TOGETHER_URL = 'https://api.together.xyz/v1/chat/completions';
const KIMI_MODEL = 'moonshotai/Kimi-K2.5';

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

// Extract JSON from text that may be wrapped in markdown code blocks
function extractJsonFromText(text: string): string | null {
  const trimmed = text.trim();

  // Direct JSON object
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  // JSON in markdown code block: ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    if (inner.startsWith('{') && inner.endsWith('}')) {
      return inner;
    }
  }

  // Try to find JSON object anywhere in the text
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
};

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
    country?: string | null;
  };
  document: {
    type: 'billing_summary' | 'invoice' | 'receipt' | 'credit_note';
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
  confidence: number;
}

// ============================================================================
// GEMINI EXTRACTION
// ============================================================================
async function extractWithGemini(
  apiKey: string,
  base64Data: string,
  mimeType: string,
): Promise<InvoiceExtraction> {
  console.log('[GEMINI] Starting extraction...');
  console.log('[GEMINI] Model:', GEMINI_MODEL);
  console.log('[GEMINI] URL:', GEMINI_URL);
  console.log('[GEMINI] Data size:', Math.round(base64Data.length / 1024), 'KB base64');
  console.log('[GEMINI] MIME type:', mimeType);

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
      responseMimeType: 'application/json',
      responseSchema: INVOICE_RESPONSE_SCHEMA,
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
    confidence: extracted.confidence,
  });

  return extracted;
}

// ============================================================================
// KIMI K2.5 EXTRACTION (FALLBACK)
// ============================================================================
async function extractWithKimi(
  apiKey: string,
  base64Data: string,
  mimeType: string,
): Promise<InvoiceExtraction> {
  console.log('[KIMI] Starting fallback extraction...');
  console.log('[KIMI] Model:', KIMI_MODEL);
  console.log('[KIMI] URL:', TOGETHER_URL);
  console.log('[KIMI] Data size:', Math.round(base64Data.length / 1024), 'KB base64');
  console.log('[KIMI] MIME type:', mimeType);

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
    max_tokens: 16384,
  };

  console.log('[KIMI] Sending request...');
  const startTime = Date.now();

  const response = await fetch(TOGETHER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const elapsed = Date.now() - startTime;
  console.log('[KIMI] Response received in', elapsed, 'ms');
  console.log('[KIMI] Status:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[KIMI] Error response body:', errorText);
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { raw: errorText };
    }
    console.error('[KIMI] Parsed error:', JSON.stringify(errorData, null, 2));
    throw new Error(
      `Kimi API error: ${response.status} - ${errorData?.error?.message || errorData?.raw || 'Unknown error'}`
    );
  }

  const data = await response.json();
  console.log('[KIMI] Response keys:', Object.keys(data));

  if (!data.choices || data.choices.length === 0) {
    console.error('[KIMI] No choices in response:', JSON.stringify(data, null, 2));
    throw new Error('Kimi returned no choices');
  }

  const choice = data.choices[0];
  console.log('[KIMI] Choice finish_reason:', choice.finish_reason);
  console.log('[KIMI] Choice message role:', choice.message?.role);

  const content = choice.message?.content;
  if (!content) {
    console.error('[KIMI] No content in message:', JSON.stringify(choice, null, 2));
    throw new Error('Kimi response has no content');
  }

  console.log('[KIMI] Content length:', content.length);
  console.log('[KIMI] Content preview:', content.substring(0, 200));

  const jsonText = extractJsonFromText(content);
  if (!jsonText) {
    console.error('[KIMI] No JSON found in content');
    console.error('[KIMI] Full content:', content.substring(0, 1000));
    throw new Error('Kimi response contained no valid JSON');
  }

  console.log('[KIMI] Parsing JSON...');
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (parseError) {
    console.error('[KIMI] JSON parse failed:', parseError);
    console.error('[KIMI] Raw JSON text:', jsonText.substring(0, 500));
    throw new Error('Failed to parse Kimi response as JSON');
  }

  if (Array.isArray(parsed)) {
    console.log('[KIMI] Response is array, taking first element');
    parsed = parsed[0];
  }

  const extracted = parsed as InvoiceExtraction;

  if (!extracted.vendor || !extracted.totals) {
    console.error('[KIMI] Incomplete extraction:', JSON.stringify(extracted, null, 2));
    throw new Error('Kimi extraction incomplete - missing vendor or totals');
  }

  console.log('[KIMI] Extraction successful:', {
    vendor: extracted.vendor?.name,
    documentType: extracted.document?.type,
    lineItemCount: extracted.line_items?.length,
    total: extracted.totals?.total,
    confidence: extracted.confidence,
  });

  return extracted;
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
    const togetherApiKey = Deno.env.get("TOGETHER_API_KEY");

    console.log('[MAIN] GEMINI_API_KEY configured:', !!geminiApiKey, geminiApiKey ? `(${geminiApiKey.length} chars)` : '');
    console.log('[MAIN] TOGETHER_API_KEY configured:', !!togetherApiKey, togetherApiKey ? `(${togetherApiKey.length} chars)` : '');

    if (!geminiApiKey && !togetherApiKey) {
      throw new Error("No API keys configured - need GEMINI_API_KEY or TOGETHER_API_KEY");
    }

    // Update file status to processing AND fetch user_id in one call
    console.log('[MAIN] Updating file status to processing...');
    const { data: fileRecord, error: updateError } = await supabase
      .from("files")
      .update({ status: "processing" })
      .eq("id", fileId)
      .select("user_id")
      .single();

    if (updateError || !fileRecord) {
      console.error("[MAIN] File update/fetch error:", updateError);
      throw new Error(`File not found or update failed: ${fileId}`);
    }

    const userId = fileRecord.user_id;
    console.log('[MAIN] User ID:', userId);

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
    let usedProvider: 'gemini' | 'kimi';

    // Try Gemini first if available
    if (geminiApiKey) {
      try {
        console.log('[MAIN] Attempting Gemini extraction...');
        extracted = await extractWithGemini(geminiApiKey, base64Data, mimeType);
        usedProvider = 'gemini';
        console.log('[MAIN] Gemini extraction succeeded');
      } catch (geminiError) {
        console.error('[MAIN] Gemini extraction failed:', geminiError);
        console.error('[MAIN] Gemini error message:', geminiError instanceof Error ? geminiError.message : String(geminiError));

        // Try Kimi fallback
        if (togetherApiKey) {
          console.log('[MAIN] Falling back to Kimi...');
          try {
            extracted = await extractWithKimi(togetherApiKey, base64Data, mimeType);
            usedProvider = 'kimi';
            console.log('[MAIN] Kimi fallback succeeded');
          } catch (kimiError) {
            console.error('[MAIN] Kimi fallback also failed:', kimiError);
            console.error('[MAIN] Kimi error message:', kimiError instanceof Error ? kimiError.message : String(kimiError));
            throw new Error(
              `Both providers failed. Gemini: ${geminiError instanceof Error ? geminiError.message : String(geminiError)}. Kimi: ${kimiError instanceof Error ? kimiError.message : String(kimiError)}`
            );
          }
        } else {
          console.error('[MAIN] No fallback available (TOGETHER_API_KEY not set)');
          throw geminiError;
        }
      }
    } else {
      // Only Kimi available
      console.log('[MAIN] Using Kimi (Gemini not configured)...');
      extracted = await extractWithKimi(togetherApiKey!, base64Data, mimeType);
      usedProvider = 'kimi';
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
        await supabase
          .from("files")
          .update({
            status: "failed",
            error_message:
              error instanceof Error ? error.message : "Unknown error",
          })
          .eq("id", fileId);
        console.log('[MAIN] File status updated to failed');
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
