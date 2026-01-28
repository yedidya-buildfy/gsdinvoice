---
phase: 07-ai-document-extraction
plan: 01
subsystem: api
tags: [gemini, ai, deno, edge-function, invoice-extraction, zod]

# Dependency graph
requires:
  - phase: 04-document-upload
    provides: File upload to Supabase Storage with files table metadata
provides:
  - Supabase Edge Function for Gemini-powered invoice extraction
  - Zod schema for structured invoice data extraction
  - CORS-enabled API for browser invocation
affects: [07-02, 07-03, 08-invoice-matching]

# Tech tracking
tech-stack:
  added: ["@google/genai", "zod-to-json-schema (Deno)"]
  patterns: [edge-function-structure, gemini-structured-output, agorot-conversion]

key-files:
  created:
    - supabase/functions/extract-invoice/index.ts
    - supabase/functions/extract-invoice/config.toml
  modified: []

key-decisions:
  - "Gemini 3 Flash preview model for faster extraction"
  - "Zod schema with zodToJsonSchema for type-safe structured output"
  - "120s timeout for large document processing"
  - "Convert amounts to agorot before database insertion"
  - "Hebrew language hint in extraction prompt"

patterns-established:
  - "Edge Function CORS: Allow-Origin *, authorization/apikey/content-type headers"
  - "Gemini inline data: base64 encoding with explicit MIME type"
  - "File status lifecycle: pending -> processing -> extracted | error"

# Metrics
duration: 3min
completed: 2026-01-28
---

# Phase 7 Plan 01: AI Document Extraction Summary

**Supabase Edge Function with Gemini 3 Flash for structured invoice data extraction supporting Hebrew/English documents**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-27T22:20:45Z
- **Completed:** 2026-01-27T22:24:00Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Edge Function accepts file_id, storage_path, and file_type parameters
- Downloads documents from Supabase Storage and converts to base64 for Gemini
- Extracts vendor_name, invoice_number, invoice_date, amounts, VAT, and confidence using structured output
- Stores extraction result in invoices table with file_id reference
- Updates files table status throughout processing lifecycle (pending -> processing -> extracted/error)
- Handles line items extraction and stores in invoice_rows table

## Files Created/Modified
- `supabase/functions/extract-invoice/config.toml` - Function configuration with 120s timeout and Deno 2.1 runtime
- `supabase/functions/extract-invoice/index.ts` - Main Edge Function with Gemini API integration

## Decisions Made
- **Gemini 3 Flash preview:** Using latest model for faster extraction with structured output
- **Zod + zodToJsonSchema:** Type-safe schema definition converted to JSON schema for Gemini
- **Amount conversion:** All monetary values converted from decimal to integer agorot before database storage
- **Hebrew support:** Explicit language hint in prompt for RTL document handling
- **Error resilience:** Line item insertion errors don't fail entire extraction

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None - implementation followed research patterns directly.

## User Setup Required

**External services require manual configuration:**

1. **Gemini API Key:**
   - Go to Google AI Studio -> Get API key -> Create API key
   - Run: `supabase secrets set GEMINI_API_KEY=your_key`

2. **Deploy Edge Function:**
   - Run: `supabase functions deploy extract-invoice`

## Next Phase Readiness
- Edge Function code ready for deployment
- Client hook (useDocumentExtraction) needed to invoke function from UI
- Extraction status UI component needed for user feedback
- Consider adding retry logic for rate limit handling in production

---
*Phase: 07-ai-document-extraction*
*Completed: 2026-01-28*
