-- Migration: Add line item matching support
-- This migration adds columns to invoice_rows for tracking matches to bank/CC transactions
-- and indexes for efficient matching queries.

-- =============================================================================
-- STEP 1: Add match tracking columns to invoice_rows
-- =============================================================================

-- Match status: tracks the state of the match
ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS match_status TEXT DEFAULT 'unmatched'
CHECK (match_status IN ('unmatched', 'matched', 'partial', 'manual'));

-- Match confidence: how confident we are about the match (0-100)
ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,2);

-- Match method: how the match was made
ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS match_method TEXT
CHECK (match_method IN ('manual', 'rule_reference', 'rule_amount_date', 'rule_fuzzy', 'ai_assisted'));

-- Matched at: timestamp when the match was made
ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;

-- =============================================================================
-- STEP 2: Create indexes for efficient matching queries
-- =============================================================================

-- Index for finding unmatched line items by date and amount
CREATE INDEX IF NOT EXISTS idx_invoice_rows_unmatched
ON invoice_rows(transaction_date, total_agorot)
WHERE transaction_id IS NULL;

-- Index for finding line items by match status
CREATE INDEX IF NOT EXISTS idx_invoice_rows_match_status
ON invoice_rows(match_status)
WHERE match_status != 'matched';

-- Index for finding line items by reference_id (for billing summary matching)
CREATE INDEX IF NOT EXISTS idx_invoice_rows_reference_id
ON invoice_rows(reference_id)
WHERE reference_id IS NOT NULL;

-- Index for finding matchable transactions (bank_regular and cc_purchase)
CREATE INDEX IF NOT EXISTS idx_transactions_matchable
ON transactions(date, amount_agorot, transaction_type)
WHERE transaction_type IN ('bank_regular', 'cc_purchase');

-- Index for finding transactions by linked line items
CREATE INDEX IF NOT EXISTS idx_invoice_rows_transaction_id
ON invoice_rows(transaction_id)
WHERE transaction_id IS NOT NULL;

-- =============================================================================
-- STEP 3: Comments for documentation
-- =============================================================================

COMMENT ON COLUMN invoice_rows.match_status IS
  'Status of transaction matching: unmatched (not linked), matched (fully linked), partial (partially allocated), manual (manually linked)';

COMMENT ON COLUMN invoice_rows.match_confidence IS
  'Confidence score (0-100) for automatic matching. NULL for manual matches.';

COMMENT ON COLUMN invoice_rows.match_method IS
  'How the match was made: manual, rule_reference (reference ID match), rule_amount_date (amount+date match), rule_fuzzy (fuzzy matching), ai_assisted (AI disambiguation)';

COMMENT ON COLUMN invoice_rows.matched_at IS
  'Timestamp when the line item was matched to a transaction';
