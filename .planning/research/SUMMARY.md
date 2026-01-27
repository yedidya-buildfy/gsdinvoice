# Project Research Summary

**Project:** VAT Declaration Management Web App
**Domain:** Invoice management with AI extraction for Israeli SMB market
**Researched:** 2026-01-27
**Confidence:** HIGH

## Executive Summary

This project is a VAT-ready expense management application for Israeli SMBs and accountants. The product processes received documents (invoices, receipts, bank statements) using AI extraction and matches them to financial transactions to prepare VAT declaration data. Research reveals this domain requires production-grade precision: financial calculations must be exact, Hebrew/RTL support is mandatory, and audit trails are legally required.

The recommended approach uses a modern serverless stack: React SPA with Vite, Supabase for backend infrastructure, and Gemini 3 Flash for document AI. This combination prioritizes cost efficiency (Gemini is 3x cheaper than GPT-4 Vision), developer experience (TypeScript-first with excellent tooling), and production readiness (battle-tested libraries with active maintenance). The architecture follows a three-tier pattern: presentation (React), application layer (Supabase auth/database/storage), and AI processing (Vertex AI).

Critical risks center on financial data integrity and compliance. LLM hallucination in extraction can corrupt VAT calculations; floating-point arithmetic introduces silent rounding errors; Hebrew OCR failures mangle vendor names; and missing audit trails violate regulatory requirements. Mitigations include validation layers for all extracted data, integer-based currency storage, Gemini's native Hebrew support, and append-only audit logs for all financial changes.

## Key Findings

### Recommended Stack

The stack optimizes for a VAT/invoice management application with AI-powered document processing, team-based access, and Hebrew/RTL support. Choices prioritize production readiness, developer experience, cost efficiency, and accessibility compliance. Key decision: Vite + React SPA (not Next.js) because Supabase handles all backend concerns, eliminating the need for server-side features.

**Core technologies:**
- **Vite + React 19 + TypeScript 5.8**: Build tool with instant HMR, React 19 required by Untitled UI, TS strict mode for Zod integration
- **Untitled UI React**: 5,000+ components, MIT licensed, React Aria foundation for accessibility, native dark mode, green accent customization
- **Supabase**: BaaS providing auth with team/org support, PostgreSQL 15+ with RLS, file storage for documents, real-time subscriptions
- **Gemini 3 Flash (Preview)**: $0.50/1M input tokens, 90% cost reduction with context caching, 1M token context window, Hebrew support
- **TanStack Query + Zustand**: Server state management (eliminates 80% of Redux boilerplate) + lightweight client state
- **React Hook Form + Zod**: Minimal re-renders, TypeScript-first schema validation with `z.infer<>` type generation
- **SheetJS (xlsx)**: Excel/CSV parsing for Israeli bank statement imports, 2.6M weekly downloads, built-in TypeScript types

**Critical version requirements:**
- React 19.1+ (Untitled UI dependency)
- TypeScript 5.8+ (Untitled UI requirement)
- Tailwind CSS 4.1+ (logical properties for RTL via `ms-*`/`me-*`)
- PostgreSQL 15+ (RLS security features)

**Alternatives rejected:**
- Next.js: Overkill for SPA; server-side features not needed with Supabase backend
- shadcn/ui: Fewer components (50 vs 5,000), Untitled UI has better dark mode and accessibility
- Redux Toolkit: Modern apps separate server state (TanStack Query) from client state (Zustand)
- GPT-4 Vision: Gemini 3 Flash is 3x faster, significantly cheaper, comparable quality
- moment.js: NEVER use; deprecated, massive bundle, mutable

### Expected Features

Israeli VAT declaration and invoice management for SMBs requires document processing automation while maintaining accountant handoff workflows. The market positioning is "VAT-ready expense management" — handling documents businesses RECEIVE (invoices, receipts, statements), not invoice creation (Green Invoice/iCount territory).

**Must have (table stakes):**
- Document upload (PDF/images) with drag-drop and mobile camera capture
- Hebrew OCR and text extraction with 90%+ accuracy (mixed Hebrew/English/niqqud)
- AI invoice data extraction (vendor, date, amount, VAT, line items) without templates
- Bank statement import for Israeli banks (Leumi, Hapoalim, Discount, Mizrahi) with CSV/Excel parsing
- Credit card statement import (separate from bank accounts)
- Transaction and invoice list views with sort/filter by date/amount/status
- Basic VAT calculation (18% Israeli rate) with date range selection
- Duplicate detection (exact match on invoice number + vendor + date + amount)
- Manual data correction UI for fixing OCR errors
- Export to accountant (CSV/Excel/PDF) in expected formats
- User authentication and 7-year data backup/export (compliance requirement)

**Should have (competitive differentiators):**
- AI-powered auto-matching between invoices and transactions (the "magic" feature)
- Fuzzy duplicate detection for near-matches ("INV-1001" vs "INV1001", slight amount variations)
- Row-level duplicate review UI for user confirmation/dismissal
- Israeli Tax Authority integration for allocation number (mispar haktzaa) validation
- Smart categorization of expenses (office, travel, professional services)
- Multi-document batch upload (50+ documents, background processing)
- Dashboard with VAT projections and spending trends
- Accountant portal for multi-client view (B2B upsell opportunity)

**Defer (v2+):**
- Mobile app (responsive web first)
- Real-time bank sync (manual upload adequate for MVP)
- WhatsApp integration for receipt forwarding
- Approval workflows (single-user first)
- Historical trend analysis (requires 6+ months of data accumulation)

**Anti-features (explicitly avoid):**
- Full accounting system (Green Invoice, Hashavshevet exist; focus on VAT preparation handoff)
- Payment processing (regulatory complexity, not core to VAT problem)
- Recurring invoice generation (invoicing software territory; stay on expense/receipt side)
- Complex multi-currency (Israeli VAT is in ILS; simple USD/EUR display only)
- Enterprise RBAC (SMB market doesn't need initially)
- Full tax return preparation (licensed accountant territory; prepare data FOR accountants)

### Architecture Approach

Three-tier architecture optimized for document processing workflows: presentation layer (React SPA), application layer (Supabase), and AI processing layer (Vertex AI). The design separates concerns cleanly: React handles UI/state/upload orchestration, Supabase provides auth/database/storage/serverless compute, and Vertex AI handles document understanding and field extraction.

**Major components:**

1. **Document Upload & Storage**: Direct-to-storage pattern with signed URLs. Client uploads directly to Supabase Storage (bypasses server bottleneck), time-limited URLs provide security, supports resumable uploads via TUS protocol. Routing: PDFs/images to Vertex AI Document Understanding, Excel/CSV to Edge Function parser.

2. **Processing Queue**: Database-backed job queue with polling. Documents table acts as queue with status progression (pending → processing → extracted → failed). Simpler than message queue infrastructure, adequate for <10k documents/day, built-in audit trail. Polling preferred over webhooks to control throughput and avoid rate limit spikes.

3. **AI Document Extraction**: Vertex AI Gemini 3 Flash with structured output. Native PDF understanding (no OCR pre-processing), multimodal for images/scanned docs, 1M token context for multi-page documents, JSON schema enforcement, Hebrew text support. Single API call replaces traditional OCR + parsing pipeline, 50% cheaper with batch processing.

4. **Statement Parsing**: Edge Function with streaming parser for deterministic bank statement parsing. Israeli banks have predictable columnar structure (no AI needed). Handles encoding variations (UTF-8, Windows-1255 for Hebrew), date formats (DD/MM/YYYY Israeli format), amount normalization (commas, negatives). Includes duplicate detection via transaction hash.

5. **Matching Engine**: Multi-stage matching with confidence scoring. Stage 1: exact match (same amount + date). Stage 2: fuzzy date (same amount, within 7 days). Stage 3: fuzzy amount (within 2%, similar date). Stage 4: AI semantic match via Gemini. Confidence levels: HIGH (>0.9, auto-match), MEDIUM (0.7-0.9, review), LOW (<0.7, no match).

6. **React SPA**: Feature-based organization with TanStack Query. Separates server state (TanStack Query for Supabase data) from client state (Zustand for UI state). Upload progress tracked outside TQ as local state. Optimistic UI updates for match confirmation and deletions.

**Data flow:**
```
User Upload → File Validation → Supabase Storage (signed URL)
  → PostgreSQL (document record, status='pending')
  → Edge Function (poll pending documents)
  → Vertex AI (Gemini 3 Flash extraction)
  → PostgreSQL (store extracted_data JSONB, status='extracted')
  → Matching Engine (compare against transactions)
  → PostgreSQL (create match records with confidence)
  → React (display matches for review)
```

**Security pattern:** Supabase Row Level Security at database layer. Simple RLS for single-team: all authenticated users can access all data. If multi-tenant added later, change to tenant-based policies. Critical: enable RLS on every table, never use service_role keys client-side, use custom JWT claims for tenant_id, test policies by authenticating as different users.

### Critical Pitfalls

Research identified 13 domain-specific pitfalls across critical, moderate, and minor severity. Top 5 requiring immediate attention:

1. **LLM Hallucination in Financial Data Extraction** — Gemini can extract plausible but incorrect values. On FinanceBench benchmark, GPT-4 Turbo with retrieval failed or hallucinated on 81% of financial questions. Prevention: validation layer comparing extracted totals to calculated sums, structured output with JSON schema, cross-validate critical fields with secondary extraction pass, confidence scoring that flags low-certainty extractions. Never store extracted data without human review flag for financial amounts.

2. **Floating-Point Currency Calculation Errors** — JavaScript floats cause silent rounding errors (`0.1 + 0.2 = 0.30000000000000004`). EU MiFID II fines reached millions for rounding discrepancies. Prevention: store all currency as integers in smallest unit (agorot/cents), use PostgreSQL `NUMERIC`/`DECIMAL` (never `FLOAT`), use `dinero.js` or `decimal.js` for frontend calculations, apply rounding only at display/output.

3. **Hebrew/RTL Text Extraction Failures** — OCR/LLM extraction mangles Hebrew text (reversed character order, lost niqqud, mixed LTR/RTL). Most OCR engines optimize for Latin scripts; Hebrew is bidirectional with RTL text and LTR numbers. Prevention: use Gemini's multimodal capabilities (handles Hebrew better than traditional OCR), validate with Hebrew test documents before production, implement bidirectional text normalization before storage, store original document alongside extracted text.

4. **Supabase RLS Security Holes** — Row Level Security policies fail to isolate team data. One team can access another team's financial data. Common errors: forgetting to enable RLS, using `USING (true)`, confusing `auth.uid()` with `tenant_id`. Prevention: enable RLS on every table immediately after creation, never use service_role keys in client code, use custom JWT claims for tenant_id, create views with `security_invoker = true`, test policies by authenticating as different users.

5. **Missing Audit Trail for VAT Compliance** — System lacks complete history of changes to financial data. Tax authorities request documentation of how VAT figures were calculated; team cannot provide evidence. Prevention: implement append-only audit log for all financial data changes, record who/when/what/why for all changes, use database triggers or middleware to ensure logging, never allow direct UPDATE on financial records (use status transitions), store change reason/justification for all corrections.

**Additional moderate pitfalls:**
- Duplicate detection false positives overwhelming users (>20% dismissed alerts = alert fatigue)
- Large file upload memory exhaustion (chunked uploads via TUS protocol required)
- Israeli bank statement format fragility (LLM-based parsing for format flexibility)
- Vertex AI rate limiting and quota exhaustion (exponential backoff, batch API for 50% cost reduction)
- Fuzzy matching algorithm complexity explosion (pre-filter by date/amount, use `pg_trgm` for fuzzy text)

## Implications for Roadmap

Based on component dependencies and risk analysis, suggested phase structure:

### Phase 1: Foundation & Authentication
**Rationale:** Security and data isolation must be established before any financial data is stored. RLS policies prevent critical security pitfall #4.

**Delivers:**
- Supabase project setup with PostgreSQL 15+
- Authentication with team/org support
- Database schema with migrations (including audit tables)
- RLS policies on all tables
- Basic React shell with routing

**Addresses pitfalls:**
- Supabase RLS security holes (enable RLS before data creation)
- Missing audit trail (design audit schema upfront)
- Currency precision (establish NUMERIC types, integer storage convention)

**Research flag:** Standard patterns, skip phase research. Official Supabase docs sufficient.

### Phase 2: Document Upload & Storage
**Rationale:** Input mechanism required before processing pipeline. Establishes direct-to-storage pattern that prevents memory exhaustion pitfall.

**Delivers:**
- Supabase Storage buckets configuration
- Signed URL upload flow
- Upload UI with progress tracking
- Document list view
- File type validation (magic bytes, not just extension)

**Addresses pitfalls:**
- Large file upload memory exhaustion (chunked uploads from day one)
- File type validation bypass (magic bytes checking)

**Uses stack:** Supabase Storage, React FilePond (optional), TanStack Query for document list

**Research flag:** Standard patterns, skip phase research. Well-documented upload patterns.

### Phase 3: Bank Statement Parsing
**Rationale:** Provides transaction data foundation before implementing AI extraction (which is more complex). Deterministic parsing with clear validation.

**Delivers:**
- Excel/CSV parser Edge Function
- Bank statement import for Israeli banks (Leumi, Hapoalim, Discount, Mizrahi)
- Credit card statement import
- Transaction list view with filters
- Duplicate detection via hash

**Addresses pitfalls:**
- Israeli bank statement format fragility (flexible parser from start)
- Timezone handling (establish UTC storage, local display convention)
- Duplicate detection (hash-based prevention)

**Uses stack:** SheetJS for parsing, Edge Functions for processing, PostgreSQL for storage

**Research flag:** NEEDS PHASE RESEARCH. Israeli bank-specific formats require validation against actual exports. Format detection logic needs investigation.

### Phase 4: AI Document Extraction
**Rationale:** Core value proposition, but requires queue infrastructure and validation layer. Most complex component with highest risk (LLM hallucination).

**Delivers:**
- Vertex AI Gemini 3 Flash integration
- Processing queue with Edge Function polling
- Structured extraction prompts with JSON schema
- Validation layer for extracted amounts
- Extraction preview UI with confidence scores
- Status polling/realtime updates

**Addresses pitfalls:**
- LLM hallucination (validation layer, structured output, confidence scoring)
- Hebrew/RTL extraction failures (Gemini's Hebrew support, test suite)
- Vertex AI rate limiting (exponential backoff, queue controls)
- OCR table structure loss (request structured output)

**Uses stack:** @google/genai SDK, Gemini 3 Flash, Supabase Edge Functions, database queue

**Research flag:** NEEDS PHASE RESEARCH. Gemini prompt engineering for invoice extraction requires experimentation. Validation layer design needs domain expertise. Hebrew extraction quality needs testing.

### Phase 5: Matching Engine
**Rationale:** Depends on both invoices (Phase 4) and transactions (Phase 3) being available. Multi-stage algorithm with performance considerations.

**Delivers:**
- Multi-stage matching algorithm (exact → fuzzy date → fuzzy amount → AI semantic)
- Credit card charge linking to bank transactions
- Confidence scoring (HIGH/MEDIUM/LOW)
- Match review UI with side-by-side comparison
- Settings for matching trigger timing (automatic/manual)

**Addresses pitfalls:**
- Fuzzy matching complexity explosion (pre-filtering, indexing strategy)
- Duplicate detection false positives (confidence scoring, user feedback loop)
- Database performance (query optimization, indexing)

**Uses stack:** PostgreSQL with `pg_trgm` extension, Gemini for semantic matching, TanStack Query

**Research flag:** NEEDS PHASE RESEARCH. Fuzzy matching threshold tuning is domain-specific. Israeli vendor name matching (Hebrew fuzzy logic) needs investigation. Credit card charge linking patterns require validation.

### Phase 6: VAT Calculation & Export
**Rationale:** Culmination of all previous phases. Produces accountant-ready output.

**Delivers:**
- Date range selection (monthly/bi-monthly per Israeli tax requirements)
- VAT calculation (18% Israeli rate) with precision handling
- Summary report with matched/unmatched breakdowns
- Export to CSV/Excel/PDF formats
- Manual correction UI with audit logging

**Addresses pitfalls:**
- Floating-point currency errors (integer-based calculations)
- Missing audit trail (log all corrections)
- Compliance requirements (7-year retention, export capability)

**Uses stack:** date-fns for date handling, SheetJS for export, audit tables

**Research flag:** Standard patterns, skip phase research. VAT calculation straightforward with integer arithmetic.

### Phase 7: Dashboard & Polish
**Rationale:** Enhancement layer after core workflows proven. Adds proactive insights.

**Delivers:**
- Dashboard with summary widgets
- Unmatched invoices/transactions warnings
- Recent activity feed
- Error state handling and user feedback
- Hebrew/RTL polish across entire UI

**Addresses pitfalls:**
- User experience (clear error messages, helpful states)
- RTL layout issues (Tailwind logical properties)

**Uses stack:** Untitled UI components, Heroicons, react-i18next

**Research flag:** Standard patterns, skip phase research. UI polish is iterative.

### Phase Ordering Rationale

**Dependency chain:** Phase 1 (foundation) → Phase 2 (upload) → [Phase 3 (parsing) || Phase 4 (extraction)] → Phase 5 (matching) → Phase 6 (VAT output) → Phase 7 (polish)

**Parallel opportunities:** Phase 3 and 4 can run in parallel after Phase 2 completes, as they operate on different input types (structured bank statements vs unstructured documents).

**Risk mitigation:** Phase order front-loads security (RLS policies before data) and defers highest-risk component (AI extraction) until after simpler parsing is validated. Matching engine comes after both data sources exist, avoiding premature optimization.

**Complexity graduation:** Moves from simple (auth, upload) → moderate (parsing, extraction) → complex (matching) → straightforward (calculation) → polish (UI).

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 3 (Bank Statement Parsing):** Israeli bank-specific CSV/Excel formats require validation against actual exports from Leumi, Hapoalim, Discount, Mizrahi. Column mapping, encoding detection (UTF-8 vs Windows-1255), date format parsing need investigation.
- **Phase 4 (AI Document Extraction):** Gemini prompt engineering for invoice field extraction requires experimentation with real invoices. Validation layer design needs financial domain expertise. Hebrew text quality testing essential before production.
- **Phase 5 (Matching Engine):** Fuzzy matching threshold tuning (85-90% similarity for vendor names) is domain-specific. Hebrew fuzzy matching algorithms need investigation. Credit card charge linking to bank transactions requires pattern validation.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Supabase authentication and RLS are well-documented with official guides.
- **Phase 2 (Upload):** File upload patterns extensively documented; chunked uploads standard practice.
- **Phase 6 (VAT Calculation):** Financial calculations with integer arithmetic are established patterns.
- **Phase 7 (Dashboard):** UI composition with component library is standard React development.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified with official documentation: Vite, Supabase, Gemini 3 Flash, React 19, TanStack Query all have current docs. Untitled UI requirements validated from official website. Version numbers verified from NPM and official releases. |
| Features | MEDIUM-HIGH | Table stakes validated against 10+ invoice management and VAT software comparisons. Israeli market specifics (allocation numbers, 18% VAT) verified from government and KPMG sources. Feature complexity estimates based on industry benchmarks. Anti-features informed by scope creep patterns in domain. |
| Architecture | HIGH | Pattern recommendations sourced from official docs (Supabase, Vertex AI), verified with production case studies (Midday reconciliation engine). Component boundaries and data flow validated against similar document processing systems. Database queue pattern proven in multiple implementations. |
| Pitfalls | HIGH | Critical pitfalls sourced from production incident reports: LLM hallucination from FinanceBench study, floating-point errors from Modern Treasury/MiFID II cases, Hebrew OCR challenges from specialized vendors, RLS security holes from Supabase community. Warning signs and prevention strategies verified across multiple sources. |

**Overall confidence:** HIGH

Research quality benefits from:
- Official documentation for all core technologies (Vite, Supabase, Vertex AI, React)
- Domain-specific sources for Israeli VAT requirements (KPMG, government sites)
- Production case studies for architecture patterns (Midday, Klippa)
- Incident reports and postmortems for pitfall identification
- Multiple source verification for controversial claims (LLM reliability, security patterns)

### Gaps to Address

Areas requiring validation during implementation:

**Israeli bank format variations:** Research identified major banks (Leumi, Hapoalim, Discount, Mizrahi) but actual CSV/Excel exports need validation. Format detection logic requires testing with real statements. **Handle during Phase 3 planning:** Request sample exports from each bank, build test suite before parser implementation.

**Gemini Hebrew extraction quality:** While Gemini officially supports Hebrew, extraction quality for dense financial documents with mixed Hebrew/English/numbers needs validation. Niqqud handling unclear. **Handle during Phase 4 planning:** Test with representative Israeli invoices, establish quality benchmarks, consider specialized Hebrew OCR as fallback.

**Israeli Tax Authority API availability:** Allocation number (mispar haktzaa) validation requires government API integration. API availability, authentication requirements, and rate limits unknown. **Handle during Phase 7 or defer:** Contact tax authority for API documentation, assess integration complexity, potentially defer to post-MVP.

**Real-time bank sync complexity:** Israeli Open Banking integration mentioned (Green Invoice has level 2 license) but implementation complexity unclear. **Defer to post-MVP:** Manual upload adequate for MVP, investigate real-time sync as enhancement.

**Credit card charge linking patterns:** Bank statements show "ישראכרט" entries representing credit card charges, but exact matching logic to individual card transactions needs validation. **Handle during Phase 5 planning:** Analyze real bank and credit card statements to identify linking patterns, design algorithm with domain expert input.

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- [Vite Getting Started](https://vite.dev/guide/) — Build tool setup and configuration
- [Supabase React Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs) — Authentication, database, storage integration
- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) — Security policies and multi-tenancy
- [Supabase Edge Functions Architecture](https://supabase.com/docs/guides/functions/architecture) — Serverless compute patterns
- [Vertex AI Document Understanding](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/document-understanding) — Gemini 3 Flash capabilities
- [Google Gen AI SDK](https://github.com/googleapis/js-genai) — Official JavaScript client
- [Gemini 3 Flash Documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash) — Pricing, context window, structured output
- [React Router v7](https://reactrouter.com/) — Routing with Remix features
- [TanStack Query Documentation](https://tanstack.com/query/latest) — Server state management patterns
- [React Hook Form](https://react-hook-form.com/) — Form management
- [Zod](https://zod.dev/) — Schema validation
- [SheetJS Documentation](https://docs.sheetjs.com/) — Excel/CSV parsing
- [Untitled UI React](https://www.untitledui.com/react) — Component library and requirements

**Regulatory Sources:**
- [EDICOM - E-Invoicing in Israel](https://edicomgroup.com/electronic-invoicing/israel) — CTC model, allocation numbers
- [Sovos - Israel CTC Reforms](https://sovos.com/vat/tax-rules/e-invoicing-israel/) — Compliance timeline
- [KPMG - Israel E-Invoicing Expansion](https://kpmg.com/us/en/taxnewsflash/news/2025/12/tnf-israel-expansion-of-mandatory-e-invoicing-model.html) — 2026 requirements

### Secondary (MEDIUM confidence)

**Architecture Patterns:**
- [Midday Automatic Reconciliation Engine](https://midday.ai/updates/automatic-reconciliation-engine/) — Production matching implementation
- [Fuzzy Matching in Bank Reconciliation](https://optimus.tech/blog/fuzzy-matching-algorithms-in-bank-reconciliation-when-exact-match-fails) — Threshold recommendations
- [AI Transaction Matching](https://www.solvexia.com/blog/transaction-matching-using-ai) — ML-based approaches
- [Multi-Tenant RLS in Supabase](https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2) — Security patterns
- [Background Jobs with Supabase](https://www.jigz.dev/blogs/how-i-solved-background-jobs-using-supabase-tables-and-edge-functions) — Queue implementation

**Invoice Management:**
- [Klippa - Invoice Management Software 2026](https://www.klippa.com/en/blog/information/invoice-management-software/) — Feature landscape
- [Klippa - AI OCR for Invoices](https://www.klippa.com/en/blog/information/best-ai-ocr-tools-for-invoices/) — Extraction benchmarks
- [Unstract - AI Invoice Processing](https://unstract.com/blog/ai-invoice-processing-and-data-extraction/) — LLM capabilities
- [Klippa - Duplicate Invoice Detection](https://www.klippa.com/en/blog/information/how-to-detect-duplicate-invoices/) — Detection strategies
- [Xelix AI Duplicate Prevention](https://xelix.com/ai-for-world-leading-duplicate-invoice-prevention-software) — ML-based approach

**Pitfall Sources:**
- [LLM Hallucinations in Financial Institutions](https://biztechmagazine.com/article/2025/08/llm-hallucinations-what-are-implications-financial-institutions) — FinanceBench study
- [Reducing Hallucination in Financial Reports](https://arxiv.org/html/2310.10760) — Validation techniques
- [Modern Treasury - Floats Don't Work](https://www.moderntreasury.com/journal/floats-dont-work-for-storing-cents) — Currency precision
- [JavaScript Rounding Errors](https://www.robinwieruch.de/javascript-rounding-errors/) — Float pitfalls
- [Hebrew Text Recognition Challenges](https://medium.com/@2UPLAB/creating-a-plugin-for-hebrew-text-recognition-our-experience-and-solutions-97973d13eeae) — RTL OCR
- [VAT Reconciliation Requirements](https://safebooks.ai/resources/financial-data-governance/vat-reconciliation/) — Audit trails
- [Financial Audit Trail Compliance](https://yokoy.io/blog/financial-audit-trail/) — Logging requirements

### Tertiary (LOW confidence)

**Requires Validation:**
- Israeli bank statement specific formats (needs validation against actual exports from Leumi, Hapoalim, Discount, Mizrahi)
- Vertex AI batch pricing claims (verify current pricing; subject to change)
- Israeli Open Banking API availability (mentioned Green Invoice has level 2 license; needs investigation)
- Credit card charge linking patterns (ישראכרט entries in bank statements; requires pattern analysis)

---
*Research completed: 2026-01-27*
*Ready for roadmap: yes*
