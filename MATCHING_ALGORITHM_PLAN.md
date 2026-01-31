# Line Item to Transaction Matching Algorithm - Implementation Plan

## Overview & Goals

### Purpose
Match invoice line items (`invoice_rows`) to bank/CC transactions (`transactions`) with high accuracy using a multi-signal scoring algorithm. This enables automatic reconciliation of invoices with actual payments.

### Core Constraints
1. **Expenses Only**: Only match line items to expense transactions (`is_income === false`)
2. **Target Transaction Types**: `bank_regular` and `cc_purchase` only (NOT `bank_cc_charge`)
3. **Date Field**: Use `transactions.date` (purchase date), not `value_date` (billing date)
4. **Already Allocated**: Skip transactions that are fully allocated to other line items
5. **Manual Match is King**: When user manually connects a line item to a transaction, this is the **strongest** match (100% confidence) and overrides any auto-match suggestions

### Match Method Hierarchy (Strongest to Weakest)
```
1. MANUAL        → 100% confidence, user explicitly connected
2. AUTO_APPROVED → 85%+ auto-score, user approved suggestion
3. AUTO_MATCHED  → 85%+ auto-score, auto-approved by system
4. CANDIDATE     → 50-84% auto-score, needs user review
```

### Data Flow
```
┌─────────────────────────────────┐         ┌─────────────────────────────────────┐
│         invoice_rows            │         │           transactions              │
├─────────────────────────────────┤         ├─────────────────────────────────────┤
│ id                              │         │ id                                  │
│ invoice_id (FK)                 │         │ date (purchase date) ◄───USE THIS   │
│ description                     │         │ value_date (billing date)           │
│ reference_id                    │         │ description                         │
│ transaction_date                │◄───────►│ reference                           │
│ total_amount (smallest unit)    │         │ amount_agorot                       │
│ currency                        │         │ is_income ◄──── MUST BE false       │
│ vat_rate                        │         │ transaction_type                    │
│ vat_amount                      │         │   - 'bank_regular' ✓                │
│ transaction_id (FK) ────────────┼────────►│   - 'cc_purchase' ✓                 │
│ allocation_amount               │         │   - 'bank_cc_charge' ✗ (skip)       │
│ match_confidence                │         │ foreign_amount                │
│ match_method                    │         │ foreign_currency                    │
│ match_status                    │         │ channel                             │
│                                 │         │ credit_card_id                      │
│         INVOICE                 │         └─────────────────────────────────────┘
│ vendor_name                     │                        ▲
│ invoice_number                  │                        │
│ invoice_date                    │         ┌──────────────┴──────────────┐
│ due_date                        │         │       credit_cards          │
│ is_income                       │         ├─────────────────────────────┤
│                                 │         │ card_last_four              │
│         FILES.extracted_data    │         │ card_name                   │
│ confidence                      │         │ card_type                   │
│ vendor.name                     │         └─────────────────────────────┘
│ vendor.vat_id                   │
│ billing_period.start/end        │
│ line_items[].reference_id       │
└─────────────────────────────────┘
```

---

## 1. Database Schema

### 1.1 Vendor Aliases Table (New)

```sql
-- Migration: 20260131000000_add_vendor_aliases.sql

-- Vendor aliases for matching - user/team managed
CREATE TABLE IF NOT EXISTS vendor_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

  -- The alias pattern (what appears in transaction)
  alias_pattern TEXT NOT NULL,

  -- The canonical vendor name it maps to
  canonical_name TEXT NOT NULL,

  -- Is this exact match or contains match?
  match_type TEXT NOT NULL DEFAULT 'contains'
    CHECK (match_type IN ('exact', 'contains', 'starts_with', 'ends_with')),

  -- Is this from the hardcoded list (system) or user-created?
  source TEXT NOT NULL DEFAULT 'user'
    CHECK (source IN ('system', 'user', 'learned')),

  -- Priority for ordering (higher = checked first)
  priority INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Unique constraint per user/team
  UNIQUE (user_id, team_id, alias_pattern)
);

-- Indexes for fast lookup
CREATE INDEX idx_vendor_aliases_user ON vendor_aliases(user_id);
CREATE INDEX idx_vendor_aliases_team ON vendor_aliases(team_id);
CREATE INDEX idx_vendor_aliases_pattern ON vendor_aliases(alias_pattern);
CREATE INDEX idx_vendor_aliases_canonical ON vendor_aliases(canonical_name);

-- Trigger to update updated_at
CREATE TRIGGER vendor_aliases_updated_at
  BEFORE UPDATE ON vendor_aliases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE vendor_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own aliases"
  ON vendor_aliases FOR SELECT
  USING (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND is_active_team_member(team_id))
  );

CREATE POLICY "Users can create their own aliases"
  ON vendor_aliases FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ALL aliases are 100% editable by the user (including seeded defaults)
CREATE POLICY "Users can update their own aliases"
  ON vendor_aliases FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ALL aliases are deletable by the user (including seeded defaults)
CREATE POLICY "Users can delete their own aliases"
  ON vendor_aliases FOR DELETE
  USING (auth.uid() = user_id);

-- Seed default aliases for new users (they can edit/delete these)
-- This is done via a trigger on user creation or first login
```

### 1.2 Seed Default Aliases Function

```sql
-- Function to seed default aliases for a new user
-- These are FULLY EDITABLE by the user - just starting suggestions
CREATE OR REPLACE FUNCTION seed_default_vendor_aliases(p_user_id UUID, p_team_id UUID DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO vendor_aliases (user_id, team_id, alias_pattern, canonical_name, match_type, source, priority)
  VALUES
    -- Big Tech (users can edit/delete these!)
    (p_user_id, p_team_id, 'FACEBK', 'Meta', 'contains', 'user', 10),
    (p_user_id, p_team_id, 'FB*', 'Meta', 'starts_with', 'user', 10),
    (p_user_id, p_team_id, 'META PLATFORMS', 'Meta', 'contains', 'user', 10),
    (p_user_id, p_team_id, 'GOOG', 'Google', 'contains', 'user', 10),
    (p_user_id, p_team_id, 'GOOGLE*', 'Google', 'starts_with', 'user', 10),
    (p_user_id, p_team_id, 'AMZN', 'Amazon', 'contains', 'user', 10),
    (p_user_id, p_team_id, 'AWS', 'Amazon', 'contains', 'user', 10),
    (p_user_id, p_team_id, 'MSFT', 'Microsoft', 'contains', 'user', 10),
    (p_user_id, p_team_id, 'AZURE', 'Microsoft', 'contains', 'user', 10),
    -- Payment processors
    (p_user_id, p_team_id, 'PAYPAL*', 'PayPal', 'starts_with', 'user', 10),
    (p_user_id, p_team_id, 'STRIPE*', 'Stripe', 'starts_with', 'user', 10),
    -- Israeli common
    (p_user_id, p_team_id, 'פיי פלוס', 'PayPlus', 'contains', 'user', 10),
    (p_user_id, p_team_id, 'פייפלוס', 'PayPlus', 'contains', 'user', 10)
  ON CONFLICT (user_id, team_id, alias_pattern) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Limit aliases per user (max 100)
CREATE OR REPLACE FUNCTION check_vendor_alias_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM vendor_aliases WHERE user_id = NEW.user_id) >= 100 THEN
    RAISE EXCEPTION 'Maximum of 100 vendor aliases allowed per user';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_vendor_alias_limit
  BEFORE INSERT ON vendor_aliases
  FOR EACH ROW
  EXECUTE FUNCTION check_vendor_alias_limit();
```

### 1.3 TypeScript Types

```typescript
// src/types/database.ts - Add these types

export interface VendorAlias {
  id: string
  user_id: string
  team_id: string | null
  alias_pattern: string
  canonical_name: string
  match_type: 'exact' | 'contains' | 'starts_with' | 'ends_with'
  source: 'system' | 'user' | 'learned'
  priority: number
  created_at: string | null
  updated_at: string | null
}

export type VendorAliasInsert = Omit<VendorAlias, 'id' | 'created_at' | 'updated_at'>
export type VendorAliasUpdate = Partial<Omit<VendorAlias, 'id' | 'user_id' | 'created_at'>>
```

---

## 2. Settings UI Design (Vendor Aliases Management)

### 2.1 Location
Add a new section in the Settings page under the "Rules" tab.

### 2.2 Component Structure

```typescript
// src/components/settings/VendorAliasesSection.tsx

interface VendorAlias {
  id: string
  alias_pattern: string
  canonical_name: string
  match_type: 'exact' | 'contains' | 'starts_with' | 'ends_with'
  source: 'system' | 'user' | 'learned'
}

function VendorAliasesSection() {
  // State
  const [aliases, setAliases] = useState<VendorAlias[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingAlias, setEditingAlias] = useState<VendorAlias | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter aliases by search
  const filteredAliases = aliases.filter(a =>
    a.alias_pattern.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.canonical_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Vendor Aliases</h3>
          <p className="text-sm text-text-muted">
            Map transaction descriptions to vendor names for better matching
          </p>
        </div>
        <button onClick={() => setIsAddModalOpen(true)}>
          <PlusIcon className="w-4 h-4 mr-2" />
          Add Alias
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search aliases..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Aliases Table */}
      <table>
        <thead>
          <tr>
            <th>Transaction Pattern</th>
            <th>Maps To</th>
            <th>Match Type</th>
            <th>Source</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredAliases.map(alias => (
            <tr key={alias.id}>
              <td><code>{alias.alias_pattern}</code></td>
              <td>{alias.canonical_name}</td>
              <td>{alias.match_type}</td>
              <td>
                {alias.source === 'user' && <Badge>Custom</Badge>}
                {alias.source === 'learned' && <Badge>Learned</Badge>}
              </td>
              <td>
                {/* ALL aliases are 100% editable */}
                <button onClick={() => setEditingAlias(alias)}>
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button onClick={() => deleteAlias(alias.id)}>
                  <TrashIcon className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

### 2.3 Add/Edit Alias Modal

```typescript
// src/components/settings/VendorAliasModal.tsx

// Partial type for modal - user_id, team_id, priority are set by the hook
interface VendorAliasFormData {
  alias_pattern: string
  canonical_name: string
  match_type: 'exact' | 'contains' | 'starts_with' | 'ends_with'
  source: 'system' | 'user' | 'learned'
}

interface VendorAliasModalProps {
  isOpen: boolean
  onClose: () => void
  alias?: VendorAlias | null  // null = add mode
  onSave: (data: VendorAliasFormData) => void
}

function VendorAliasModal({ isOpen, onClose, alias, onSave }: VendorAliasModalProps) {
  const [pattern, setPattern] = useState(alias?.alias_pattern || '')
  const [canonical, setCanonical] = useState(alias?.canonical_name || '')
  const [matchType, setMatchType] = useState<'exact' | 'contains' | 'starts_with' | 'ends_with'>(
    alias?.match_type || 'contains'
  )

  const handleSave = () => {
    onSave({
      alias_pattern: pattern.toUpperCase(), // Normalize to uppercase
      canonical_name: canonical,
      match_type: matchType,
      source: 'user',
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={alias ? 'Edit Alias' : 'Add Vendor Alias'}>
      <div className="space-y-4">
        {/* Pattern Input */}
        <div>
          <label>Transaction Pattern</label>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="e.g., FACEBK, GOOG*, AMZN"
          />
          <p className="text-xs text-text-muted mt-1">
            This is what appears in your bank/CC statement
          </p>
        </div>

        {/* Canonical Name Input */}
        <div>
          <label>Vendor Name</label>
          <input
            type="text"
            value={canonical}
            onChange={(e) => setCanonical(e.target.value)}
            placeholder="e.g., Meta Platforms, Google, Amazon"
          />
          <p className="text-xs text-text-muted mt-1">
            This is the vendor name on your invoices
          </p>
        </div>

        {/* Match Type Select */}
        <div>
          <label>Match Type</label>
          <select value={matchType} onChange={(e) => setMatchType(e.target.value as any)}>
            <option value="contains">Contains (default)</option>
            <option value="exact">Exact Match</option>
            <option value="starts_with">Starts With</option>
            <option value="ends_with">Ends With</option>
          </select>
        </div>

        {/* Preview */}
        <div className="p-3 bg-surface rounded-lg">
          <p className="text-sm text-text-muted mb-2">Preview:</p>
          <p className="text-sm">
            Transaction containing "<code>{pattern || '...'}</code>" will match invoices from "<strong>{canonical || '...'}</strong>"
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleSave} disabled={!pattern || !canonical}>
            {alias ? 'Update' : 'Add'} Alias
          </button>
        </div>
      </div>
    </Modal>
  )
}
```

---

## 3. Scoring Algorithm

### 3.1 Scoring Weights (Finalized)

| Signal | Points | Description |
|--------|--------|-------------|
| **MANUAL MATCH** | **100** | User explicitly connected - STRONGEST, always wins |
| **Reference Match** | 0-45 | Exact match in reference field or found in description |
| **Amount Match** | 0-25 | Exact, within %, VAT-adjusted, or foreign currency |
| **Date Match** | 0-15 | Check both `date` and `value_date` |
| **Vendor Match** | 0-15 | 2-tier: User aliases (from Settings) → Fuzzy matching |
| **Currency Match** | 0-5 | Same currency bonus |
| **Context Signals** | 0-5 | Billing period, channel, credit card |
| **Penalties** | | |
| - Income/Expense Mismatch | **HARD DISQUALIFIER** | Skip transaction entirely |
| - Vendor Mismatch | -5 to -10 | Reduced penalty (not confident in vendor matching) |

**Maximum Auto-Score: 110 points** (normalized to 0-100%)
**Manual Match: Always 100%** (overrides auto-score)

### 3.2 Manual Match (Strongest Signal - 100%)

**When user manually connects a line item to a transaction, this is the STRONGEST match.**

```typescript
// Manual match always wins
interface ManualMatchResult {
  confidence: 100           // Always 100%
  matchMethod: 'manual'     // Clearly marked as manual
  matchedBy: string         // User ID who made the match
  matchedAt: string         // Timestamp
}

// When linking manually:
await linkLineItemToTransaction(lineItemId, transactionId, {
  matchMethod: 'manual',
  matchConfidence: 100,  // Always 100 for manual
})
```

**UI Behavior:**
1. When showing auto-match candidates, always show the "confidence score" (e.g., 85%)
2. If user confirms an auto-match suggestion → still marked as `manual` with 100% confidence
3. Manual matches are highlighted differently in UI (e.g., checkmark icon vs auto icon)
4. Manual matches can be unlinked by user at any time

**Learning from Manual Matches:**
When user manually matches a line item to a transaction where vendor names differ significantly:
- Suggest adding a new alias: "Add FACEBK → Meta to your aliases?"
- If user accepts, alias is added to Settings (fully editable)
- Future matches will use this alias automatically

### 3.3 Hard Filters (Applied Before Scoring)

```typescript
function isTransactionEligible(
  transaction: Transaction,
  lineItem: InvoiceRow,
  invoice: Invoice | null
): boolean {
  // 1. MUST be expense (hard requirement)
  if (transaction.is_income === true) {
    return false
  }

  // 2. Must be correct transaction type
  if (!['bank_regular', 'cc_purchase'].includes(transaction.transaction_type || '')) {
    return false
  }

  // 3. Skip fully allocated transactions (check if remaining balance is 0)
  // This requires checking all linked invoice_rows

  // 4. Income/Expense alignment with invoice
  // If invoice.is_income === true, line items are income - skip expense transactions
  // If invoice.is_income === false, line items are expenses - match expense transactions
  if (invoice?.is_income === true) {
    return false // Skip - this line item is from an income invoice
  }

  return true
}
```

### 3.4 Detailed Scoring Function

```typescript
// src/lib/services/lineItemMatcher/scorer.ts

export interface MatchScore {
  total: number              // 0-100 normalized
  rawTotal: number           // Raw points (0-110)
  breakdown: {
    reference: number        // 0-45
    amount: number           // 0-25
    date: number             // 0-15
    vendor: number           // 0-15 (can be negative with penalty)
    currency: number         // 0-5
    context: number          // 0-5
  }
  penalties: {
    vendorMismatch: number   // 0 to -10
  }
  matchReasons: string[]
  warnings: string[]
  isDisqualified: boolean
  disqualifyReason?: string
}

export interface ScoringContext {
  lineItem: InvoiceRow
  invoice: Invoice | null
  extractedData: InvoiceExtraction | null
  vendorAliases: VendorAlias[]
}

export function scoreMatch(
  transaction: Transaction,
  context: ScoringContext
): MatchScore {
  const { lineItem, invoice, extractedData, vendorAliases } = context

  const score: MatchScore = {
    total: 0,
    rawTotal: 0,
    breakdown: { reference: 0, amount: 0, date: 0, vendor: 0, currency: 0, context: 0 },
    penalties: { vendorMismatch: 0 },
    matchReasons: [],
    warnings: [],
    isDisqualified: false,
  }

  // ========================================
  // HARD DISQUALIFIERS
  // ========================================

  // Income/Expense mismatch
  if (transaction.is_income === true) {
    score.isDisqualified = true
    score.disqualifyReason = 'Transaction is income, but matching expenses only'
    return score
  }

  // Wrong transaction type
  if (!['bank_regular', 'cc_purchase'].includes(transaction.transaction_type || '')) {
    score.isDisqualified = true
    score.disqualifyReason = `Transaction type '${transaction.transaction_type}' not eligible`
    return score
  }

  // ========================================
  // REFERENCE MATCHING (0-45 points)
  // ========================================
  score.breakdown.reference = scoreReference(lineItem, transaction, extractedData)
  if (score.breakdown.reference > 0) {
    score.matchReasons.push(`Reference match: ${score.breakdown.reference} pts`)
  }

  // ========================================
  // AMOUNT MATCHING (0-25 points)
  // ========================================
  score.breakdown.amount = scoreAmount(lineItem, transaction)
  if (score.breakdown.amount > 0) {
    score.matchReasons.push(`Amount match: ${score.breakdown.amount} pts`)
  }

  // ========================================
  // DATE MATCHING (0-15 points)
  // ========================================
  score.breakdown.date = scoreDate(lineItem, invoice, transaction)
  if (score.breakdown.date > 0) {
    score.matchReasons.push(`Date match: ${score.breakdown.date} pts`)
  }

  // ========================================
  // VENDOR MATCHING (0-15 points, -5 to -10 penalty)
  // ========================================
  const vendorResult = scoreVendor(lineItem, invoice, transaction, vendorAliases)
  score.breakdown.vendor = vendorResult.points
  score.penalties.vendorMismatch = vendorResult.penalty

  if (vendorResult.points > 0) {
    score.matchReasons.push(`Vendor match: ${vendorResult.points} pts (${vendorResult.method})`)
  }
  if (vendorResult.penalty < 0) {
    score.warnings.push(`Vendor mismatch penalty: ${vendorResult.penalty} pts`)
  }

  // ========================================
  // CURRENCY MATCHING (0-5 points)
  // ========================================
  score.breakdown.currency = scoreCurrency(lineItem, transaction)

  // ========================================
  // CONTEXT SIGNALS (0-5 points)
  // ========================================
  score.breakdown.context = scoreContext(lineItem, invoice, extractedData, transaction)

  // ========================================
  // CALCULATE TOTAL
  // ========================================
  score.rawTotal =
    score.breakdown.reference +
    score.breakdown.amount +
    score.breakdown.date +
    score.breakdown.vendor +
    score.breakdown.currency +
    score.breakdown.context +
    score.penalties.vendorMismatch

  // Normalize to 0-100
  const maxPossible = 45 + 25 + 15 + 15 + 5 + 5 // 110
  score.total = Math.max(0, Math.min(100, Math.round((score.rawTotal / maxPossible) * 100)))

  return score
}
```

### 3.5 Individual Scoring Functions

```typescript
// ========================================
// REFERENCE SCORING (0-45 points)
// ========================================
function scoreReference(
  lineItem: InvoiceRow,
  transaction: Transaction,
  extractedData: InvoiceExtraction | null
): number {
  const refId = lineItem.reference_id || extractedData?.line_items?.find(
    li => li.description === lineItem.description
  )?.reference_id

  if (!refId) return 0

  // Exact match in transaction.reference field
  if (transaction.reference && transaction.reference === refId) {
    return 45
  }

  // Found in transaction.description
  const desc = transaction.description?.toUpperCase() || ''
  const ref = refId.toUpperCase()

  if (desc.includes(ref)) {
    return 40
  }

  // Partial reference match (e.g., last 6 digits)
  if (refId.length > 6) {
    const lastSix = ref.slice(-6)
    if (desc.includes(lastSix)) {
      return 25
    }
  }

  return 0
}

// ========================================
// AMOUNT SCORING (0-25 points)
// ========================================
// NOTE: All amounts are stored as integers in smallest currency unit:
// - ILS amounts: stored in agorot (1 ILS = 100 agorot)
// - USD amounts: stored in cents (1 USD = 100 cents)
// - EUR amounts: stored in cents (1 EUR = 100 cents)
// The `currency` field determines the unit interpretation.
function scoreAmount(lineItem: InvoiceRow, transaction: Transaction): number {
  const lineCurrency = lineItem.currency || 'ILS'
  const lineAmount = Math.abs(lineItem.total_amount || 0)  // Smallest unit of lineCurrency

  // Transaction amount is always in ILS (agorot)
  const txAmountILS = Math.abs(transaction.amount_agorot)

  if (lineAmount === 0 || txAmountILS === 0) return 0

  // Determine which amount to compare based on currency
  let txAmountToCompare: number

  if (lineCurrency === 'ILS') {
    // Line item is ILS - compare directly with transaction ILS amount
    txAmountToCompare = txAmountILS
  } else if (transaction.foreign_currency === lineCurrency && transaction.foreign_amount) {
    // Line item is foreign currency and transaction has matching foreign currency
    txAmountToCompare = Math.abs(transaction.foreign_amount)
  } else {
    // Currency mismatch - can't directly compare, give minimal score
    return 0
  }

  const diff = Math.abs(lineAmount - txAmountToCompare)
  const percentDiff = (diff / lineAmount) * 100

  // Exact match
  if (diff === 0) return 25

  // Within 1%
  if (percentDiff <= 1) return 22

  // Within 2%
  if (percentDiff <= 2) return 18

  // Within 5%
  if (percentDiff <= 5) return 12

  // VAT-adjusted matching (only for ILS comparisons)
  if (lineCurrency === 'ILS') {
    // Try 17% VAT
    const vatAdjusted1 = lineAmount * 1.17
    const vatAdjusted2 = lineAmount / 1.17

    if (Math.abs(txAmountToCompare - vatAdjusted1) <= lineAmount * 0.02) return 15
    if (Math.abs(txAmountToCompare - vatAdjusted2) <= lineAmount * 0.02) return 15

    // Try 18% VAT
    const vat18Add = lineAmount * 1.18
    const vat18Remove = lineAmount / 1.18

    if (Math.abs(txAmountToCompare - vat18Add) <= lineAmount * 0.02) return 12
    if (Math.abs(txAmountToCompare - vat18Remove) <= lineAmount * 0.02) return 12
  }

  // Within 10%
  if (percentDiff <= 10) return 5

  return 0
}

// ========================================
// DATE SCORING (0-15 points)
// ========================================
function scoreDate(
  lineItem: InvoiceRow,
  invoice: Invoice | null,
  transaction: Transaction
): number {
  // Get line item date (prefer transaction_date, fall back to invoice_date)
  const lineDate = lineItem.transaction_date || invoice?.invoice_date
  if (!lineDate) return 5 // No date available, give partial credit

  const lineDateObj = new Date(lineDate)
  const txDateObj = new Date(transaction.date)
  const valueDateObj = transaction.value_date ? new Date(transaction.value_date) : null

  // Calculate days difference for both dates (rounded to handle same-day comparisons)
  const dateDiff = Math.abs(
    Math.round((txDateObj.getTime() - lineDateObj.getTime()) / (1000 * 60 * 60 * 24))
  )
  const valueDateDiff = valueDateObj
    ? Math.abs(
        Math.round((valueDateObj.getTime() - lineDateObj.getTime()) / (1000 * 60 * 60 * 24))
      )
    : Infinity

  // Use the closer date
  const daysDiff = Math.min(dateDiff, valueDateDiff)

  // Same day (0 days difference)
  if (daysDiff === 0) return 15

  // Within 1 day
  if (daysDiff === 1) return 13

  // Within 3 days
  if (daysDiff <= 3) return 10

  // Within 5 days
  if (daysDiff <= 5) return 7

  // Within 7 days
  if (daysDiff <= 7) return 5

  // Within 14 days
  if (daysDiff <= 14) return 2

  return 0
}

// ========================================
// CURRENCY SCORING (0-5 points)
// ========================================
function scoreCurrency(lineItem: InvoiceRow, transaction: Transaction): number {
  const lineCurrency = lineItem.currency || 'ILS'

  // Check if transaction has foreign currency that matches
  if (transaction.foreign_currency === lineCurrency) {
    return 5
  }

  // If line item is ILS and transaction is ILS (no foreign)
  if (lineCurrency === 'ILS' && !transaction.foreign_currency) {
    return 5
  }

  // Currency mismatch but not disqualifying
  return 0
}

// ========================================
// CONTEXT SCORING (0-5 points)
// ========================================
function scoreContext(
  lineItem: InvoiceRow,
  invoice: Invoice | null,
  extractedData: InvoiceExtraction | null,
  transaction: Transaction
): number {
  let points = 0

  // Billing period check
  const billingPeriod = extractedData?.document?.billing_period
  if (billingPeriod?.start && billingPeriod?.end) {
    const txDate = new Date(transaction.date)
    const periodStart = new Date(billingPeriod.start)
    const periodEnd = new Date(billingPeriod.end)

    if (txDate >= periodStart && txDate <= periodEnd) {
      points += 3
    }
  }

  // Credit card channel hint
  if (transaction.transaction_type === 'cc_purchase' && transaction.channel) {
    // If line item description mentions the channel/merchant category
    const desc = lineItem.description?.toLowerCase() || ''
    const channel = transaction.channel.toLowerCase()

    if (desc.includes(channel) || channel.includes(desc.split(' ')[0])) {
      points += 2
    }
  }

  return Math.min(5, points)
}
```

---

## 4. Vendor Matching (2-Tier: User Aliases + Fuzzy)

### 4.1 Architecture

**Key Principle: ALL aliases are 100% user-editable in Settings**

```
┌─────────────────────────────────────────────────────────────────┐
│                    VENDOR MATCHING PIPELINE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INPUT: invoice.vendor_name, transaction.description            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  TIER 1: User Aliases (from Settings - 100% editable)  │    │
│  │                                                          │    │
│  │  - Stored in `vendor_aliases` table                     │    │
│  │  - Seeded with defaults (Meta, Google, Amazon, etc.)    │    │
│  │  - User can ADD, EDIT, DELETE any alias                 │    │
│  │  - Ordered by priority (user can reorder)               │    │
│  │  - Includes learned aliases from manual matches         │    │
│  │                                                          │    │
│  │  Example: FACEBK → Meta (user can change to "Facebook") │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                     │
│                           ▼ No alias match                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  TIER 2: Fuzzy Matching (automatic fallback)           │    │
│  │                                                          │    │
│  │  - Trigram similarity (good for Hebrew)                 │    │
│  │  - Levenshtein distance (for short strings)             │    │
│  │  - Token overlap (for compound names)                   │    │
│  │                                                          │    │
│  │  When fuzzy match is confirmed by user → suggest        │    │
│  │  adding it as a new alias in Settings                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  OUTPUT: { matched: boolean, confidence: 0-100, method: string }│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Manual Match Learning

When a user manually connects a line item to a transaction:

```typescript
// After manual match, suggest adding alias if vendor names differ
async function suggestAliasFromManualMatch(
  invoice: Invoice,
  transaction: Transaction
): Promise<void> {
  const vendorName = invoice.vendor_name
  const txDescription = transaction.description

  // Check if they're already similar (no need for alias)
  const similarity = fuzzyMatch(vendorName, txDescription)
  if (similarity > 0.8) return // Already similar enough

  // Extract the merchant key from transaction
  const txKey = extractMerchantKey(txDescription)

  // Check if alias already exists
  const existingAlias = await checkAliasExists(txKey)
  if (existingAlias) return

  // Suggest adding this as an alias
  showAliaseSuggestionToast({
    message: `Add "${txKey}" as alias for "${vendorName}"?`,
    action: () => createAlias({
      alias_pattern: txKey,
      canonical_name: vendorName,
      match_type: 'contains',
      source: 'learned'
    })
  })
}
```

### 4.3 Implementation

```typescript
// src/lib/services/lineItemMatcher/vendorMatcher.ts

// ========================================
// TIER 1: USER ALIASES (from Settings - 100% editable)
// ========================================
// NO hardcoded aliases! All aliases come from the database
// and are fully editable by users in Settings.
//
// Default aliases are SEEDED when user first signs up,
// but user can edit or delete them at any time.
function checkUserAliases(
  vendorName: string,
  txDescription: string,
  aliases: VendorAlias[]
): { canonical: string; alias: VendorAlias } | null {
  const normalizedVendor = vendorName.toLowerCase().trim()
  const normalizedTx = txDescription.toUpperCase().trim()

  // Sort by priority (higher first)
  const sortedAliases = [...aliases].sort((a, b) => (b.priority || 0) - (a.priority || 0))

  for (const alias of sortedAliases) {
    const pattern = alias.alias_pattern.toUpperCase()
    let patternMatches = false

    switch (alias.match_type) {
      case 'exact':
        patternMatches = normalizedTx === pattern
        break
      case 'starts_with':
        patternMatches = normalizedTx.startsWith(pattern)
        break
      case 'ends_with':
        patternMatches = normalizedTx.endsWith(pattern)
        break
      case 'contains':
      default:
        patternMatches = normalizedTx.includes(pattern)
    }

    if (patternMatches) {
      // Check if canonical matches the vendor name
      const canonical = alias.canonical_name.toLowerCase()
      if (normalizedVendor.includes(canonical) || canonical.includes(normalizedVendor)) {
        return { canonical: alias.canonical_name, alias }
      }
    }
  }

  return null
}

// ========================================
// TIER 2: FUZZY MATCHING
// ========================================

// Trigram similarity (good for Hebrew and unicode)
function trigramSimilarity(str1: string, str2: string): number {
  const getTrigrams = (s: string): Set<string> => {
    const normalized = s.toLowerCase().replace(/\s+/g, ' ').trim()
    const padded = ` ${normalized} `
    const trigrams = new Set<string>()

    for (let i = 0; i < padded.length - 2; i++) {
      trigrams.add(padded.slice(i, i + 3))
    }

    return trigrams
  }

  const t1 = getTrigrams(str1)
  const t2 = getTrigrams(str2)

  if (t1.size === 0 || t2.size === 0) return 0

  let intersection = 0
  for (const tri of t1) {
    if (t2.has(tri)) intersection++
  }

  const union = t1.size + t2.size - intersection
  return union > 0 ? intersection / union : 0
}

// Levenshtein distance (for short strings)
function levenshteinSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  const len1 = s1.length
  const len2 = s2.length

  if (len1 === 0) return len2 === 0 ? 1 : 0
  if (len2 === 0) return 0

  // For very long strings, use trigram instead
  if (len1 > 30 || len2 > 30) return trigramSimilarity(str1, str2)

  const matrix: number[][] = []

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
    for (let j = 1; j <= len2; j++) {
      matrix[i][j] = i === 0 ? j : 0
    }
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  const distance = matrix[len1][len2]
  const maxLen = Math.max(len1, len2)
  return 1 - distance / maxLen
}

// Token overlap (for compound names)
function tokenOverlapSimilarity(str1: string, str2: string): number {
  const tokenize = (s: string): Set<string> => {
    return new Set(
      s.toLowerCase()
        .replace(/[^\w\s\u0590-\u05FF]/g, ' ') // Keep Hebrew chars
        .split(/\s+/)
        .filter(t => t.length > 1)
    )
  }

  const t1 = tokenize(str1)
  const t2 = tokenize(str2)

  if (t1.size === 0 || t2.size === 0) return 0

  let intersection = 0
  for (const token of t1) {
    if (t2.has(token)) intersection++
  }

  const minSize = Math.min(t1.size, t2.size)
  return intersection / minSize
}

function fuzzyMatch(vendorName: string, txDescription: string): number {
  // Use multiple algorithms and take the best
  const trigram = trigramSimilarity(vendorName, txDescription)
  const levenshtein = levenshteinSimilarity(vendorName, txDescription)
  const tokenOverlap = tokenOverlapSimilarity(vendorName, txDescription)

  // Weight: token overlap is most reliable for vendor names
  const combined = (trigram * 0.3) + (levenshtein * 0.3) + (tokenOverlap * 0.4)

  return combined
}

// ========================================
// MAIN VENDOR SCORING FUNCTION
// ========================================
interface VendorMatchResult {
  points: number        // 0-15
  penalty: number       // 0 to -10
  method: 'user_alias' | 'fuzzy' | 'none'
  confidence: number    // 0-100
  matchedAlias?: VendorAlias
  suggestAlias?: boolean  // Suggest adding this as alias
}

export function scoreVendor(
  lineItem: InvoiceRow,
  invoice: Invoice | null,
  transaction: Transaction,
  userAliases: VendorAlias[]  // Loaded from Settings - 100% user-editable
): VendorMatchResult {
  const vendorName = invoice?.vendor_name || lineItem.description || ''
  const txDescription = transaction.description || ''

  if (!vendorName || !txDescription) {
    return { points: 0, penalty: 0, method: 'none', confidence: 0 }
  }

  // TIER 1: Check user aliases (from Settings - all editable)
  const userAliasMatch = checkUserAliases(vendorName, txDescription, userAliases)
  if (userAliasMatch) {
    return {
      points: 15,
      penalty: 0,
      method: 'user_alias',
      confidence: 95,
      matchedAlias: userAliasMatch.alias
    }
  }

  // TIER 2: Fuzzy matching (fallback)
  const fuzzyScore = fuzzyMatch(vendorName, txDescription)

  if (fuzzyScore >= 0.8) {
    return {
      points: 15,
      penalty: 0,
      method: 'fuzzy',
      confidence: Math.round(fuzzyScore * 100),
      suggestAlias: false  // Already similar enough
    }
  }

  if (fuzzyScore >= 0.6) {
    return {
      points: 10,
      penalty: 0,
      method: 'fuzzy',
      confidence: Math.round(fuzzyScore * 100),
      suggestAlias: true  // Good match - suggest adding alias
    }
  }

  if (fuzzyScore >= 0.4) {
    return {
      points: 5,
      penalty: 0,
      method: 'fuzzy',
      confidence: Math.round(fuzzyScore * 100),
      suggestAlias: true
    }
  }

  // No match - apply penalty (reduced because we're not confident)
  // Penalty is -5 to -10 (not -25) because:
  // 1. Payments often go through different entities (personal vs company)
  // 2. We're not confident in our vendor matching ability
  const penalty = fuzzyScore < 0.2 ? -10 : -5

  return {
    points: 0,
    penalty,
    method: 'none',
    confidence: Math.round(fuzzyScore * 100),
    suggestAlias: true  // Suggest adding alias after manual match
  }
}
```

---

## 5. Edge Cases

### 5.1 Foreign Currency Matching

```typescript
function handleForeignCurrency(
  lineItem: InvoiceRow,
  transaction: Transaction
): { matches: boolean; score: number } {
  // Line item is in foreign currency
  if (lineItem.currency && lineItem.currency !== 'ILS') {
    // Check if transaction has matching foreign currency
    if (transaction.foreign_currency === lineItem.currency) {
      const lineAmount = Math.abs(lineItem.total_amount || 0)
      const foreignAmount = Math.abs(transaction.foreign_amount || 0)

      const diff = Math.abs(lineAmount - foreignAmount)
      const percentDiff = lineAmount > 0 ? (diff / lineAmount) * 100 : 100

      if (percentDiff <= 2) {
        return { matches: true, score: 25 }
      }
      if (percentDiff <= 5) {
        return { matches: true, score: 18 }
      }
    }
  }

  return { matches: false, score: 0 }
}
```

### 5.2 VAT Variations

```typescript
const VAT_RATES = [0.17, 0.18, 0.16, 0.15] // Israel VAT rates over time

function tryVatAdjustedMatch(
  lineAmount: number,
  txAmount: number
): { matches: boolean; rate: number; direction: 'add' | 'remove' } | null {
  for (const rate of VAT_RATES) {
    // Try adding VAT
    const withVat = lineAmount * (1 + rate)
    if (Math.abs(txAmount - withVat) <= lineAmount * 0.02) {
      return { matches: true, rate, direction: 'add' }
    }

    // Try removing VAT
    const withoutVat = lineAmount / (1 + rate)
    if (Math.abs(txAmount - withoutVat) <= lineAmount * 0.02) {
      return { matches: true, rate, direction: 'remove' }
    }
  }

  return null
}
```

### 5.3 Billing Period Check

```typescript
function isTransactionInBillingPeriod(
  transaction: Transaction,
  extractedData: InvoiceExtraction | null
): boolean {
  if (!extractedData?.document?.billing_period) return false

  const { start, end } = extractedData.document.billing_period
  if (!start || !end) return false

  const txDate = new Date(transaction.date)
  const periodStart = new Date(start)
  const periodEnd = new Date(end)

  return txDate >= periodStart && txDate <= periodEnd
}
```

### 5.4 Already Allocated Transactions

```typescript
async function getTransactionRemainingAmount(
  transactionId: string
): Promise<number> {
  const { data: transaction } = await supabase
    .from('transactions')
    .select('amount_agorot')
    .eq('id', transactionId)
    .single()

  if (!transaction) return 0

  const { data: linkedItems } = await supabase
    .from('invoice_rows')
    .select('allocation_amount, total_amount')
    .eq('transaction_id', transactionId)

  // Use nullish coalescing (??) to handle explicit 0 values correctly
  // allocation_amount of 0 means nothing allocated, so don't fall back to total_amount
  const totalAllocated = (linkedItems || []).reduce((sum, item) => {
    return sum + Math.abs(item.allocation_amount ?? item.total_amount ?? 0)
  }, 0)

  const txAmount = Math.abs(transaction.amount_agorot)
  return Math.max(0, txAmount - totalAllocated)
}

function isFullyAllocated(remainingAmount: number): boolean {
  return remainingAmount === 0
}
```

### 5.5 Partial Payments

```typescript
interface PartialPaymentAnalysis {
  isPartial: boolean
  allocatedAmount: number
  remainingAmount: number
  allocationPercentage: number
  warning?: string
}

function analyzePartialPayment(
  lineItemAmount: number,
  transactionAmount: number
): PartialPaymentAnalysis {
  const lineAbs = Math.abs(lineItemAmount)
  const txAbs = Math.abs(transactionAmount)

  if (lineAbs <= txAbs) {
    return {
      isPartial: false,
      allocatedAmount: lineAbs,
      remainingAmount: txAbs - lineAbs,
      allocationPercentage: 100,
    }
  }

  // Line item is larger than transaction - partial payment
  const percentage = (txAbs / lineAbs) * 100

  return {
    isPartial: true,
    allocatedAmount: txAbs,
    remainingAmount: lineAbs - txAbs,
    allocationPercentage: percentage,
    warning: `This covers only ${percentage.toFixed(0)}% of the line item amount`,
  }
}
```

### 5.6 Auto-Matcher Service Types

```typescript
// src/lib/services/lineItemMatcher/types.ts

// Result for a single line item match attempt
export interface LineItemMatchResult {
  lineItemId: string
  lineItem: InvoiceRow
  bestMatch: {
    transaction: Transaction
    score: MatchScore
    confidence: number  // 0-100
  } | null
  candidates: Array<{
    transaction: Transaction
    score: MatchScore
    confidence: number
  }>
  status: 'auto_matched' | 'candidate' | 'no_match'
  matchMethod?: 'manual' | 'auto_approved' | 'auto_matched' | 'candidate'
}

// Result for batch invoice matching
export interface AutoMatchInvoiceResult {
  invoiceId: string
  totalLineItems: number
  results: LineItemMatchResult[]
  summary: {
    autoMatched: number    // High confidence matches (85%+)
    candidates: number     // Medium confidence (50-84%)
    noMatch: number        // No good matches found
  }
}

// Function signature for autoMatchInvoice
export async function autoMatchInvoice(
  invoiceId: string,
  options?: {
    autoApproveThreshold?: number  // Default: 85
    candidateThreshold?: number    // Default: 50
  }
): Promise<AutoMatchInvoiceResult>
```

---

## 6. Implementation Tasks

### Phase 1: Database & Types (Week 1)

| Task | Priority | Dependencies | Est. Hours |
|------|----------|--------------|------------|
| 1.1 Create vendor_aliases migration | High | None | 2 |
| 1.2 Add TypeScript types for VendorAlias | High | 1.1 | 1 |
| 1.3 Create useVendorAliases hook | High | 1.2 | 3 |
| 1.4 Create vendor alias CRUD API | High | 1.3 | 4 |
| 1.5 Create seed_default_aliases function | Medium | 1.1 | 1 |

### Phase 2: Settings UI (Week 1-2)

| Task | Priority | Dependencies | Est. Hours |
|------|----------|--------------|------------|
| 2.1 Create VendorAliasesSection component | High | 1.4 | 4 |
| 2.2 Create VendorAliasModal component | High | 2.1 | 3 |
| 2.3 Add to Settings page Rules tab | High | 2.1, 2.2 | 2 |
| 2.4 Add validation & error handling | Medium | 2.3 | 2 |
| 2.5 Add search/filter functionality | Low | 2.3 | 2 |

### Phase 3: Scoring Algorithm (Week 2)

| Task | Priority | Dependencies | Est. Hours |
|------|----------|--------------|------------|
| 3.1 Create scorer.ts with main scoreMatch function | High | 1.4 | 4 |
| 3.2 Implement scoreReference function | High | 3.1 | 2 |
| 3.3 Implement scoreAmount function (with VAT) | High | 3.1 | 3 |
| 3.4 Implement scoreDate function | High | 3.1 | 2 |
| 3.5 Implement scoreCurrency function | Medium | 3.1 | 1 |
| 3.6 Implement scoreContext function | Medium | 3.1 | 2 |

### Phase 4: Vendor Matching (Week 2-3)

| Task | Priority | Dependencies | Est. Hours |
|------|----------|--------------|------------|
| 4.1 Create vendorMatcher.ts | High | 1.4 | 2 |
| 4.2 Implement user aliases lookup (Tier 1) | High | 4.1, 1.4 | 3 |
| 4.3 Implement trigram similarity (Tier 2) | High | 4.1 | 3 |
| 4.4 Implement Levenshtein (Tier 2) | Medium | 4.1 | 2 |
| 4.5 Implement token overlap (Tier 2) | Medium | 4.1 | 2 |
| 4.6 Combine into scoreVendor function | High | 4.2-4.5 | 2 |
| 4.7 Implement alias suggestion from manual match | Medium | 4.6 | 2 |

### Phase 5: Auto-Matching Service (Week 3)

| Task | Priority | Dependencies | Est. Hours |
|------|----------|--------------|------------|
| 5.1 Create autoMatcher.ts service | High | 3.1-3.6, 4.7 | 4 |
| 5.2 Implement getMatchCandidates | High | 5.1 | 4 |
| 5.3 Implement autoMatchLineItem | High | 5.2 | 3 |
| 5.4 Implement autoMatchInvoice (batch) | High | 5.3 | 3 |
| 5.5 Implement hard filters (expenses only) | High | 5.1 | 2 |
| 5.6 Handle foreign currency edge case | Medium | 5.1 | 2 |
| 5.7 Handle VAT variations | Medium | 5.1 | 2 |
| 5.8 Handle partial payments | Medium | 5.1 | 3 |

### Phase 6: UI Integration (Week 4)

| Task | Priority | Dependencies | Est. Hours |
|------|----------|--------------|------------|
| 6.1 Update LineItemLinkModal with new scoring | High | 5.1 | 4 |
| 6.2 Add confidence breakdown display | High | 6.1 | 2 |
| 6.3 Add "Auto-Match All" button to Invoice view | High | 5.4 | 3 |
| 6.4 Add match review panel for candidates | High | 5.4 | 4 |
| 6.5 Add score explanations in UI | Medium | 6.2 | 2 |
| 6.6 Add vendor alias suggestions from matches | Medium | 4.3, 6.1 | 3 |

### Phase 7: Testing & Refinement (Week 4-5)

| Task | Priority | Dependencies | Est. Hours |
|------|----------|--------------|------------|
| 7.1 Unit tests for scorer functions | High | 3.1-3.6 | 4 |
| 7.2 Unit tests for vendor matcher | High | 4.1-4.7 | 4 |
| 7.3 Integration tests for auto-matching | High | 5.1-5.8 | 4 |
| 7.4 Test with real user data | Critical | 7.1-7.3 | 6 |
| 7.5 Performance optimization | Medium | 7.4 | 4 |
| 7.6 Error handling & edge cases | High | 7.4 | 3 |
| 7.7 Documentation | Medium | 7.4 | 2 |

---

## 7. Testing Strategy

### 7.1 Unit Tests

```typescript
// tests/lib/services/lineItemMatcher/scorer.test.ts

describe('scoreMatch', () => {
  describe('Hard Filters', () => {
    it('should disqualify income transactions', () => {
      const tx = createTransaction({ is_income: true })
      const result = scoreMatch(tx, mockContext)
      expect(result.isDisqualified).toBe(true)
      expect(result.disqualifyReason).toContain('income')
    })

    it('should disqualify bank_cc_charge transactions', () => {
      const tx = createTransaction({ transaction_type: 'bank_cc_charge' })
      const result = scoreMatch(tx, mockContext)
      expect(result.isDisqualified).toBe(true)
    })

    it('should allow bank_regular expense transactions', () => {
      const tx = createTransaction({
        is_income: false,
        transaction_type: 'bank_regular'
      })
      const result = scoreMatch(tx, mockContext)
      expect(result.isDisqualified).toBe(false)
    })
  })

  describe('Reference Scoring', () => {
    it('should give 45 points for exact reference match', () => {
      const lineItem = createLineItem({ reference_id: 'INV-2024-001' })
      const tx = createTransaction({ reference: 'INV-2024-001' })
      const result = scoreMatch(tx, { ...mockContext, lineItem })
      expect(result.breakdown.reference).toBe(45)
    })

    it('should give 40 points for reference in description', () => {
      const lineItem = createLineItem({ reference_id: 'INV-2024-001' })
      const tx = createTransaction({
        description: 'Payment for INV-2024-001'
      })
      const result = scoreMatch(tx, { ...mockContext, lineItem })
      expect(result.breakdown.reference).toBe(40)
    })
  })

  describe('Amount Scoring', () => {
    it('should give 25 points for exact amount match', () => {
      const lineItem = createLineItem({ total_amount: 10000 })
      const tx = createTransaction({ amount_agorot: -10000 })
      const result = scoreMatch(tx, { ...mockContext, lineItem })
      expect(result.breakdown.amount).toBe(25)
    })

    it('should give 15 points for VAT-adjusted match (17%)', () => {
      const lineItem = createLineItem({ total_amount: 10000 })
      const tx = createTransaction({ amount_agorot: -11700 }) // 10000 * 1.17
      const result = scoreMatch(tx, { ...mockContext, lineItem })
      expect(result.breakdown.amount).toBe(15)
    })

    it('should handle foreign currency matching', () => {
      const lineItem = createLineItem({
        total_amount: 10000,
        currency: 'USD'
      })
      const tx = createTransaction({
        amount_agorot: -37000,
        foreign_amount: 10000,
        foreign_currency: 'USD'
      })
      const result = scoreMatch(tx, { ...mockContext, lineItem })
      expect(result.breakdown.amount).toBeGreaterThan(0)
    })
  })

  describe('Vendor Scoring', () => {
    it('should give 15 points for user alias match', () => {
      const context = {
        ...mockContext,
        invoice: createInvoice({ vendor_name: 'Meta Platforms' }),
        vendorAliases: [
          { alias_pattern: 'FACEBK', canonical_name: 'Meta', match_type: 'contains' }
        ]
      }
      const tx = createTransaction({ description: 'FACEBK*ADS' })
      const result = scoreMatch(tx, context)
      expect(result.breakdown.vendor).toBe(15)
    })

    it('should apply -5 to -10 penalty for vendor mismatch', () => {
      const context = {
        ...mockContext,
        invoice: createInvoice({ vendor_name: 'Microsoft' })
      }
      const tx = createTransaction({ description: 'APPLE STORE' })
      const result = scoreMatch(tx, context)
      expect(result.penalties.vendorMismatch).toBeLessThan(0)
      expect(result.penalties.vendorMismatch).toBeGreaterThanOrEqual(-10)
    })
  })
})
```

### 7.2 Integration Tests

```typescript
// tests/lib/services/lineItemMatcher/autoMatcher.integration.test.ts

describe('autoMatchInvoice', () => {
  beforeEach(async () => {
    await seedTestData()
  })

  it('should match Meta invoice line items to FACEBK transactions', async () => {
    const invoice = await createTestInvoice({
      vendor_name: 'Meta Platforms',
      line_items: [
        { description: 'Advertising', total_amount: 150000, reference_id: 'FB-001' }
      ]
    })

    await createTestTransaction({
      description: 'FACEBK*ADS FB-001',
      amount_agorot: -150000,
      is_income: false,
      transaction_type: 'cc_purchase'
    })

    const result = await autoMatchInvoice(invoice.id)

    expect(result.autoMatched).toBe(1)
    expect(result.results[0].bestMatch?.confidence).toBeGreaterThan(90)
  })

  it('should not match income transactions', async () => {
    const invoice = await createTestInvoice({
      vendor_name: 'Test Vendor',
      line_items: [
        { description: 'Service', total_amount: 10000 }
      ]
    })

    await createTestTransaction({
      description: 'Test Vendor Payment',
      amount_agorot: 10000, // Positive = income
      is_income: true,
      transaction_type: 'bank_regular'
    })

    const result = await autoMatchInvoice(invoice.id)

    expect(result.autoMatched).toBe(0)
    expect(result.noMatch).toBe(1)
  })

  it('should mark manual matches as 100% confidence', async () => {
    const invoice = await createTestInvoice({
      vendor_name: 'Some Vendor',
      line_items: [
        { description: 'Service', total_amount: 10000 }
      ]
    })

    const tx = await createTestTransaction({
      description: 'COMPLETELY DIFFERENT NAME',
      amount_agorot: -10000,
      is_income: false,
      transaction_type: 'bank_regular'
    })

    // Manual link - should always be 100%
    await linkLineItemToTransaction(invoice.line_items[0].id, tx.id, {
      matchMethod: 'manual'
    })

    const lineItem = await getLineItem(invoice.line_items[0].id)
    expect(lineItem.match_confidence).toBe(100)
    expect(lineItem.match_method).toBe('manual')
  })

  it('should handle Hebrew vendor names with fuzzy matching', async () => {
    const invoice = await createTestInvoice({
      vendor_name: 'חברת תוכנה בע"מ',
      line_items: [
        { description: 'שירותי תוכנה', total_amount: 50000 }
      ]
    })

    await createTestTransaction({
      description: 'חברת תוכנה - חשבון',
      amount_agorot: -50000,
      is_income: false,
      transaction_type: 'bank_regular'
    })

    const result = await autoMatchInvoice(invoice.id)

    // Should find at least one candidate match based on fuzzy vendor matching
    expect(result.summary.candidates + result.summary.autoMatched).toBeGreaterThanOrEqual(1)
  })
})
```

### 7.3 Test Data Scenarios

| Scenario | Invoice Vendor | Line Item | Transaction | Expected Score |
|----------|---------------|-----------|-------------|----------------|
| Perfect Match | "Google LLC" | ref: "INV-001", 1000 ILS | desc: "GOOG INV-001", -1000 ILS | 100% |
| Reference Only | "Google LLC" | ref: "INV-001", 1000 ILS | desc: "PAYMENT", ref: "INV-001", -1000 ILS | 85% |
| Amount+Date | "Google LLC" | 1000 ILS, 2024-01-15 | -1000 ILS, 2024-01-15 | 75% |
| VAT Adjusted | "Google LLC" | 1000 ILS (no VAT) | -1170 ILS (incl VAT) | 70% |
| User Alias Match | "Meta Platforms" | 500 ILS | "FACEBK*ADS", -500 ILS (with FACEBK→Meta alias) | 80% |
| Manual Match | Any | Any | Any | **100%** (always) |
| Fuzzy Vendor | "חברת ABC" | 2000 ILS | "ABC חברה", -2000 ILS | 65% |
| Date Mismatch | "Google LLC" | 1000 ILS, 2024-01-15 | -1000 ILS, 2024-01-25 | 45% |
| Vendor Mismatch | "Google LLC" | 1000 ILS | "APPLE STORE", -1000 ILS | 35% |
| Income TX | "Google LLC" | 1000 ILS | +1000 ILS (income) | DISQUALIFIED |
| CC Charge | "Google LLC" | 1000 ILS | bank_cc_charge | DISQUALIFIED |

### 7.4 Performance Benchmarks

| Operation | Target | Measured |
|-----------|--------|----------|
| Score single match | < 5ms | TBD |
| Find candidates (1 line item) | < 100ms | TBD |
| Auto-match invoice (10 items) | < 2s | TBD |
| Auto-match invoice (50 items) | < 5s | TBD |
| Bulk match (100 invoices) | < 30s | TBD |

---

## 8. Configuration & Thresholds

### 8.1 User-Configurable Thresholds

Add to Settings page under Rules tab:

```typescript
interface MatchingThresholds {
  // Auto-approve matches above this score
  autoApproveThreshold: number  // Default: 85

  // Show as candidate above this score
  candidateThreshold: number     // Default: 50

  // Date tolerance in days
  dateToleranceDays: number      // Default: 7

  // Amount tolerance percentage
  amountTolerancePercent: number // Default: 5
}
```

### 8.2 Scoring Weight Adjustments

For advanced users, expose scoring weights:

```typescript
interface ScoringWeights {
  reference: number    // Default: 45
  amount: number       // Default: 25
  date: number         // Default: 15
  vendor: number       // Default: 15
  currency: number     // Default: 5
  context: number      // Default: 5
  vendorMismatchPenalty: number // Default: -10
}
```

---

## Summary

This implementation plan provides a comprehensive approach to matching invoice line items to transactions with:

1. **Manual Match is King**: User manual connections are ALWAYS 100% confidence - the strongest signal
2. **Expenses-Only Focus**: Hard filter ensures we only match to expense transactions
3. **100% User-Editable Aliases**: ALL aliases in Settings are fully editable (add/edit/delete)
   - Default aliases seeded for new users (Meta, Google, Amazon, etc.)
   - Users can customize or delete ANY alias (max 100 per user)
   - Learn new aliases from manual matches
4. **Reduced Vendor Penalty**: -5 to -10 instead of -25, acknowledging uncertainty
5. **Multi-Signal Auto-Scoring**: Reference (45), Amount (25), Date (15), Vendor (15), Currency (5), Context (5)
6. **2-Tier Vendor Matching**: User Aliases (from Settings) → Fuzzy (trigram + Levenshtein)
7. **Edge Case Handling**: Foreign currency, VAT variations, billing periods, partial payments
8. **Currency-Agnostic Amounts**: All amounts stored as integers in smallest currency unit (agorot/cents), with `currency` field determining the unit interpretation

### Key Principles
- **Manual > Auto**: User decisions always override auto-matching
- **User Control**: All aliases editable, all matches can be undone
- **Learn from Users**: Suggest adding aliases from manual matches
- **Low False Positives**: Reduced vendor penalty, conservative matching

Total estimated implementation time: **4-5 weeks** with a single developer.
