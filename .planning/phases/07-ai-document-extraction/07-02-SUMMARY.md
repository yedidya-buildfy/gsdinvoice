---
phase: 07
plan: 02
subsystem: extraction
tags: [react-hooks, tanstack-query, supabase-edge-functions, typescript]
depends_on:
  requires: [07-01]
  provides: [useExtractDocument, useExtractMultipleDocuments, useInvoices, ExtractionTypes]
  affects: [07-03]
tech_stack:
  added: []
  patterns: [mutation-hooks, query-hooks, edge-function-invocation]
key_files:
  created:
    - src/lib/extraction/types.ts
    - src/hooks/useDocumentExtraction.ts
    - src/hooks/useInvoices.ts
  modified: []
decisions:
  - key: extraction-types-structure
    choice: Separate interfaces for request, result, and extraction data
    why: Clear separation of concerns between API contract and data shape
  - key: batch-processing-sequential
    choice: Sequential processing with 500ms delay between requests
    why: Avoid Gemini API rate limits, reliable batch extraction
  - key: invoices-file-relation
    choice: InvoiceWithFile type extends Invoice with file relation
    why: Display convenience for showing source document info with invoice
metrics:
  duration: 2 min
  completed: 2026-01-27
---

# Phase 7 Plan 02: Extraction Client Hooks Summary

Client-side TanStack Query hooks and TypeScript types for triggering AI extraction and fetching invoice data from the database.

## What Was Built

### Extraction Types (`src/lib/extraction/types.ts`)
- **ExtractionRequest**: Input parameters for Edge Function (fileId, storagePath, fileType)
- **ExtractionResult**: Edge Function response (success, invoice_id, confidence, error)
- **InvoiceExtraction**: Full extracted data shape matching Gemini output schema
- **LineItem**: Individual invoice line item structure
- **ExtractionStatus**: Type union for tracking UI state

### Extraction Hooks (`src/hooks/useDocumentExtraction.ts`)
- **useExtractDocument**: Single document extraction via `supabase.functions.invoke`
- **useExtractMultipleDocuments**: Batch processing with sequential execution and 500ms delay
- Both invalidate `['documents']` and `['invoices']` query keys on success

### Invoice Query Hook (`src/hooks/useInvoices.ts`)
- **useInvoices**: Fetch invoices with optional status and fileId filters
- **InvoiceWithFile**: Extended type including file relation for display
- 30s staleTime matching existing codebase patterns
- Orders by created_at descending

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 808d5b2 | feat | Create extraction types |
| e5d92de | feat | Create document extraction hooks |
| 724f733 | feat | Create invoices query hook |

## Deviations from Plan

None - plan executed exactly as written.

## Key Integration Points

1. **Edge Function Invocation**: `supabase.functions.invoke('extract-invoice', { body })` in extraction hooks
2. **Database Query**: `supabase.from('invoices').select('*, file:files(...)')` in useInvoices
3. **Query Invalidation**: Both document and invoice queries refreshed after extraction

## Patterns Established

- Mutation hooks for server actions following useFileUpload pattern
- Query hooks with optional filters following useDocuments pattern
- 500ms delay between batch API calls for rate limit protection
- Type-safe Edge Function invocation with generic response typing

## Next Phase Readiness

Ready for 07-03: Extraction UI Components
- Types available for component props
- Hooks available for triggering extraction
- Invoice data fetchable for display components
