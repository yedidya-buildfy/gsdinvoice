# Domain Pitfalls

**Domain:** VAT Declaration Management / Invoice-Bank Transaction Matching
**Stack:** React + Supabase + Vertex AI (Gemini)
**Researched:** 2026-01-27

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or regulatory/compliance failures.

---

### Pitfall 1: LLM Hallucination in Financial Data Extraction

**What goes wrong:** Gemini/LLMs extract plausible but incorrect values from invoices - wrong amounts, invented dates, or fabricated vendor details. On the FinanceBench benchmark, GPT-4 Turbo with retrieval failed or hallucinated on 81% of financial questions.

**Why it happens:** LLMs confabulate answers when context is insufficient. They may misread numerics (mixing units, missing negative signs) or invent facts not present in documents. Financial documents with dense tables and multiple similar values are particularly vulnerable.

**Consequences:**
- Incorrect VAT calculations leading to compliance issues
- Wrong transaction matches causing reconciliation failures
- Audit trail contaminated with bad data
- User trust destroyed when errors surface during tax filing

**Warning signs:**
- Extracted amounts don't sum to invoice totals
- Dates extracted fall outside reasonable ranges
- Vendor names slightly differ from known vendors
- Confidence scores (if available) are inconsistent

**Prevention:**
- Implement validation layer comparing extracted totals to calculated sums
- Use structured output (JSON schema) to constrain extraction format
- Cross-validate critical fields with secondary extraction pass ("LLMChallenge" pattern)
- Never store extracted data without human review flag for financial amounts
- Build confidence scoring that flags low-certainty extractions

**Detection:** Compare sum of line items to stated total; validate dates against document metadata; fuzzy-match vendor names against known list.

**Phase mapping:** Document extraction phase must include validation layer; never deploy extraction without verification pipeline.

**Sources:** [LLM Hallucinations in Financial Institutions](https://biztechmagazine.com/article/2025/08/llm-hallucinations-what-are-implications-financial-institutions), [Reducing hallucination in financial reports](https://arxiv.org/html/2310.10760)

---

### Pitfall 2: Floating-Point Currency Calculation Errors

**What goes wrong:** Using JavaScript floats or database floats for currency causes silent rounding errors. `0.1 + 0.2 = 0.30000000000000004`. Over thousands of transactions, pennies become significant discrepancies.

**Why it happens:** IEEE 754 binary floating-point cannot precisely represent base-10 decimals. Developers use native number types without considering financial precision requirements.

**Consequences:**
- VAT totals don't match invoice sums
- Reconciliation failures due to penny differences
- Audit findings for calculation discrepancies
- EU MiFID II compliance violations (banks fined millions for rounding discrepancies)

**Warning signs:**
- Transaction totals show extra decimal places
- Matched invoices/transactions differ by fractions of currency unit
- Sum of parts doesn't equal whole

**Prevention:**
- Store all currency as integers in smallest unit (agorot/cents): `$12.34` = `1234`
- Use PostgreSQL `NUMERIC`/`DECIMAL` type, never `FLOAT` or `DOUBLE`
- Use libraries like `dinero.js` or `decimal.js` for frontend calculations
- Apply rounding only at display/output, never during intermediate calculations
- Establish consistent rounding rules across entire system

**Detection:** Unit tests that verify `sum(line_items) === invoice_total` for known test cases with many decimal operations.

**Phase mapping:** Database schema design phase; establish currency handling pattern before any financial logic.

**Sources:** [JavaScript Rounding Errors](https://www.robinwieruch.de/javascript-rounding-errors/), [Modern Treasury: Floats Don't Work for Cents](https://www.moderntreasury.com/journal/floats-dont-work-for-storing-cents)

---

### Pitfall 3: Hebrew/RTL Text Extraction Failures

**What goes wrong:** OCR/LLM extraction mangles Hebrew text - reversed character order, lost diacritics (niqqud), mixed LTR/RTL in same field (numbers within Hebrew text). Israeli bank statements combine Hebrew vendor names with English and numbers.

**Why it happens:** Most OCR engines optimize for Latin scripts. Hebrew is bidirectional (RTL text with LTR numbers). Popular frameworks like EasyOCR and PaddleOCR lack Hebrew models. Diacritical marks (niqqud) are often dropped or misread.

**Consequences:**
- Vendor names unreadable or incorrect
- Transaction descriptions garbled
- Matching algorithms fail on Hebrew text
- Users cannot verify extracted data

**Warning signs:**
- Hebrew characters appear reversed or jumbled
- Numbers appear at wrong position relative to Hebrew text
- Vendor names extracted as question marks or boxes
- Inconsistent extraction quality between Hebrew and English fields

**Prevention:**
- Use Gemini's multimodal capabilities which handle Hebrew better than traditional OCR
- Validate Hebrew text extraction with known test documents before production
- Implement bidirectional text normalization before storage
- Store original document alongside extracted text for human verification
- Consider specialized Hebrew OCR (Kraken, Calamari) as fallback

**Detection:** Test suite with Hebrew-heavy bank statements; automated check for character encoding issues; user feedback loop on extraction quality.

**Phase mapping:** OCR/extraction phase must include Hebrew-specific test cases; do not consider extraction "complete" without RTL validation.

**Sources:** [Creating a Plugin for Hebrew Text Recognition](https://medium.com/@2UPLAB/creating-a-plugin-for-hebrew-text-recognition-our-experience-and-solutions-97973d13eeae), [OCR for Arabic & Cyrillic Scripts](https://medium.com/@API4AI/ocr-for-arabic-cyrillic-scripts-multilingual-tactics-92edc1002d34)

---

### Pitfall 4: Supabase RLS Security Holes in Multi-Tenant Context

**What goes wrong:** Row Level Security policies fail to isolate team data properly. One team can access another team's invoices/transactions. Common errors: forgetting to enable RLS, using `USING (true)`, confusing `auth.uid()` with `tenant_id`.

**Why it happens:** RLS is disabled by default. Views bypass RLS by default (Postgres security definer). Policies using `user_metadata` can be modified by end users. Complex tenant hierarchies (user -> team -> organization) require careful policy design.

**Consequences:**
- Data breach: Team A sees Team B's financial data
- Compliance violation (financial data exposure)
- Complete system compromise if service key exposed client-side
- Legal liability for data protection failures

**Warning signs:**
- Users report seeing unfamiliar data
- Queries return more rows than expected
- No RLS policies defined on sensitive tables
- Service role key present in client-side code

**Prevention:**
- Enable RLS on every table containing user/team data immediately after creation
- Never use service_role keys in client code
- Use custom JWT claims for tenant_id (not user_metadata which users can modify)
- Create views with `security_invoker = true` (Postgres 15+)
- Test RLS policies by authenticating as different users and verifying data isolation
- Index columns used in RLS policies for performance

**Detection:** Automated tests that authenticate as User A and attempt to access User B's data; security audit checklist before each deployment.

**Phase mapping:** Authentication/authorization phase; RLS policies must be defined and tested before any data is stored.

**Sources:** [Supabase RLS Deep Dive](https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2), [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)

---

### Pitfall 5: Missing Audit Trail for VAT Compliance

**What goes wrong:** System lacks complete history of changes to financial data. Tax authorities request documentation of how VAT figures were calculated; team cannot provide evidence. Manual corrections overwrite original data.

**Why it happens:** Developers update records in place without versioning. Audit requirements not considered until tax filing time. "Soft delete" implemented but not full change history.

**Consequences:**
- VAT audit failures
- Inability to trace discrepancies
- Legal exposure for inadequate record-keeping
- Cannot prove data integrity to auditors

**Warning signs:**
- No `created_at`/`updated_at` columns on financial tables
- No history/audit table for invoices/transactions
- Manual corrections possible without logging who/when/why
- Cannot answer "what was this invoice's VAT amount last Tuesday?"

**Prevention:**
- Implement append-only audit log for all financial data changes
- Record: who changed, when, what changed (before/after values), why (change reason)
- Use database triggers or application middleware to ensure all changes logged
- Never allow direct UPDATE on financial records; use status transitions
- Store change reason/justification for all corrections
- Regular audit log review process

**Detection:** Query financial tables for records without corresponding audit entries; test that UPDATE operations create audit records.

**Phase mapping:** Database schema phase must include audit tables; every financial table needs corresponding audit mechanism.

**Sources:** [Financial Audit Trail Requirements](https://yokoy.io/blog/financial-audit-trail/), [VAT Reconciliation](https://safebooks.ai/resources/financial-data-governance/vat-reconciliation/)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or user experience degradation.

---

### Pitfall 6: Duplicate Detection False Positives Overwhelming Users

**What goes wrong:** Duplicate invoice detection flags too many false positives. Users spend more time dismissing false alerts than finding real duplicates. Recurring invoices, installment payments, and similar-amount invoices constantly flagged.

**Why it happens:** Rules-based duplicate detection (same amount + same date = duplicate) is too simplistic. ERP-style matching on invoice number/vendor/date/amount misses creative duplicates while flagging legitimate recurring charges.

**Consequences:**
- Users ignore duplicate warnings (alert fatigue)
- Real duplicates slip through
- Processing time increases rather than decreases
- User frustration and abandonment

**Warning signs:**
- >20% of flagged duplicates are dismissed as false positives
- Users stop reviewing duplicate alerts
- Same vendor's recurring invoices constantly flagged
- Installment payments flagged as duplicates of each other

**Prevention:**
- Implement ML-based duplicate scoring (risk: high/medium/low) instead of binary flags
- Train on user feedback: when users dismiss flags, learn from it
- Recognize recurring invoice patterns (same vendor, regular intervals, similar amounts)
- Compare invoice descriptions for semantic similarity, not just exact match
- Allow contextual tolerances (price variance of +/-2%)
- Show confidence scores, not just "possible duplicate"

**Detection:** Track false positive rate; survey users on duplicate detection usefulness; A/B test detection algorithms.

**Phase mapping:** Matching algorithm phase; start with conservative detection and tune based on user feedback.

**Sources:** [Xelix AI Duplicate Prevention](https://xelix.com/ai-for-world-leading-duplicate-invoice-prevention-software), [Duplicate Invoice Detection 2026](https://www.klippa.com/en/blog/information/how-to-detect-duplicate-invoices/)

---

### Pitfall 7: Large File Upload Memory Exhaustion

**What goes wrong:** Uploading large PDFs (multi-page invoices, bank statement exports) crashes browser tab or causes server timeout. Files read entirely into memory before upload. Multiple concurrent uploads compound the problem.

**Why it happens:** Default file upload reads entire file as blob into memory. React components hold file data in state. Server-side processing also loads full file into memory. Supabase standard uploads limited to 6MB for optimal performance.

**Consequences:**
- Browser crashes on large files
- Upload timeouts losing user work
- Server memory exhaustion under load
- Users cannot upload legitimate large documents

**Warning signs:**
- Browser tab memory usage spikes during upload
- Uploads fail for files >10MB
- Multiple users uploading simultaneously causes server issues
- Upload progress stuck at 0% then fails

**Prevention:**
- Use chunked/resumable uploads (TUS protocol supported by Supabase)
- Stream files instead of loading into memory
- Implement upload size limits with clear user feedback
- Use Supabase's direct storage hostname for large files
- Clean up Object URLs with `URL.revokeObjectURL()` after use
- Implement concurrent upload limits per user
- Show progress indicators and support upload resume

**Detection:** Load test with realistic file sizes; monitor server memory during uploads; track upload failure rates by file size.

**Phase mapping:** File upload phase; implement chunked uploads from the start, not as afterthought.

**Sources:** [Supabase Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [Handling Large File Uploads in React](https://mvineetsharma.medium.com/handling-large-file-uploads-in-react-with-node-js-ac26cce388b2)

---

### Pitfall 8: Israeli Bank Statement Format Fragility

**What goes wrong:** Bank statement parsing breaks when banks update their export format. Each bank (Leumi, Hapoalim, Discount, etc.) has different column structures, date formats, and encoding. Brittle parsers require constant maintenance.

**Why it happens:** No standard format for Israeli bank exports. Banks change formats without notice. CSV exports have encoding issues (UTF-8 vs Windows-1255 for Hebrew). Comma separators conflict with Israeli number formatting.

**Consequences:**
- Parser breaks requiring emergency fixes
- Users cannot import from specific banks
- Data loss or corruption from format mismatches
- Ongoing maintenance burden

**Warning signs:**
- Successful imports from one bank, failures from another
- Hebrew text appears as gibberish after import
- Numbers parsed incorrectly (decimal vs thousands separator)
- New bank format requires code changes

**Prevention:**
- Use LLM-based parsing that adapts to format variations
- Implement format detection/normalization layer
- Support multiple encodings (UTF-8, Windows-1255, ISO-8859-8)
- Store raw imported data alongside parsed data for debugging
- Build format-specific parsers but with fallback to intelligent parsing
- Allow user to map columns manually when auto-detection fails
- Use semicolon separator for CSV exports (Israeli locale compatibility)

**Detection:** Test suite with exports from each major Israeli bank; automated format detection tests; user-reported import failures tracking.

**Phase mapping:** Bank import phase; design for format flexibility from the start.

**Sources:** [Bank Statement Parsing Challenges](https://medium.com/@mahmudulhoque/stop-writing-bank-statement-parsers-use-llms-instead-50902360a604), [CSV Parser Bank Statements](https://www.olively.io/portfolio/csv-parsing-bank-statements)

---

### Pitfall 9: Vertex AI Rate Limiting and Quota Exhaustion

**What goes wrong:** Batch invoice processing hits Vertex AI rate limits. Processing stalls or fails mid-batch. Costs spike unexpectedly during high-volume periods.

**Why it happens:** Vertex AI has per-minute and per-day quotas. Burst processing (importing 100 invoices) exceeds limits. No backoff/retry logic implemented. Document files exceed size limits (15MB for documents in Gemini 2.0).

**Consequences:**
- Batch processing fails partway through
- Users waiting indefinitely for extraction results
- Unexpected API costs
- System appears unreliable during high-load periods

**Warning signs:**
- 429 errors in logs
- Processing time varies wildly
- Some documents in batch succeed, others fail
- Costs higher than projected

**Prevention:**
- Implement exponential backoff with jitter for rate limit errors
- Use Vertex AI Batch API for non-latency-sensitive processing (50% cost reduction)
- Queue extraction jobs and process at controlled rate
- Set concurrency limits (e.g., 5 concurrent extractions)
- Monitor quota usage and alert before exhaustion
- Compress/resize images before sending to API
- Cache extraction results to avoid re-processing same document

**Detection:** Monitor API response codes; track processing time percentiles; alert on quota usage >80%.

**Phase mapping:** Document extraction phase; implement rate limiting infrastructure before scaling to multiple users.

**Sources:** [Vertex AI Document Understanding](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/document-understanding), [API Rate Limiting Best Practices](https://blog.postman.com/what-is-api-rate-limiting/)

---

### Pitfall 10: Fuzzy Matching Algorithm Complexity Explosion

**What goes wrong:** Transaction-to-invoice matching becomes exponentially slow as data grows. Simple approaches (compare every transaction to every invoice) don't scale. Fuzzy matching on amounts/dates/vendors produces too many candidates.

**Why it happens:** Naive O(n*m) matching where n=transactions, m=invoices. No indexing or pre-filtering. Fuzzy string matching on Hebrew vendor names is expensive. Threshold tuning is trial-and-error.

**Consequences:**
- Matching takes minutes instead of seconds
- Users abandon matching feature
- Database under heavy load
- Incorrect matches from overly permissive fuzzy thresholds

**Warning signs:**
- Matching time grows non-linearly with data volume
- Database CPU spikes during matching operations
- Too many match candidates per transaction
- False matches on different vendors with similar amounts

**Prevention:**
- Pre-filter by date range (transaction within 30 days of invoice)
- Pre-filter by amount range (within 5% tolerance)
- Index frequently-queried columns (date, amount, vendor)
- Use similarity threshold of 85-90% for fuzzy matching
- Implement candidate generation phase before detailed comparison
- Cache vendor name normalizations
- Consider PostgreSQL `pg_trgm` extension for fuzzy text search

**Detection:** Monitor matching query execution time; track matches per transaction distribution; benchmark with realistic data volumes.

**Phase mapping:** Matching algorithm phase; design for scale from the start, test with 10x expected data volume.

**Sources:** [Fuzzy Matching in Bank Reconciliation](https://optimus.tech/blog/fuzzy-matching-algorithms-in-bank-reconciliation-when-exact-match-fails), [Transaction Matching Using AI](https://www.solvexia.com/blog/transaction-matching-using-ai)

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable without major refactoring.

---

### Pitfall 11: OCR Table Structure Loss

**What goes wrong:** Document extraction captures text but loses table structure. Invoice line items merged into single string. Column relationships lost (quantity, description, price become jumbled).

**Why it happens:** Traditional OCR treats documents as text streams. Table detection requires additional processing. PDF tables may be images, not structured data.

**Prevention:**
- Use Gemini's document understanding which preserves table structure
- Request structured JSON output with explicit table schema
- Validate extracted tables have expected number of columns
- Implement table reconstruction post-processing

**Phase mapping:** Document extraction phase; specify output schema that preserves structure.

**Sources:** [Document Data Extraction LLMs vs OCRs](https://www.vellum.ai/blog/document-data-extraction-llms-vs-ocrs)

---

### Pitfall 12: Timezone Handling in Date Comparisons

**What goes wrong:** Invoice date in Israel (UTC+2/+3) compared to transaction date in database (UTC) causes off-by-one-day matching failures. Daylight saving transitions cause additional confusion.

**Why it happens:** Dates stored as strings without timezone. Comparison logic doesn't account for timezone differences. Frontend displays local time, backend stores UTC.

**Prevention:**
- Store all dates as UTC timestamps in database
- Convert to local timezone only at display layer
- Use date-only comparisons (ignore time component) for invoice/transaction matching
- Document timezone handling convention

**Phase mapping:** Database schema phase; establish date handling convention early.

---

### Pitfall 13: File Type Validation Bypass

**What goes wrong:** Users upload non-PDF/non-image files that appear to be PDFs (wrong extension, corrupted files). Processing fails with unclear errors.

**Why it happens:** Validation only checks file extension, not actual content (magic bytes). Corrupted PDFs pass initial validation but fail extraction.

**Prevention:**
- Validate file magic bytes, not just extension
- Implement PDF parsing validation before queuing for extraction
- Provide clear error messages for unsupported/corrupted files
- Support common image formats (JPEG, PNG) for photographed invoices

**Phase mapping:** File upload phase; implement robust validation.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Database Schema | Currency precision, missing audit tables | Use NUMERIC for money, design audit schema upfront |
| Authentication | RLS not enabled, service key exposure | Security checklist, automated RLS tests |
| File Upload | Memory exhaustion, size limits | Chunked uploads from day one |
| Document Extraction | LLM hallucination, Hebrew failures | Validation layer, Hebrew test suite |
| Bank Import | Format fragility, encoding issues | LLM-based parsing, multiple encoding support |
| Matching Algorithm | Performance degradation, false positives | Pre-filtering, indexing, feedback loop |
| VAT Calculation | Rounding errors, audit trail gaps | Integer storage, comprehensive logging |

---

## Quality Gate Verification

- [x] Pitfalls are specific to this domain (VAT/invoice/financial processing)
- [x] Prevention strategies are actionable (specific techniques, not vague advice)
- [x] Phase mapping included for all critical and moderate pitfalls
- [x] Warning signs documented for early detection
- [x] Sources cited for claims where available

---

## Sources

### OCR/Document Processing
- [OCR Problems and Solutions](https://conexiom.com/blog/the-6-biggest-ocr-problems-and-how-to-overcome-them)
- [Document Data Extraction: LLMs vs OCRs](https://www.vellum.ai/blog/document-data-extraction-llms-vs-ocrs)
- [Vertex AI Document Understanding](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/document-understanding)

### Financial Calculations
- [JavaScript Rounding Errors](https://www.robinwieruch.de/javascript-rounding-errors/)
- [Modern Treasury: Integer Storage](https://www.moderntreasury.com/journal/floats-dont-work-for-storing-cents)
- [Financial Calculations Pitfalls in .NET](https://medium.com/@stanislavbabenko/handling-precision-in-financial-calculations-in-net-a-deep-dive-into-decimal-and-common-pitfalls-1211cc5edd3b)

### Supabase/Security
- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Multi-Tenant RLS Architecture](https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2)
- [Supabase Storage Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)

### Invoice/Transaction Matching
- [Fuzzy Matching in Reconciliation](https://optimus.tech/blog/fuzzy-matching-algorithms-in-bank-reconciliation-when-exact-match-fails)
- [AI Duplicate Invoice Prevention](https://xelix.com/ai-for-world-leading-duplicate-invoice-prevention-software)
- [Invoice Reconciliation Best Practices](https://business.amazon.com/en/blog/invoice-reconciliation)

### LLM/AI Specific
- [LLM Hallucinations in Financial Institutions](https://biztechmagazine.com/article/2025/08/llm-hallucinations-what-are-implications-financial-institutions)
- [Reducing Hallucination in Financial Reports](https://arxiv.org/html/2310.10760)
- [Gemini Document Processing](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/use-cases/document-processing/document_processing.ipynb)

### Hebrew/RTL
- [Hebrew Text Recognition Challenges](https://medium.com/@2UPLAB/creating-a-plugin-for-hebrew-text-recognition-our-experience-and-solutions-97973d13eeae)
- [OCR for Non-Latin Scripts](https://medium.com/@API4AI/ocr-for-arabic-cyrillic-scripts-multilingual-tactics-92edc1002d34)

### Compliance
- [VAT Reconciliation Requirements](https://safebooks.ai/resources/financial-data-governance/vat-reconciliation/)
- [Financial Audit Trail Compliance](https://yokoy.io/blog/financial-audit-trail/)
