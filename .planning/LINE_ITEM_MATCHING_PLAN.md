# Line Item to Transaction Matching - Consolidated Plan

## Overview

Match `invoice_rows` (line items) to `transactions` where:
- **Target transactions**: `bank_regular` and `cc_purchase` only (NOT `bank_cc_charge`)
- **Date field**: Use `transactions.date` (when purchase happened), NOT `value_date` (billing date)
- **Link field**: `invoice_rows.transaction_id` → `transactions.id`

```
┌─────────────────────────┐         ┌─────────────────────────────────┐
│      invoice_rows       │         │          transactions           │
├─────────────────────────┤         ├─────────────────────────────────┤
│ id                      │         │ id                              │
│ invoice_id (FK)         │         │ date (purchase date) ◄──────────┼─── USE THIS
│ description             │         │ value_date (billing date)       │
│ reference_id            │         │ description                     │
│ transaction_date        │◄───────►│ amount_agorot                   │
│ total_agorot            │         │ transaction_type                │
│ currency                │         │   - 'bank_regular' ✓            │
│ vat_rate                │         │   - 'cc_purchase' ✓             │
│ vat_amount_agorot       │         │   - 'bank_cc_charge' ✗ (skip)   │
│ transaction_id (FK) ────┼────────►│ foreign_amount_cents            │
│ allocation_amount_agorot│         │ foreign_currency                │
└─────────────────────────┘         │ reference                       │
                                    │ match_status                    │
                                    └─────────────────────────────────┘
```

---

## Phase 1: Manual Connection UI & Logic

**Goal**: User can manually connect/disconnect line items to bank/CC purchase transactions

### 1.1 Database Changes

```sql
-- Add match tracking columns to invoice_rows
ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS match_status TEXT DEFAULT 'unmatched'
  CHECK (match_status IN ('unmatched', 'matched', 'partial', 'manual'));

ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,2);

ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS match_method TEXT
  CHECK (match_method IN ('manual', 'rule_reference', 'rule_amount_date', 'rule_fuzzy', 'ai_assisted'));

ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;

-- Index for finding unmatched line items
CREATE INDEX IF NOT EXISTS idx_invoice_rows_unmatched
ON invoice_rows(transaction_date, total_agorot)
WHERE transaction_id IS NULL;

-- Index for finding matchable transactions
CREATE INDEX IF NOT EXISTS idx_transactions_matchable
ON transactions(date, amount_agorot, transaction_type)
WHERE transaction_type IN ('bank_regular', 'cc_purchase');
```

### 1.2 Service Layer

**File**: `src/lib/services/lineItemMatcher.ts`

```typescript
// Core linking functions
export async function linkLineItemToTransaction(
  lineItemId: string,
  transactionId: string,
  allocationAgorot?: number  // For partial matching
): Promise<void>

export async function unlinkLineItemFromTransaction(
  lineItemId: string
): Promise<void>

export async function getMatchableTransactions(
  lineItem: InvoiceRow,
  options?: {
    dateRangeDays?: number      // default: 7
    amountTolerancePercent?: number  // default: 10
    transactionTypes?: TransactionType[]  // default: ['bank_regular', 'cc_purchase']
  }
): Promise<Transaction[]>

export async function getLineItemsForTransaction(
  transactionId: string
): Promise<InvoiceRow[]>
```

### 1.3 UI Components

**New Components:**

1. **LineItemLinkModal** (`src/components/invoices/LineItemLinkModal.tsx`)
   - Opens from invoice detail view when clicking "Link" on a line item
   - Shows list of candidate transactions (bank + CC purchases)
   - Filter by: date range, amount range, search description, card/bank, what card spesipic
   - Sort by: date, amount, description
   - Shows match indicators (amount diff, date diff)
   - "Link" button per transaction row

2. **TransactionLineItemsDrawer** (`src/components/money-movements/TransactionLineItemsDrawer.tsx`)
   - Opens from transaction table when clicking "View Links"
   - Shows all line items linked to this transaction
   - "Unlink" button per line item
   - Shows allocation amounts if partial

3. **LineItemMatchBadge** (`src/components/invoices/LineItemMatchBadge.tsx`)
   - Visual indicator: unmatched (gray), matched (green), partial (yellow)
   - Hover shows linked transaction summary

**Modify Existing:**

4. **LineItemsTable** - Add "Link Status" column with badge + link action button
5. **TransactionTable** - Add "Linked Items" column showing count
6. **CreditCardTable** - Add "Linked Items" column showing count

### 1.4 Success Criteria (Phase 1)

- [ ] Can click "Link" on any line item and see candidate transactions
- [ ] Can select a transaction and link it
- [ ] Link persists in database (`invoice_rows.transaction_id` set)
- [ ] Can view linked line items from transaction detail
- [ ] Can unlink a line item
- [ ] Unlink clears `transaction_id`, `match_status`, `match_confidence`, `match_method`
- [ ] UI shows correct status badges everywhere

---

## Phase 2: Rule-Based Auto-Matching (No AI)

**Goal**: Automatically match line items using deterministic rules

### 2.1 Matching Algorithm

**File**: `src/lib/services/lineItemAutoMatcher.ts`

```
┌─────────────────────────────────────────────────────────────────┐
│  RULE CASCADE (Priority Order - Stop on First Match)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TIER 1: EXACT MATCHES (Auto-Approve, Confidence: 95-100)      │
│  ─────────────────────────────────────────────────────────────  │
│  Rule 1.1: reference_id exact match in transaction.reference   │
│            OR reference_id found in transaction.description    │
│            Confidence: 100%                                     │
│                                                                 │
│  Rule 1.2: amount exact + date exact + same vendor             │
│            line_item.total_agorot == tx.amount_agorot          │
│            line_item.transaction_date == tx.date               │
│            vendor_match(line_item.description, tx.description) │
│            Confidence: 98%                                      │
│                                                                 │
│  Rule 1.3: amount exact + date exact (no vendor check)         │
│            Only if exactly ONE transaction matches             │
│            Confidence: 95%                                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TIER 2: STRONG MATCHES (Auto-Approve, Confidence: 80-94)      │
│  ─────────────────────────────────────────────────────────────  │
│  Rule 2.1: amount exact + date ±1 day                          │
│            Confidence: 90% (same day) / 85% (1 day off)        │
│                                                                 │
│  Rule 2.2: amount ±1% + date exact + vendor match              │
│            Confidence: 88%                                      │
│                                                                 │
│  Rule 2.3: VAT-adjusted amount + date ±2 days                  │
│            Try: amount * 1.17 OR amount / 1.17                 │
│            Confidence: 82%                                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TIER 3: FUZZY MATCHES (Present as Candidate, Conf: 60-79)     │
│  ─────────────────────────────────────────────────────────────  │
│  Rule 3.1: amount ±2% + date ±3 days + vendor similarity >80%  │
│            Confidence: 70-79% (weighted score)                  │
│                                                                 │
│  Rule 3.2: foreign currency match                              │
│            line_item.currency == tx.foreign_currency           │
│            line_item.total_agorot ≈ tx.foreign_amount_cents    │
│            Confidence: 75%                                      │
│                                                                 │
│  Rule 3.3: amount ±5% + exact vendor match                     │
│            Confidence: 65%                                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TIER 4: WEAK MATCHES (Flag for AI/Manual, Conf: <60)          │
│  ─────────────────────────────────────────────────────────────  │
│  Multiple candidates OR low confidence → Phase 3 (AI)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Confidence Scoring Formula

```typescript
interface ConfidenceFactors {
  referenceIdMatch: boolean      // +40 points
  amountExact: boolean           // +25 points
  amountWithin1Pct: boolean      // +20 points
  amountWithin5Pct: boolean      // +10 points
  dateExact: boolean             // +20 points
  dateWithin1Day: boolean        // +15 points
  dateWithin3Days: boolean       // +10 points
  vendorExactMatch: boolean      // +15 points
  vendorSimilarity80: boolean    // +10 points
  currencyMatch: boolean         // +5 points
  vatAdjustmentNeeded: boolean   // -5 points (penalty)
  multipleCandidates: boolean    // -10 points (penalty)
}

function calculateConfidence(factors: ConfidenceFactors): number {
  let score = 0
  if (factors.referenceIdMatch) score += 40
  if (factors.amountExact) score += 25
  else if (factors.amountWithin1Pct) score += 20
  else if (factors.amountWithin5Pct) score += 10
  // ... etc
  return Math.min(100, Math.max(0, score))
}
```

### 2.3 Thresholds (User Configurable)

```typescript
// Add to user_settings or settingsStore
interface MatchingThresholds {
  autoApproveConfidence: number    // default: 85 - auto-link without review
  candidateConfidence: number      // default: 60 - show as suggestion
  aiTriggerConfidence: number      // default: 40 - send to AI (Phase 3)
  // Below aiTriggerConfidence → Manual review only
}
```

### 2.4 Service Interface

```typescript
interface MatchCandidate {
  transaction: Transaction
  confidence: number
  matchMethod: 'rule_reference' | 'rule_amount_date' | 'rule_fuzzy'
  factors: ConfidenceFactors
  amountDifference: number
  dateDifferenceDays: number
  warnings: string[]
}

interface AutoMatchResult {
  lineItemId: string
  status: 'matched' | 'candidate' | 'ai_needed' | 'no_match'
  bestMatch: MatchCandidate | null
  alternatives: MatchCandidate[]  // Other candidates with conf > 40%
}

interface BatchMatchResult {
  totalItems: number
  autoMatched: number      // Confidence >= autoApproveConfidence
  candidates: number       // Confidence >= candidateConfidence
  needsAI: number          // Confidence >= aiTriggerConfidence
  noMatch: number          // Below all thresholds
  results: AutoMatchResult[]
}

// Main functions
export async function autoMatchLineItem(
  lineItem: InvoiceRow,
  thresholds?: MatchingThresholds
): Promise<AutoMatchResult>

export async function autoMatchInvoice(
  invoiceId: string,
  thresholds?: MatchingThresholds
): Promise<BatchMatchResult>

export async function autoMatchAllUnmatched(
  userId: string,
  thresholds?: MatchingThresholds
): Promise<BatchMatchResult>
```

### 2.5 UI Additions

1. **Auto-Match Button** on Invoice detail page
   - "Auto-Match Line Items" button
   - Shows progress indicator
   - Results summary: "Matched: 5, Candidates: 2, Needs Review: 1"

2. **Match Candidates Panel**
   - Shows line items with candidates (conf 60-84%)
   - User can approve/reject suggested matches
   - Quick "Approve All High Confidence" action

3. **Match Settings** in Settings page
   - Slider for auto-approve threshold
   - Toggle for auto-match on upload

### 2.6 Success Criteria (Phase 2)

- [ ] Auto-match correctly links reference_id matches (billing summaries)
- [ ] Auto-match correctly links exact amount+date matches
- [ ] Fuzzy matches appear as "candidates" for review
- [ ] User can approve/reject candidate matches
- [ ] Confidence scores match expected values
- [ ] No false positives at 85%+ confidence threshold
- [ ] Performance: <2s for batch matching 50 line items

---

## Phase 3: AI Helper (Low Confidence Disambiguation)

**Goal**: Use AI only for items below confidence threshold where rules couldn't decide

### 3.1 When AI is Triggered

AI is called ONLY when:
1. Confidence score is between `aiTriggerConfidence` (40) and `candidateConfidence` (60)
2. Multiple candidates exist with similar (-+10%) confidence (can't decide)
3. Vendor name mismatch but amount/date match (need semantic understanding)

### 3.2 Token-Optimized Request Format

```typescript
interface AIMatchRequest {
  line_item: {
    description: string      // max 100 chars
    amount: number           // in ILS
    date: string             // YYYY-MM-DD
    reference_id?: string
    vendor_hint?: string     // from invoice.vendor_name
  }
  candidates: Array<{
    id: string
    description: string      // max 100 chars
    amount: number
    date: string
    type: 'bank' | 'cc_purchase'
    current_confidence: number
  }>  // max 5 candidates
}

// Response
interface AIMatchResponse {
  best_match_id: string | null
  confidence: number         // 0-100
  reasoning: string          // Brief explanation
  is_same_vendor: boolean
}
```

**Token estimate**: ~300-400 tokens per request (vs 2000+ for full context)

### 3.3 AI Service

**File**: `src/lib/services/lineItemAIMatcher.ts`

```typescript
export async function aiDisambiguateMatch(
  request: AIMatchRequest
): Promise<AIMatchResponse>

export async function batchAIDisambiguate(
  requests: AIMatchRequest[]
): Promise<AIMatchResponse[]>  // Batch up to 10 items per call
```

### 3.4 Caching Strategy

```typescript
// Cache vendor name mappings learned from AI
// Store in localStorage or Supabase
interface VendorMappingCache {
  // "FACEBK" → "Meta Platforms"
  // "GOOG*" → "Google"
  mappings: Map<string, string>

  // Check cache before AI call
  getCachedVendor(description: string): string | null

  // Update cache after AI confirms
  cacheVendorMapping(from: string, to: string): void
}
```

### 3.5 Success Criteria (Phase 3)

- [ ] AI only called for items in 40-60% confidence range
- [ ] AI correctly identifies vendor aliases (FACEBK = Meta)
- [ ] AI response integrated into match flow
- [ ] Vendor mappings cached for future use
- [ ] Cost tracking: log tokens used per match
- [ ] <5% of total matches require AI

---

## Phase 4: Verification & Testing

**Goal**: Ensure production-ready quality

### 4.1 Test Scenarios

**Manual Linking Tests:**
- [ ] Link line item to bank transaction
- [ ] Link line item to CC purchase
- [ ] Link multiple line items to same transaction (partial)
- [ ] Unlink line item
- [ ] Verify UI updates correctly after link/unlink

**Auto-Match Tests:**
- [ ] Reference ID exact match (Meta billing summary)
- [ ] Amount + date exact match
- [ ] Amount + date with 1 day tolerance
- [ ] VAT-adjusted amount match
- [ ] Foreign currency match (USD invoice to USD CC purchase)
- [ ] Vendor fuzzy match (similar names)
- [ ] No match scenario (completely different)
- [ ] Multiple candidates scenario

**AI Tests:**
- [ ] AI correctly disambiguates vendor aliases
- [ ] AI rejects when no good match
- [ ] Cached vendor mappings work on second encounter

**Edge Cases:**
- [ ] Very large amounts (>100,000 ILS)
- [ ] Very small amounts (<10 ILS)
- [ ] Future dated transactions
- [ ] Duplicate amounts on same date
- [ ] Already matched transactions (should skip)

### 4.2 Metrics Dashboard

Track in production:
- Auto-match rate (% matched without review)
- Candidate rate (% needing user review)
- AI usage rate (% requiring AI)
- False positive rate (user-rejected auto-matches)
- Average confidence by match method

### 4.3 Success Criteria (Phase 4)

- [ ] All test scenarios pass
- [ ] Auto-match rate > 70%
- [ ] False positive rate < 2%
- [ ] AI usage < 5% of total matches
- [ ] Performance: Full invoice match < 3s
- [ ] No orphaned links after unlink
- [ ] Audit trail in place

---

## Implementation Order

```
Phase 1 (Manual Connection)
├── 1.1 Database migration
├── 1.2 Service: linkLineItemToTransaction, unlinkLineItemFromTransaction
├── 1.3 Service: getMatchableTransactions
├── 1.4 UI: LineItemLinkModal
├── 1.5 UI: TransactionLineItemsDrawer
├── 1.6 UI: LineItemMatchBadge
├── 1.7 Integrate into existing tables
└── 1.8 Test manual flow end-to-end

Phase 2 (Rule-Based Auto-Match)
├── 2.1 Service: calculateConfidence
├── 2.2 Service: autoMatchLineItem (Tier 1 rules)
├── 2.3 Service: autoMatchLineItem (Tier 2 rules)
├── 2.4 Service: autoMatchLineItem (Tier 3 rules)
├── 2.5 Service: autoMatchInvoice (batch)
├── 2.6 UI: Auto-Match button
├── 2.7 UI: Match Candidates panel
├── 2.8 UI: Match Settings
└── 2.9 Test auto-match with real data

Phase 3 (AI Helper)
├── 3.1 Service: aiDisambiguateMatch
├── 3.2 Integration with auto-match flow
├── 3.3 Vendor mapping cache
├── 3.4 Cost tracking
└── 3.5 Test AI edge cases

Phase 4 (Verification)
├── 4.1 Run all test scenarios
├── 4.2 Performance testing
├── 4.3 Metrics dashboard
└── 4.4 Production deployment
```

---

## File Structure

```
src/lib/services/
├── lineItemMatcher/
│   ├── index.ts                  # Exports all functions
│   ├── manualMatcher.ts          # Phase 1: link/unlink functions
│   ├── candidateFinder.ts        # Find potential matches
│   ├── confidenceCalculator.ts   # Confidence scoring
│   ├── autoMatcher.ts            # Phase 2: Rule-based matching
│   ├── aiMatcher.ts              # Phase 3: AI disambiguation
│   ├── vendorCache.ts            # Vendor mapping cache
│   └── types.ts                  # TypeScript interfaces

src/components/invoices/
├── LineItemLinkModal.tsx         # Modal to link line item
├── LineItemMatchBadge.tsx        # Status badge component
└── MatchCandidatesPanel.tsx      # Review candidates

src/components/money-movements/
└── TransactionLineItemsDrawer.tsx # View/manage linked items
```
