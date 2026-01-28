// Supabase Edge Function for AI-powered invoice extraction using Gemini REST API
// Logic copied exactly from src/lib/gemini/extractInvoice.ts (tested and working)
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Convert amounts to agorot (integer cents) for database storage
function toAgorot(amount: number | null | undefined): number | null {
  return amount != null ? Math.round(amount * 100) : null;
}

const GEMINI_MODEL = 'gemini-3-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// The extraction prompt - simple and clear, let Gemini + code execution handle the parsing
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
// Gemini supports CSV natively but not XLSX binary
async function xlsxToCsvSheets(blob: Blob): Promise<Array<{ name: string; csv: string }>> {
  const buffer = await blob.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    codepage: 65001, // UTF-8 for Hebrew
    cellDates: true,
    dateNF: 'yyyy-mm-dd', // Consistent date format
  });

  const sheets: Array<{ name: string; csv: string }> = [];
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(worksheet, {
      blankrows: false, // Skip empty rows
      strip: true, // Trim whitespace
    });
    // Only include non-empty sheets
    if (csv.trim()) {
      sheets.push({ name: sheetName, csv });
    }
  }

  return sheets;
}

// InvoiceExtraction type (copied from src/lib/extraction/types.ts)
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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Initialize Supabase client with service role for RLS bypass
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase env vars");
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
    console.log("Request body:", JSON.stringify(body));

    fileId = body.file_id;
    const storagePath = body.storage_path;
    const fileType = body.file_type;

    if (!fileId || !storagePath || !fileType) {
      throw new Error(
        "Missing required parameters: file_id, storage_path, file_type"
      );
    }

    // Validate file type is supported
    const mimeType = getMimeType(fileType);
    if (!mimeType) {
      throw new Error(
        `Unsupported file type: ${fileType}. Supported: PDF, PNG, JPG, JPEG, WEBP, CSV, XLSX`
      );
    }

    // Get Gemini API key
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }
    console.log("Gemini API key found, length:", geminiApiKey.length);

    // Update file status to processing
    const { error: updateError } = await supabase
      .from("files")
      .update({ status: "processing" })
      .eq("id", fileId);

    if (updateError) {
      console.error("Failed to update file status:", updateError);
    }

    // Download file from storage
    console.log("Downloading from storage:", storagePath);
    const { data: blob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(storagePath);

    if (downloadError) {
      console.error("Download error:", downloadError);
      throw new Error(`Download failed: ${downloadError.message}`);
    }

    if (!blob) {
      throw new Error("No blob data returned from storage");
    }

    // Build the request based on file type (exact logic from extractInvoice.ts)
    let requestBody: {
      tools?: Array<{ code_execution: Record<string, never> }>;
      contents: Array<{
        parts: Array<{
          text?: string;
          inlineData?: { mimeType: string; data: string };
        }>;
      }>;
      generationConfig: {
        responseMimeType: string;
        thinkingConfig: { thinkingLevel: 'low' | 'medium' | 'high' };
      };
    };

    if (isSpreadsheetType(fileType)) {
      // For spreadsheets: Convert to CSV and use code execution for reliable parsing
      let csvContent: string;

      if (fileType.toLowerCase() === 'csv') {
        // CSV: Read as text
        csvContent = await blob.text();
        // Remove UTF-8 BOM if present
        if (csvContent.charCodeAt(0) === 0xfeff) {
          csvContent = csvContent.slice(1);
        }
        console.log('Sending CSV to Gemini:', { length: csvContent.length });
      } else {
        // XLSX: Convert each sheet to CSV
        const sheets = await xlsxToCsvSheets(blob);
        console.log(
          'Converted XLSX to CSV:',
          sheets.map((s) => ({ name: s.name, length: s.csv.length }))
        );

        // Combine sheets with clear separators
        csvContent = sheets
          .map((sheet) => `=== SHEET: ${sheet.name} ===\n${sheet.csv}`)
          .join('\n\n');
      }

      // Send CSV as inlineData (Gemini supports text/csv natively)
      // Plus enable code execution for complex parsing if needed
      // Convert UTF-8 string to base64 (modern approach)
      const encoder = new TextEncoder();
      const bytes = encoder.encode(csvContent);
      let binary = '';
      bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
      const csvBase64 = btoa(binary);

      requestBody = {
        tools: [{ code_execution: {} }], // Enable Python for complex parsing
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: 'text/csv',
                  data: csvBase64,
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
          thinkingConfig: { thinkingLevel: 'low' },
        },
      };
    } else {
      // For images and PDFs: Use inline data (no code execution needed)
      const MAX_SIZE = 20 * 1024 * 1024;
      if (blob.size > MAX_SIZE) {
        throw new Error(
          `File too large: ${Math.round(blob.size / 1024 / 1024)}MB. Maximum is 20MB.`
        );
      }

      const arrayBuffer = await blob.arrayBuffer();
      const base64Data = arrayBufferToBase64(arrayBuffer);

      console.log('Sending image/PDF to Gemini:', {
        mimeType,
        fileSize: blob.size,
      });

      requestBody = {
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
          thinkingConfig: { thinkingLevel: 'low' }, // Minimize latency and cost
        },
      };
    }

    // Call Gemini API
    console.log("Calling Gemini API...");
    const response = await fetch(`${GEMINI_URL}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Gemini API error:', response.status, errorData);
      throw new Error(
        `Gemini API error: ${response.status} - ${errorData?.error?.message || 'Unknown error'}`
      );
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      console.error('No candidates in Gemini response:', data);
      throw new Error('No response from Gemini');
    }

    // Extract the JSON from the response
    // With code execution, the response might have multiple parts (code + output)
    let jsonText: string | null = null;

    for (const part of data.candidates[0].content.parts) {
      if (part.text) {
        // Try to find JSON in the text
        const text = part.text.trim();
        if (text.startsWith('{') && text.endsWith('}')) {
          jsonText = text;
          break;
        }
      }
    }

    if (!jsonText) {
      // Fallback: Try the first text part
      const firstTextPart = data.candidates[0].content.parts.find(
        (p: { text?: string }) => p.text
      );
      if (firstTextPart?.text) {
        jsonText = firstTextPart.text;
      }
    }

    if (!jsonText) {
      console.error('No JSON found in Gemini response:', data.candidates[0].content.parts);
      throw new Error('Invalid response from Gemini - no JSON found');
    }

    console.log('Gemini response JSON:', jsonText.substring(0, 500) + '...');

    const extracted = JSON.parse(jsonText) as InvoiceExtraction;

    console.log('Extracted data:', {
      vendor: extracted.vendor?.name,
      documentType: extracted.document?.type,
      lineItemCount: extracted.line_items?.length,
      total: extracted.totals?.total,
      confidence: extracted.confidence,
    });

    // Get user_id from the file record
    const { data: fileRecord, error: fileError } = await supabase
      .from("files")
      .select("user_id")
      .eq("id", fileId)
      .single();

    if (fileError || !fileRecord) {
      console.error("File record error:", fileError);
      throw new Error(
        `Failed to get file record: ${fileError?.message || "Not found"}`
      );
    }

    // Insert into invoices table with amounts converted to agorot
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        user_id: fileRecord.user_id,
        file_id: fileId,
        vendor_name: extracted.vendor?.name,
        invoice_number: extracted.document?.number,
        invoice_date: extracted.document?.date,
        subtotal_agorot: toAgorot(extracted.totals?.subtotal),
        vat_amount_agorot: toAgorot(extracted.totals?.vat_amount),
        total_amount_agorot: toAgorot(extracted.totals?.total),
        currency: extracted.totals?.currency || "ILS",
        confidence_score: extracted.confidence,
        status: "pending",
      })
      .select()
      .single();

    if (invoiceError) {
      console.error("Invoice insert error:", invoiceError);
      throw new Error(`Failed to create invoice: ${invoiceError.message}`);
    }

    // Insert line items into invoice_rows table
    if (extracted.line_items && extracted.line_items.length > 0) {
      const lineItemRows = extracted.line_items.map((item) => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: 1,
        unit_price_agorot: toAgorot(item.amount),
        total_agorot: toAgorot(item.amount),
        date: item.date,
        reference_id: item.reference_id,
        currency: item.currency || extracted.totals?.currency || "ILS",
        vat_rate: item.vat_rate,
        vat_amount_agorot: toAgorot(item.vat_amount),
      }));

      const { error: rowsError } = await supabase
        .from("invoice_rows")
        .insert(lineItemRows);

      if (rowsError) {
        console.error("Invoice rows insert error:", rowsError);
        // Don't fail the whole extraction if line items fail
      } else {
        console.log(`Inserted ${lineItemRows.length} line items`);
      }
    }

    // Update file status to extracted
    await supabase
      .from("files")
      .update({
        status: "processed",
        extracted_data: extracted,
        processed_at: new Date().toISOString(),
      })
      .eq("id", fileId);

    console.log("Extraction complete, invoice:", invoice.id);

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        invoice_id: invoice.id,
        confidence: extracted.confidence,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Extraction error:", error);
    console.error(
      "Error stack:",
      error instanceof Error ? error.stack : "no stack"
    );

    // Update file status to error if we have a file_id
    if (fileId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          await supabase
            .from("files")
            .update({
              status: "failed",
              error_message:
                error instanceof Error ? error.message : "Unknown error",
            })
            .eq("id", fileId);
        }
      } catch (updateError) {
        console.error("Failed to update file status:", updateError);
      }
    }

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
