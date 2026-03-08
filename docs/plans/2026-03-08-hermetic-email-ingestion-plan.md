# Hermetic Email Ingestion Plan

**Date:** 2026-03-08
**Status:** In Progress

## Current Progress

### Implemented

The following has already been implemented in the repo:

1. Added candidate-level email identity migration.
   File:
   [20260308100000_make_email_ingestion_hermetic.sql](/Users/yedidya/Desktop/invoices/supabase/migrations/20260308100000_make_email_ingestion_hermetic.sql)

2. Added shared email-ingestion modules.
   Files:
   [types.ts](/Users/yedidya/Desktop/invoices/supabase/functions/_shared/email-ingestion/types.ts)
   [senderRules.ts](/Users/yedidya/Desktop/invoices/supabase/functions/_shared/email-ingestion/senderRules.ts)
   [message.ts](/Users/yedidya/Desktop/invoices/supabase/functions/_shared/email-ingestion/message.ts)
   [discoverCandidates.ts](/Users/yedidya/Desktop/invoices/supabase/functions/_shared/email-ingestion/discoverCandidates.ts)
   [detectFinancialEmail.ts](/Users/yedidya/Desktop/invoices/supabase/functions/_shared/email-ingestion/detectFinancialEmail.ts)

3. Refactored historical sync onto candidate-based processing.
   File:
   [gmail-sync/index.ts](/Users/yedidya/Desktop/invoices/supabase/functions/gmail-sync/index.ts)

4. Refactored webhook onto candidate-based processing.
   File:
   [gmail-webhook/index.ts](/Users/yedidya/Desktop/invoices/supabase/functions/gmail-webhook/index.ts)

5. Refactored backstop onto candidate-based processing.
   File:
   [gmail-sync-backstop/index.ts](/Users/yedidya/Desktop/invoices/supabase/functions/gmail-sync-backstop/index.ts)

6. Added HTML extraction support in the extractor.
   File:
   [extract-invoice/index.ts](/Users/yedidya/Desktop/invoices/supabase/functions/extract-invoice/index.ts)

7. Standardized sender-rule writes in the frontend.
   Files:
   [useEmailConnections.ts](/Users/yedidya/Desktop/invoices/src/hooks/useEmailConnections.ts)
   [EmailConnectionsSection.tsx](/Users/yedidya/Desktop/invoices/src/components/email/EmailConnectionsSection.tsx)

8. Added initial unit tests for shared ingestion behavior.
   Files:
   [vitest.config.ts](/Users/yedidya/Desktop/invoices/vitest.config.ts)
   [emailIngestion.test.ts](/Users/yedidya/Desktop/invoices/supabase/functions/_shared/email-ingestion/__tests__/emailIngestion.test.ts)

### Verified

1. `npm test` passes for the new shared email-ingestion tests.
2. Focused linting passes for the changed email-ingestion files.

### Not Yet Verified End-to-End

1. Supabase migration has not been applied yet.
2. Edge functions have not been deployed yet.
3. Live Gmail ingestion has not been exercised against a real mailbox.
4. Existing app-wide build is still blocked by an unrelated frontend type error.

## Immediate Follow-Up Fixes Needed

These are the next things that need fixing before calling Phase 1 complete:

1. Apply and verify the new migration in the target Supabase environment.
2. Deploy updated edge functions and run live mailbox tests.
3. Verify the new unique index works correctly for:
   - multiple attachments in one message
   - html body plus attachment in one message
   - repeated webhook/backstop replay of the same message
4. Confirm `extract-invoice` accepts and correctly handles `html` file types in production.
5. Add end-to-end fixture tests for the three entry points:
   - historical sync
   - webhook
   - backstop
6. Tighten remote link fetching safety:
   - redirect cap
   - stricter domain trust rules
   - max file size checks
   - content-type allowlist enforcement everywhere
7. Add explicit skip/import reason logging, ideally to a dedicated ingestion audit table.
8. Decide whether to keep or remove the old local scoring code that still exists in webhook/backstop as dead compatibility code.
9. Fix the unrelated TypeScript build error in:
   [CCPurchasesTab.tsx:250](/Users/yedidya/Desktop/invoices/src/components/money-movements/CCPurchasesTab.tsx:250)
   The issue is that `'currency'` is used as a `CreditCardColumnKey`, but that key does not exist in:
   [columnVisibility.ts:14](/Users/yedidya/Desktop/invoices/src/types/columnVisibility.ts:14)

## Resume From Here

If continuing work from this plan, pick up in this order:

1. Run the new migration.
2. Deploy the four changed functions:
   - [gmail-sync/index.ts](/Users/yedidya/Desktop/invoices/supabase/functions/gmail-sync/index.ts)
   - [gmail-webhook/index.ts](/Users/yedidya/Desktop/invoices/supabase/functions/gmail-webhook/index.ts)
   - [gmail-sync-backstop/index.ts](/Users/yedidya/Desktop/invoices/supabase/functions/gmail-sync-backstop/index.ts)
   - [extract-invoice/index.ts](/Users/yedidya/Desktop/invoices/supabase/functions/extract-invoice/index.ts)
3. Test with real Gmail messages covering:
   - two attachments in one email
   - html-only receipt
   - download-link invoice
   - sender-rule trust
   - sender-rule ignore
4. Add end-to-end mocked tests for the three entry points.
5. Remove or consolidate leftover legacy scoring code after parity is confirmed.

## Goal

Replace the current leaky email invoice/receipt pipeline with a hermetic pipeline:

- one email can produce multiple documents safely
- all sync modes behave the same way
- every detection/import/skip is explainable
- HTML receipts and download-link invoices are first-class inputs
- no document is silently dropped after detection
- the system is testable end-to-end with fixtures

This is not a tune-up of the current flow. This is a replacement of the ingestion path with a single canonical pipeline.

## Why The Current Pipeline Leaks

The current implementation loses invoices/receipts in several ways:

1. Message-level dedupe is too coarse.
   One `email_message_id` currently blocks additional attachments from the same email.

2. Sync modes diverge.
   Historical sync, webhook, and backstop do not use the same parsing, detection, and candidate extraction logic.

3. HTML is not a real extraction input.
   HTML bodies can be stored but do not reliably enter extraction.

4. Download-link invoices are not handled.
   Link-based invoice delivery is missing from the real pipeline.

5. Sender rules are inconsistent.
   Different code paths expect different sender rule shapes.

6. The detector is drop-first.
   Ambiguous emails are often rejected before content is materialized.

7. Failure states are not hermetic.
   Some records can be left in confusing or invalid states.

## Design Principles

1. Single pipeline.
   All email ingestion entry points must go through the same core logic.

2. Candidate-first architecture.
   The pipeline should discover document candidates from an email before dedupe or extraction decisions.

3. Document-level idempotency.
   Dedupe should happen per candidate document, not per message.

4. High recall before extraction.
   If an email plausibly contains a financial document, materialize it and let later stages validate it.

5. Explicit state transitions.
   Every candidate should have a clear lifecycle and terminal state.

6. Explainable decisions.
   Every skip/import/reject must have a stored reason code.

7. Deterministic core, cheap model for ambiguity.
   Rules handle obvious cases. A cheap model resolves the middle.

8. Testability.
   Core parsing/detection/candidate logic must live in pure shared modules with fixtures and unit tests.

## Target Architecture

### Canonical Flow

```text
Email event arrives
  -> normalize message
  -> discover document candidates
  -> classify each candidate
  -> apply document-level dedupe
  -> materialize candidate to storage
  -> create files record
  -> trigger extraction
  -> validate extraction result
  -> route to review / approved / rejected
```

### Entry Points

All of these must call the same shared ingestion core:

- historical sync
- Gmail webhook
- Gmail backstop

No entry point is allowed to implement its own scoring or attachment filtering logic.

## Canonical Units

### Email Message

Represents the raw Gmail message.

### Candidate Document

A single possible importable financial document discovered inside an email.

Candidate types:

- `attachment`
- `html_body`
- `download_link`

Each candidate is processed independently.

## Proposed Data Model Changes

### Files Table Additions

Add fields needed for hermetic email ingestion:

- `email_message_id`
- `email_attachment_id` nullable
- `email_content_kind` nullable
- `email_source_url` nullable
- `email_detection_label` nullable
- `email_detection_confidence` nullable
- `email_detection_reason` nullable
- `email_discovery_metadata` jsonb nullable

Recommended uniqueness:

- unique on `(team_id, email_message_id, email_attachment_id)` when attachment exists
- unique on `(team_id, email_message_id, email_content_kind, email_source_url)` for html/link candidates
- keep `file_hash` dedupe for identical bytes across sources

Remove the assumption that one message maps to one file.

### Email Connections

Standardize `sender_rules` shape to one canonical schema:

```json
[
  {
    "pattern": "vendor.com",
    "match_type": "domain",
    "action": "always_trust"
  }
]
```

Fix allowed statuses so application code and database constraints match.

Recommended statuses:

- `active`
- `syncing`
- `reauthorization_required`
- `failed`
- `revoked`

### Optional New Table: `email_ingestion_events`

Recommended for debugging and audits.

Each row records:

- message id
- candidate identity
- action taken
- reason code
- detector output
- resulting file id if created

This is optional but strongly recommended.

## Shared Module Layout

Create shared modules under:

`supabase/functions/_shared/email-ingestion/`

Suggested files:

- `types.ts`
- `normalizeMessage.ts`
- `discoverCandidates.ts`
- `detectFinancialCandidate.ts`
- `dedupe.ts`
- `materializeCandidate.ts`
- `reasonCodes.ts`
- `senderRules.ts`
- `fixtures/`

All three functions should import from this shared package instead of re-implementing logic.

## Candidate Discovery

The first real fix is to discover all possible document candidates before filtering.

### Attachment Candidates

Include:

- PDF
- PNG
- JPG/JPEG
- WEBP

Each supported attachment becomes its own candidate.

### HTML Body Candidates

If the email body appears to be a receipt/invoice/payment confirmation, create one `html_body` candidate.

Do not store HTML and stop there.
HTML must go into a real extraction path.

### Download-Link Candidates

Extract likely invoice links from HTML:

- `invoice`
- `receipt`
- `billing`
- `download`
- vendor-specific patterns

Only fetch links that pass trust checks:

- allowlisted domain or sender-domain match
- safe content type
- file size cap
- redirect cap

## Detection System

### Recommended Approach

Use a cheap-model detector, but not as the only layer.

Pipeline:

1. Deterministic pre-filter
2. Cheap model for ambiguous candidates
3. Recall-first thresholding

### Why Not Pure `0/1` On Every Email

`0/1` is too weak for operations:

- no debugging
- no threshold tuning
- no reason codes
- no routing hint for attachment vs html vs link

Use structured output instead:

```json
{
  "label": "yes|maybe|no",
  "confidence": 0,
  "reason": "attachment|html_receipt|download_link|financial_email|marketing|shipping|auth|other"
}
```

### Detector Input

Per message, pass:

- sender
- subject
- plain text snippet
- attachment names
- attachment MIME types
- top extracted links
- whether HTML exists

Do not classify from subject/body only.

### Decision Policy

- `yes` -> import candidate
- `maybe` + candidate exists -> import candidate
- `maybe` + weak evidence -> queue for secondary review or secondary pass
- `no` -> skip with reason code

Bias toward recall.

## Extraction Paths

### Attachment Extraction

Use existing extraction pipeline after candidate materialization.

### HTML Extraction

Implement one of these:

1. Render HTML to PDF, then use the existing extractor
2. Extract visible text and use a text-aware extraction path

Preferred first implementation:

- render HTML to PDF or image
- reuse the existing visual extraction path

### Download-Link Extraction

Flow:

1. fetch trusted link
2. validate content-type and size
3. treat downloaded artifact as a normal candidate
4. store to storage
5. create file
6. trigger extraction

## State Machine

Each file/candidate should move through explicit states:

- `discovered`
- `materialized`
- `pending_extraction`
- `processing`
- `processed`
- `needs_review`
- `not_financial_document`
- `failed`

Avoid hidden terminal states and stuck `pending` records.

## Phase 1: Replace The Leaky Ingestion Core

### Objective

Make the pipeline hermetic before improving classification.

### Tasks

1. Create shared email-ingestion module.
2. Move message parsing and attachment traversal into shared code.
3. Implement candidate discovery for attachment, html, and link.
4. Replace message-level dedupe with candidate-level dedupe.
5. Standardize sender rule schema and migrate existing data.
6. Fix `email_connections.status` mismatch.
7. Refactor historical sync to use shared pipeline.
8. Refactor webhook to use shared pipeline.
9. Refactor backstop to use shared pipeline.
10. Add reason codes for every skipped/imported candidate.

### Phase 1 Acceptance Criteria

1. One email with three supported attachments creates three files.
2. Historical sync, webhook, and backstop produce the same output for the same input message.
3. HTML-body financial emails no longer get stuck without extraction routing.
4. No invalid `email_connections` status writes remain.

## Phase 2: Improve Detection And Extraction Quality

### Objective

Increase recall while keeping the pipeline explainable and cheap.

### Tasks

1. Introduce cheap-model detector in shared module.
2. Keep small deterministic hard-reject rules for obvious non-financial mail.
3. Use structured output instead of `0/1`.
4. Add trusted-link fetching.
5. Add HTML-to-rendered-document extraction path.
6. Add post-extraction validation:
   - vendor present
   - amount present
   - date or document number present
7. Store detector output on the file/candidate record.
8. Add feature flag for side-by-side detector rollout.

### Phase 2 Acceptance Criteria

1. HTML-only receipts can be imported and extracted.
2. Download-link invoices can be materialized and extracted.
3. Detector decisions are logged with confidence and reason.
4. Recall improves over the current rules-based detector on the same mailbox sample.

## Phase 3: Make It Provable With Tests

### Objective

Lock the new pipeline down with fixtures and automated tests.

### Test Harness

Use `vitest`.

Add tests for shared modules under a new test directory, for example:

- `supabase/functions/_shared/email-ingestion/__tests__/`

### Fixture Set

Create canonical fixtures for:

1. single invoice PDF attachment
2. single receipt image attachment
3. email with two invoice PDFs
4. HTML-only receipt
5. download-link invoice
6. newsletter with PDF brochure
7. shipping update
8. password reset email
9. Hebrew receipt
10. generic subject with invoice attachment

### Test Categories

1. Message normalization tests
2. Candidate discovery tests
3. Candidate-level dedupe tests
4. Sender rule tests
5. Detector tests with mocked model output
6. HTML rendering/fetch safety tests
7. Historical sync function-level tests
8. Webhook function-level tests
9. Backstop function-level tests
10. Minimal UI tests for review visibility

### Required Assertions

1. Multi-attachment emails import all candidates.
2. Duplicate replays do not create duplicate files.
3. HTML and link candidates enter extraction routing.
4. Skip reasons are stored.
5. The same message processed through different entry points yields the same result.

## Rollout Strategy

### Step 1

Ship Phase 1 behind a flag if needed, but prefer replacing the old core quickly because parallel paths create more drift.

### Step 2

Run the new detector in shadow mode:

- current detector decides imports
- new detector logs what it would do

Compare on the same mailbox sample.

### Step 3

Enable the new detector for a subset of teams.

### Step 4

Promote the new pipeline to default after metrics confirm:

- higher recall
- manageable false positives
- no growth in stuck records

## Metrics

Track at minimum:

- emails scanned
- candidates discovered
- candidates imported
- candidates skipped by reason
- extraction success rate
- extraction failure rate
- review approval rate
- review rejection rate
- per-entry-point parity

## Success Criteria

The replacement is successful when:

1. The pipeline is candidate-hermetic.
   Every detected candidate reaches a terminal state.

2. The pipeline is mode-hermetic.
   Historical sync, webhook, and backstop all use the same logic.

3. The pipeline is data-hermetic.
   One email can create multiple files without conflict.

4. The pipeline is operationally hermetic.
   Every skip/import/failure has a reason code and audit trail.

5. The pipeline is quality-hermetic.
   HTML and link-based receipts are first-class supported inputs.

6. The pipeline is test-hermetic.
   Fixtures cover the known failure classes and prevent regression.

## Recommended Execution Order

1. schema updates for candidate-level identity
2. shared email-ingestion module
3. historical sync refactor
4. webhook refactor
5. backstop refactor
6. HTML extraction path
7. trusted-link download path
8. cheap-model detector
9. telemetry and reason codes
10. fixture and test suite

## Notes

Do not optimize the detector first.

If dedupe, candidate discovery, and mode divergence remain broken, a better detector still feeds a leaky pipeline.

The first job is to make the pipeline hermetic.
