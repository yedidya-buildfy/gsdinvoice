# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-27)

**Core value:** Automatically connect invoices and receipts to bank/credit card transactions, eliminating manual matching for VAT reporting.
**Current focus:** Phase 7 - AI Document Extraction

## Current Position

Phase: 7 of 13 (AI Document Extraction)
Plan: 2 of 3 in current phase - COMPLETE
Status: In progress
Last activity: 2026-01-28 - Completed 07-02-PLAN.md (Extraction client hooks)

Progress: [████████░░] ~59%

## Performance Metrics

**Velocity:**
- Total plans completed: 17
- Average duration: 2.4 min
- Total execution time: 0.68 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 9 min | 3 min |
| 02-authentication | 2 | 7 min | 3.5 min |
| 03-navigation-ui-shell | 2 | 3 min | 1.5 min |
| 04-document-upload | 2 | 5 min | 2.5 min |
| 05-bank-statement-import | 3 | 7 min | 2.3 min |
| 06-credit-card-import-linking | 3 | 10 min | 3.3 min |
| 07-ai-document-extraction | 2 | 5 min | 2.5 min |

**Recent Trend:**
- Last 5 plans: 06-02 (4 min), 06-03 (4 min), 07-01 (3 min), 07-02 (2 min)
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- React 19 with strict mode for latest features
- Tailwind CSS v4 with CSS-based @theme configuration (not tailwind.config.js)
- Path aliases using @/* pattern for clean imports
- TanStack Query with 30s staleTime for balanced caching
- Zustand persist middleware with partialize for selective localStorage
- Database types include Row, Insert, and Update variants
- Custom trigger-based audit logging (supa_audit extension not available on this Supabase instance)
- Team-shared RLS policies (all authenticated users can read/write all data)
- Local scope signOut for single-device logout (02-01)
- useAuth hook throws if used outside AuthProvider (02-01)
- ProtectedRoute uses Outlet pattern for nested protected routes (02-02)
- Session-reactive navigation via useEffect watching user state (02-02)
- Location state preserves intended destination for post-login redirect (02-02)
- Signup form includes name field and password confirmation (02-02)
- FOUC prevention inline script reads Zustand persist format (03-01)
- RTL-ready from start using logical CSS properties (03-01)
- Layout components in src/components/layout/ (03-01)
- AppShell wraps all protected routes at route level (03-02)
- Dashboard uses index route only, no duplicate "/" path (03-02)
- Logout button in sidebar with red hover effect (03-02)
- Sequential uploads to avoid overwhelming server (04-01)
- Validate file types on add, not just on upload (04-01)
- Store file metadata in files table after Storage upload (04-01)
- Hooks folder at src/hooks/ for custom hooks (04-01)
- Upload components at src/components/upload/ (04-01)
- DocumentWithUrl type adds URL to File for display convenience (04-02)
- Intl.DateTimeFormat for locale-aware date formatting (04-02)
- Document components in src/components/documents/ (04-02)
- Grid responsive: 2 cols mobile, up to 5 cols desktop (04-02)
- Store amounts as integer agorot to avoid floating-point issues (05-01)
- Scan first 15 rows for header detection in bank files (05-01)
- Normalize headers by removing \r\n, ₪, whitespace (05-01)
- Excel serial dates (days since 1899-12-30) for real bank files (05-01)
- Hash-based duplicate detection using btoa encoding (05-02)
- Sequential transaction insertion with continue-on-error (05-02)
- No source_file_id for bank imports (not stored in Storage) (05-02)
- Bank import hooks follow upload hook pattern with status tracking (05-02)
- Client-side filtering and sorting for transaction display (05-03)
- RTL table layout with right-aligned columns for Hebrew (05-03)
- Green for income, red for expense color coding (05-03)
- Bank components in src/components/bank/ (05-03)
- Credit card hash prefix 'cc|' to distinguish from bank hashes (06-01)
- Auto-create credit_cards entries on first upload per card (06-01)
- Store foreign currency amounts without conversion (06-01)
- Map billingDate to value_date field for credit cards (06-01)
- Israeli CC keyword detection in bank descriptions (כרטיס, ויזא, ישראכרט) (06-02)
- Card last four extraction from bank charge descriptions (06-02)
- Auto-flag is_credit_card_charge=true on bank import (06-02)
- Amount tolerance matching (2%) for fuzzy linking (06-02)
- Date window matching (±2 days) for billing alignment (06-02)
- RTL CreditCardTable with Hebrew headers and linked status icons (06-02)
- Credit card components in src/components/creditcard/ (06-03)
- Reuse TransactionFilters for credit card page filtering (06-03)
- Card selector above transactions header for primary categorization (06-03)
- Re-link button always visible for manual linking retry (06-03)
- Credit card table shows both transaction date and billing date (06-03)
- Gemini 3 Flash preview model for structured invoice extraction (07-01)
- Zod schema with zodToJsonSchema for type-safe Gemini output (07-01)
- 120s timeout for Edge Function large document processing (07-01)
- Hebrew language hint in Gemini extraction prompt (07-01)
- Edge Function CORS: Allow-Origin *, authorization/apikey/content-type headers (07-01)
- Separate interfaces for ExtractionRequest, ExtractionResult, InvoiceExtraction (07-02)
- Sequential batch processing with 500ms delay for rate limit protection (07-02)
- InvoiceWithFile type extends Invoice with file relation for display (07-02)

### Pending Todos

1. **Fix spreadsheet viewer RTL display issues** (ui) - Replace custom SpreadsheetPreview with proper viewer library for mixed Hebrew/English content

### Roadmap Evolution

- Phase 13 added: VAT Fields for Bank Transactions - VAT boolean, percentage, and amount columns with merchant settings modal

### Blockers/Concerns

- Supabase Storage bucket 'documents' must be created manually in dashboard

## Session Continuity

Last session: 2026-01-28 00:22 UTC
Stopped at: Completed 07-02-PLAN.md (Extraction client hooks)
Resume file: None

---
*Next step: Continue Phase 7 with 07-03-PLAN.md (Extraction UI components)*
