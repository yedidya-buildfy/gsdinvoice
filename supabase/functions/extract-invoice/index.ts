// Supabase Edge Function for AI-powered invoice extraction using Gemini 3 Flash
// Handles PDF and image documents, extracts structured invoice data

import { GoogleGenAI } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";
import { zodToJsonSchema } from "npm:zod-to-json-schema";

// Schema for invoice extraction - matches invoices table structure
const InvoiceExtractionSchema = z.object({
  vendor_name: z.string().nullable().describe("Business/vendor name"),
  invoice_number: z.string().nullable().describe("Invoice or receipt number"),
  invoice_date: z.string().nullable().describe("Date in YYYY-MM-DD format"),
  subtotal: z.number().nullable().describe("Amount before tax"),
  vat_amount: z.number().nullable().describe("VAT/tax amount"),
  total_amount: z.number().nullable().describe("Total including tax"),
  currency: z.enum(["ILS", "USD", "EUR", "GBP"]).default("ILS"),
  confidence: z.number().min(0).max(100).describe("Extraction confidence 0-100"),
  line_items: z.array(z.object({
    description: z.string().nullable(),
    quantity: z.number().nullable(),
    unit_price: z.number().nullable(),
    total: z.number().nullable(),
  })).default([]),
});

type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert amounts to agorot (integer cents) for database storage
function toAgorot(amount: number | null): number | null {
  return amount !== null ? Math.round(amount * 100) : null;
}

// Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return btoa(bytes.reduce((data, byte) => data + String.fromCharCode(byte), ""));
}

// Determine MIME type from file type
function getMimeType(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    default:
      return "image/jpeg";
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Initialize Supabase client with service role for RLS bypass
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let fileId: string | undefined;

  try {
    // Parse request body
    const body = await req.json();
    fileId = body.file_id;
    const storagePath = body.storage_path;
    const fileType = body.file_type;

    if (!fileId || !storagePath || !fileType) {
      throw new Error("Missing required parameters: file_id, storage_path, file_type");
    }

    // Initialize Gemini AI client
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    // Update file status to processing
    await supabase
      .from("files")
      .update({ status: "processing" })
      .eq("id", fileId);

    // Download file from storage
    const { data: blob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Download failed: ${downloadError.message}`);
    }

    // Convert to base64 for Gemini inline data
    const arrayBuffer = await blob.arrayBuffer();
    const base64Data = arrayBufferToBase64(arrayBuffer);
    const mimeType = getMimeType(fileType);

    // Call Gemini with structured output
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: `You are an invoice data extraction assistant. Extract structured data from this invoice/receipt document.

The document may be in Hebrew (RTL) or English. Handle both languages correctly.

Instructions:
- Extract the vendor/business name exactly as shown
- Convert dates to YYYY-MM-DD format (handle Hebrew date formats like DD/MM/YYYY)
- Extract amounts as numbers without currency symbols
- Identify VAT/tax amounts if shown separately (common in Israeli invoices)
- Extract line items if visible
- Set confidence 0-100 based on document clarity and extraction certainty
- If a field is not visible or unclear, set it to null

Return the extracted data in the specified JSON format.`,
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(InvoiceExtractionSchema),
      },
    });

    // Parse and validate response
    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response from Gemini");
    }
    const extracted: InvoiceExtraction = JSON.parse(responseText);

    // Get user_id from the file record
    const { data: fileRecord, error: fileError } = await supabase
      .from("files")
      .select("user_id")
      .eq("id", fileId)
      .single();

    if (fileError || !fileRecord) {
      throw new Error(`Failed to get file record: ${fileError?.message || "Not found"}`);
    }

    // Insert into invoices table with amounts converted to agorot
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        user_id: fileRecord.user_id,
        file_id: fileId,
        vendor_name: extracted.vendor_name,
        invoice_number: extracted.invoice_number,
        invoice_date: extracted.invoice_date,
        subtotal_agorot: toAgorot(extracted.subtotal),
        vat_amount_agorot: toAgorot(extracted.vat_amount),
        total_amount_agorot: toAgorot(extracted.total_amount),
        currency: extracted.currency,
        confidence_score: extracted.confidence,
        status: "pending_review",
      })
      .select()
      .single();

    if (invoiceError) {
      throw new Error(`Failed to create invoice: ${invoiceError.message}`);
    }

    // Insert line items if present
    if (extracted.line_items && extracted.line_items.length > 0) {
      const { error: rowsError } = await supabase.from("invoice_rows").insert(
        extracted.line_items.map((item) => ({
          invoice_id: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unit_price_agorot: toAgorot(item.unit_price),
          total_agorot: toAgorot(item.total),
        }))
      );

      if (rowsError) {
        console.error("Failed to insert line items:", rowsError.message);
        // Don't fail the whole extraction for line items error
      }
    }

    // Update file status to extracted
    await supabase
      .from("files")
      .update({
        status: "extracted",
        extracted_data: extracted,
        processed_at: new Date().toISOString(),
      })
      .eq("id", fileId);

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

    // Update file status to error if we have a file_id
    if (fileId) {
      try {
        await supabase
          .from("files")
          .update({
            status: "error",
            error_message: error instanceof Error ? error.message : "Unknown error",
          })
          .eq("id", fileId);
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
