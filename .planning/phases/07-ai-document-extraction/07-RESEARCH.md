# Phase 7: AI Document Extraction - Research

**Researched:** 2026-01-28
**Domain:** AI-powered invoice data extraction using Gemini API
**Confidence:** HIGH

## Summary

This phase implements AI-powered extraction of structured invoice data using Google's Gemini 3 Flash model. The architecture uses Supabase Edge Functions to securely call the Gemini API, with a queue-based processing system for reliability. Documents stored in Supabase Storage are downloaded, converted to base64, and sent to Gemini with a structured output schema that extracts vendor name, date, amount, VAT, and invoice number with confidence scores.

The standard approach involves:
1. **Edge Function** for secure API key handling (Gemini API key stored as secret)
2. **Queue-based processing** using database status field or pgmq for reliability
3. **Structured output** with Zod schema for type-safe extraction
4. **Inline base64** for document/image data (under 20MB limit)

**Primary recommendation:** Use Supabase Edge Function with `@google/genai` SDK, Gemini 3 Flash model (`gemini-3-flash-preview`), and structured output with explicit confidence field in schema. Process documents asynchronously via database trigger or polling pattern.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/genai` | 1.37.0+ | Google Gemini SDK | Official GA SDK, supports structured output, TypeScript-first |
| `zod` | 3.x | Schema validation | SDK integrates with Zod via `zod-to-json-schema` |
| `zod-to-json-schema` | 3.x | Schema conversion | Required for structured output with Zod |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Supabase Edge Functions | Deno 2.1+ | Serverless execution | Secure API key handling, server-side processing |
| `@supabase/supabase-js` | 2.x | Database/Storage client | Already in project, use for file download |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Gemini 3 Flash | Gemini 2.5 Flash | 2.5 is stable GA, 3 is preview but faster and cheaper |
| Edge Function | Client-side API call | Client-side exposes API key - never do this in production |
| Inline base64 | Files API | Files API better for reuse, inline simpler for one-time processing |

**Installation (Edge Function):**
```bash
# Edge Functions use Deno imports, no npm install needed
# Dependencies are imported directly in the function
```

**Secrets Setup:**
```bash
supabase secrets set GEMINI_API_KEY=your_api_key_here
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── hooks/
│   └── useDocumentExtraction.ts  # Client hook for triggering/monitoring
├── lib/
│   └── extraction/
│       └── types.ts              # Shared extraction types
└── components/
    └── documents/
        └── ExtractionStatus.tsx  # UI for extraction progress

supabase/
└── functions/
    └── extract-invoice/
        └── index.ts              # Edge Function for Gemini API
```

### Pattern 1: Queue-Based Async Processing
**What:** Use database status field to track extraction state, process via Edge Function
**When to use:** Always - provides reliability, retry capability, and decouples upload from processing
**Example:**
```typescript
// Database status flow:
// 'pending' -> 'processing' -> 'extracted' | 'error'

// src/types/database.ts already has:
// files.status: string
// files.extracted_data: Json | null
// files.error_message: string | null
// files.processed_at: string | null

// invoices table already has:
// confidence_score: number | null
// file_id references files.id
```

### Pattern 2: Edge Function with Structured Output
**What:** Edge Function downloads file, sends to Gemini with Zod schema, stores result
**When to use:** For all AI extraction to keep API keys secure
**Example:**
```typescript
// supabase/functions/extract-invoice/index.ts
import { GoogleGenAI } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";
import { zodToJsonSchema } from "npm:zod-to-json-schema";

const invoiceSchema = z.object({
  vendor_name: z.string().nullable().describe("The name of the vendor/supplier"),
  invoice_number: z.string().nullable().describe("The invoice number or reference"),
  invoice_date: z.string().nullable().describe("The invoice date in YYYY-MM-DD format"),
  subtotal: z.number().nullable().describe("Subtotal before VAT in the document currency"),
  vat_amount: z.number().nullable().describe("VAT/tax amount"),
  total_amount: z.number().nullable().describe("Total amount including VAT"),
  currency: z.string().default("ILS").describe("Currency code (ILS, USD, EUR, etc.)"),
  confidence: z.number().min(0).max(100).describe("Confidence score 0-100 for the overall extraction quality"),
  line_items: z.array(z.object({
    description: z.string().nullable(),
    quantity: z.number().nullable(),
    unit_price: z.number().nullable(),
    total: z.number().nullable(),
  })).optional().describe("Individual line items from the invoice"),
});

const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY") });

Deno.serve(async (req) => {
  const { file_id, storage_path, file_type } = await req.json();

  // Create Supabase client with service role for RLS bypass
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Update status to processing
    await supabase.from("files").update({ status: "processing" }).eq("id", file_id);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(storage_path);
    if (downloadError) throw downloadError;

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Determine MIME type
    const mimeType = file_type === "pdf" ? "application/pdf" : `image/${file_type}`;

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
          text: `Extract invoice data from this document. The document may be in Hebrew or English.
                 Extract all visible fields including vendor name, invoice number, date, amounts, and line items.
                 For dates, convert to YYYY-MM-DD format.
                 For amounts, extract the numeric value without currency symbols.
                 Provide a confidence score (0-100) based on how clearly the data was visible and extracted.`,
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(invoiceSchema),
      },
    });

    const extracted = JSON.parse(response.text);

    // Store extraction result
    // ... update files and invoices tables

  } catch (error) {
    await supabase.from("files").update({
      status: "error",
      error_message: error.message
    }).eq("id", file_id);
  }
});
```

### Pattern 3: Client-Side Trigger with Optimistic Updates
**What:** Client triggers extraction via Edge Function invocation, uses TanStack Query for state
**When to use:** For immediate feedback after document upload
**Example:**
```typescript
// src/hooks/useDocumentExtraction.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useExtractDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileId: string) => {
      // Get file info
      const { data: file } = await supabase
        .from("files")
        .select("storage_path, file_type")
        .eq("id", fileId)
        .single();

      // Invoke Edge Function
      const { data, error } = await supabase.functions.invoke("extract-invoice", {
        body: {
          file_id: fileId,
          storage_path: file.storage_path,
          file_type: file.file_type,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
```

### Anti-Patterns to Avoid
- **Client-side API key:** Never expose Gemini API key in browser code
- **Synchronous processing:** Don't make users wait for extraction during upload
- **No retry logic:** Always implement exponential backoff for API failures
- **Ignoring confidence:** Don't auto-approve low-confidence extractions without review

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema from types | Manual JSON schema | `zod-to-json-schema` | Type-safe, auto-synced with Zod types |
| Retry with backoff | Custom retry loop | SDK built-in retry or `p-retry` | Handles jitter, exponential backoff correctly |
| Base64 encoding | Custom encoder | `btoa()` / `Buffer.toString('base64')` | Built-in, handles edge cases |
| Queue processing | Custom polling | Supabase `pgmq` or status field | Battle-tested, handles visibility timeouts |

**Key insight:** Gemini's structured output with Zod handles most extraction complexity. Don't try to parse unstructured text responses - use the schema enforcement.

## Common Pitfalls

### Pitfall 1: API Key Exposure
**What goes wrong:** API key visible in browser network tab, key gets stolen
**Why it happens:** Calling Gemini directly from React components
**How to avoid:** Always use Edge Function as proxy, store key in `supabase secrets`
**Warning signs:** Any `GEMINI_API_KEY` in client-side code

### Pitfall 2: Large File Failures
**What goes wrong:** Request fails with size limit errors
**Why it happens:** Inline data limit is 20MB total request size
**How to avoid:** Check file size before processing, use Files API for large documents, or compress images
**Warning signs:** Files over 15MB, PDFs with many pages

### Pitfall 3: Hebrew Text Extraction Issues
**What goes wrong:** Hebrew text comes out garbled or reversed
**Why it happens:** Model needs explicit instruction about RTL text
**How to avoid:** Include "The document may be in Hebrew" in prompt, verify output orientation
**Warning signs:** Numeric sequences reversed, missing Hebrew characters

### Pitfall 4: Rate Limit Cascading Failures
**What goes wrong:** One 429 error causes all pending extractions to fail
**Why it happens:** No backoff, all requests retry simultaneously
**How to avoid:** Implement exponential backoff with jitter, process sequentially with delays
**Warning signs:** Burst of 429 errors, "RESOURCE_EXHAUSTED" in logs

### Pitfall 5: Missing Confidence Calibration
**What goes wrong:** Model returns 95% confidence for obviously wrong extractions
**Why it happens:** LLM confidence != extraction accuracy
**How to avoid:** Add confidence field to schema, but also implement sanity checks (valid date, reasonable amount)
**Warning signs:** High confidence with null/empty fields, impossible dates

### Pitfall 6: Edge Function Timeout
**What goes wrong:** Function times out before Gemini responds
**Why it happens:** Default 60s timeout, large documents take longer
**How to avoid:** Increase timeout in config, use background tasks for large files
**Warning signs:** Consistent timeouts on PDF files

## Code Examples

Verified patterns from official sources:

### Edge Function Setup with Gemini
```typescript
// supabase/functions/extract-invoice/index.ts
// Source: https://ai.google.dev/gemini-api/docs/structured-output

import { GoogleGenAI } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";
import { zodToJsonSchema } from "npm:zod-to-json-schema";

// Schema for invoice extraction
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { file_id, storage_path, file_type } = await req.json();

    // Initialize clients
    const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY")! });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Mark as processing
    await supabase
      .from("files")
      .update({ status: "processing" })
      .eq("id", file_id);

    // Download file from storage
    const { data: blob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(storage_path);

    if (downloadError) throw new Error(`Download failed: ${downloadError.message}`);

    // Convert to base64
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const base64 = btoa(bytes.reduce((data, byte) => data + String.fromCharCode(byte), ""));

    // Determine MIME type
    const mimeType = file_type === "pdf"
      ? "application/pdf"
      : file_type === "png"
        ? "image/png"
        : "image/jpeg";

    // Call Gemini with structured output
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: { mimeType, data: base64 },
        },
        {
          text: `You are an invoice data extraction assistant. Extract structured data from this invoice/receipt document.

The document may be in Hebrew (RTL) or English. Handle both languages correctly.

Instructions:
- Extract the vendor/business name exactly as shown
- Convert dates to YYYY-MM-DD format (handle Hebrew date formats)
- Extract amounts as numbers without currency symbols
- Identify VAT/tax amounts if shown separately
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
    const extracted: InvoiceExtraction = JSON.parse(response.text);

    // Convert amounts to agorot (integer cents)
    const toAgorot = (amount: number | null) =>
      amount !== null ? Math.round(amount * 100) : null;

    // Get user_id from the file record
    const { data: fileRecord } = await supabase
      .from("files")
      .select("user_id")
      .eq("id", file_id)
      .single();

    // Insert into invoices table
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        user_id: fileRecord!.user_id,
        file_id,
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

    if (invoiceError) throw invoiceError;

    // Insert line items if present
    if (extracted.line_items.length > 0) {
      await supabase.from("invoice_rows").insert(
        extracted.line_items.map((item) => ({
          invoice_id: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unit_price_agorot: toAgorot(item.unit_price),
          total_agorot: toAgorot(item.total),
        }))
      );
    }

    // Update file status
    await supabase
      .from("files")
      .update({
        status: "extracted",
        extracted_data: extracted,
        processed_at: new Date().toISOString(),
      })
      .eq("id", file_id);

    return new Response(
      JSON.stringify({ success: true, invoice_id: invoice.id, confidence: extracted.confidence }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Extraction error:", error);

    // Try to update file status to error
    try {
      const { file_id } = await req.json();
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase
        .from("files")
        .update({ status: "error", error_message: error.message })
        .eq("id", file_id);
    } catch {}

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### Client Hook for Extraction
```typescript
// src/hooks/useDocumentExtraction.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface ExtractDocumentParams {
  fileId: string;
  storagePath: string;
  fileType: string;
}

interface ExtractionResult {
  success: boolean;
  invoice_id?: string;
  confidence?: number;
  error?: string;
}

export function useExtractDocument() {
  const queryClient = useQueryClient();

  return useMutation<ExtractionResult, Error, ExtractDocumentParams>({
    mutationFn: async ({ fileId, storagePath, fileType }) => {
      const { data, error } = await supabase.functions.invoke<ExtractionResult>(
        "extract-invoice",
        {
          body: {
            file_id: fileId,
            storage_path: storagePath,
            file_type: fileType,
          },
        }
      );

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Extraction failed");

      return data;
    },
    onSuccess: () => {
      // Invalidate queries to refresh document and invoice lists
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

// Hook for batch extraction
export function useExtractMultipleDocuments() {
  const extractDocument = useExtractDocument();
  const queryClient = useQueryClient();

  return useMutation<void, Error, ExtractDocumentParams[]>({
    mutationFn: async (documents) => {
      // Process sequentially to avoid rate limits
      for (const doc of documents) {
        await extractDocument.mutateAsync(doc);
        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
```

### Extraction Status Component
```typescript
// src/components/documents/ExtractionStatus.tsx
import { ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon, ClockIcon } from "@heroicons/react/24/outline";

interface ExtractionStatusProps {
  status: "pending" | "processing" | "extracted" | "error";
  confidence?: number | null;
  errorMessage?: string | null;
}

const statusConfig = {
  pending: {
    icon: ClockIcon,
    label: "Pending extraction",
    color: "text-yellow-500 bg-yellow-500/10",
  },
  processing: {
    icon: ArrowPathIcon,
    label: "Extracting...",
    color: "text-blue-500 bg-blue-500/10",
    animate: true,
  },
  extracted: {
    icon: CheckCircleIcon,
    label: "Extracted",
    color: "text-green-500 bg-green-500/10",
  },
  error: {
    icon: ExclamationCircleIcon,
    label: "Extraction failed",
    color: "text-red-500 bg-red-500/10",
  },
};

export function ExtractionStatus({ status, confidence, errorMessage }: ExtractionStatusProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className={`w-3.5 h-3.5 ${config.animate ? "animate-spin" : ""}`} />
        {config.label}
      </span>
      {status === "extracted" && confidence !== null && (
        <span className="text-xs text-text-muted">
          {confidence}% confidence
        </span>
      )}
      {status === "error" && errorMessage && (
        <span className="text-xs text-red-500" title={errorMessage}>
          {errorMessage.slice(0, 30)}...
        </span>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@google/generative-ai` | `@google/genai` | Nov 2025 | Old SDK deprecated, new unified SDK is GA |
| Gemini 2.0 Flash | Gemini 3 Flash | Dec 2025 | 3x faster, 30% fewer tokens, better extraction |
| Manual JSON parsing | Structured output with Zod | 2025 | Type-safe, guaranteed schema compliance |
| Custom OCR + LLM | Native document understanding | 2025 | Single API call, better accuracy, simpler |

**Deprecated/outdated:**
- `@google/generative-ai`: Deprecated Nov 2025, use `@google/genai` instead
- Gemini 2.0 Flash: Shutting down March 31, 2026, migrate to Gemini 3 Flash

## Open Questions

Things that couldn't be fully resolved:

1. **Hebrew-specific extraction accuracy**
   - What we know: Gemini supports Hebrew, user should include language hint in prompt
   - What's unclear: Specific accuracy benchmarks for Hebrew invoices
   - Recommendation: Test with sample Hebrew invoices, add explicit "Hebrew" instruction in prompt

2. **Optimal confidence threshold for auto-approval**
   - What we know: Confidence score is self-reported by model, not guaranteed accurate
   - What's unclear: What threshold should trigger human review
   - Recommendation: Start conservative (require review for <90%), adjust based on observed accuracy

3. **Background task vs synchronous processing**
   - What we know: Edge Functions support background tasks, but add complexity
   - What's unclear: Whether typical invoice extraction exceeds timeout
   - Recommendation: Start with synchronous, add background tasks if timeouts occur

## Sources

### Primary (HIGH confidence)
- [Gemini API Structured Output](https://ai.google.dev/gemini-api/docs/structured-output) - Schema definition, Zod integration
- [Gemini API Document Processing](https://ai.google.dev/gemini-api/docs/document-processing) - PDF/image handling, best practices
- [Gemini API Models](https://ai.google.dev/gemini-api/docs/models) - Model IDs, specifications, token limits
- [Google Gen AI SDK GitHub](https://github.com/googleapis/js-genai) - Installation, TypeScript examples
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions) - Architecture, secrets, invocation

### Secondary (MEDIUM confidence)
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits) - Rate limit tiers, retry guidance
- [Supabase Storage Edge Function Example](https://github.com/supabase/supabase/blob/master/examples/edge-functions/supabase/functions/read-storage/index.ts) - File download pattern
- [Supabase Automatic Embeddings Guide](https://supabase.com/docs/guides/ai/automatic-embeddings) - Queue-based async processing pattern

### Tertiary (LOW confidence)
- WebSearch results on Gemini 3 Flash pricing ($0.50/1M input, $3/1M output) - verify with official pricing page
- WebSearch results on Hebrew OCR accuracy - no specific Gemini benchmarks found

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Google documentation, GA SDK
- Architecture: HIGH - Supabase official patterns, verified Edge Function examples
- Pitfalls: MEDIUM - Mix of official docs and community experience

**Research date:** 2026-01-28
**Valid until:** 2026-02-28 (30 days - Gemini 3 Flash is preview, may change)

## Key Implementation Notes

### Edge Function Configuration
```toml
# supabase/functions/extract-invoice/config.toml
[limits]
timeout = 120  # 2 minutes for large documents

[runtime]
deno_version = "2.1"
```

### Required Secrets
```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected
```

### Gemini 3 Flash Pricing (verify current)
- Input: $0.50 per 1M tokens
- Output: $3.00 per 1M tokens (includes thinking tokens)
- Images: ~258 tokens per page

### Rate Limits (Tier 1 paid)
- RPM: 150-300 requests per minute
- TPM: 250,000-500,000 tokens per minute
- RPD: 10,000+ requests per day
