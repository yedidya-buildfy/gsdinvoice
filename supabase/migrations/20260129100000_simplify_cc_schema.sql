-- Migration: Simplify CC/Bank transaction schema
-- This migration adds new columns to the transactions table to support a unified
-- model where CC purchases are stored directly in the transactions table with
-- a parent_bank_charge_id linking them to their bank charge.

-- =============================================================================
-- STEP 1: Add new columns to transactions table
-- =============================================================================

-- Transaction type: distinguishes bank transactions from CC purchases
-- - 'bank_regular': Normal bank transaction (not a CC charge)
-- - 'bank_cc_charge': Bank transaction that is a credit card charge
-- - 'cc_purchase': Individual CC purchase (from CC statement)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS transaction_type TEXT
CHECK (transaction_type IN ('bank_regular', 'bank_cc_charge', 'cc_purchase'));

-- Credit card ID - references which credit card this transaction belongs to
-- Replaces linked_credit_card_id for a cleaner naming convention
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS credit_card_id UUID REFERENCES credit_cards(id) ON DELETE SET NULL;

-- Parent bank charge ID - self-referencing FK
-- For CC purchases, this links to the bank_cc_charge transaction that paid for them
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS parent_bank_charge_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

-- Match confidence - how confident we are about the CC-to-bank matching
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,2);

-- =============================================================================
-- STEP 2: Migrate existing data
-- =============================================================================

-- Set transaction_type based on existing flags
UPDATE transactions
SET transaction_type = CASE
  WHEN is_credit_card_charge = true THEN 'bank_cc_charge'
  WHEN linked_credit_card_id IS NOT NULL AND is_credit_card_charge = false THEN 'cc_purchase'
  ELSE 'bank_regular'
END
WHERE transaction_type IS NULL;

-- Copy linked_credit_card_id to credit_card_id
UPDATE transactions
SET credit_card_id = linked_credit_card_id
WHERE linked_credit_card_id IS NOT NULL
  AND credit_card_id IS NULL;

-- =============================================================================
-- STEP 3: Create indexes for efficient queries
-- =============================================================================

-- Index for filtering by transaction type
CREATE INDEX IF NOT EXISTS idx_transactions_type
ON transactions(transaction_type);

-- Index for finding CC purchases by their parent bank charge
CREATE INDEX IF NOT EXISTS idx_transactions_parent_bank_charge
ON transactions(parent_bank_charge_id)
WHERE parent_bank_charge_id IS NOT NULL;

-- Index for finding transactions by credit card
CREATE INDEX IF NOT EXISTS idx_transactions_credit_card
ON transactions(credit_card_id)
WHERE credit_card_id IS NOT NULL;

-- Composite index for CC charge matching queries
CREATE INDEX IF NOT EXISTS idx_transactions_cc_charge_lookup
ON transactions(user_id, transaction_type, date)
WHERE transaction_type = 'bank_cc_charge';

-- Composite index for CC purchases by card and charge date
CREATE INDEX IF NOT EXISTS idx_transactions_cc_purchases
ON transactions(credit_card_id, date)
WHERE transaction_type = 'cc_purchase';

-- =============================================================================
-- STEP 4: Update cc_bank_match_results table
-- =============================================================================

-- Rename bank_transaction_id to bank_charge_id for clarity
-- Note: This is done by adding a new column and migrating data
-- to avoid issues with existing foreign key constraints

ALTER TABLE cc_bank_match_results
ADD COLUMN IF NOT EXISTS bank_charge_id UUID REFERENCES transactions(id) ON DELETE CASCADE;

-- Migrate existing data from bank_transaction_id to bank_charge_id
UPDATE cc_bank_match_results
SET bank_charge_id = bank_transaction_id
WHERE bank_charge_id IS NULL
  AND bank_transaction_id IS NOT NULL;

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_match_results_bank_charge
ON cc_bank_match_results(bank_charge_id)
WHERE bank_charge_id IS NOT NULL;

-- =============================================================================
-- STEP 5: Add constraint for self-referencing consistency
-- =============================================================================

-- Ensure parent_bank_charge_id only links to bank_cc_charge transactions
-- This is enforced via a trigger since CHECK constraints can't reference other rows

CREATE OR REPLACE FUNCTION check_parent_bank_charge_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_bank_charge_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM transactions
      WHERE id = NEW.parent_bank_charge_id
        AND transaction_type = 'bank_cc_charge'
    ) THEN
      RAISE EXCEPTION 'parent_bank_charge_id must reference a transaction with type bank_cc_charge';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_parent_bank_charge_type ON transactions;
CREATE TRIGGER trg_check_parent_bank_charge_type
  BEFORE INSERT OR UPDATE OF parent_bank_charge_id ON transactions
  FOR EACH ROW
  WHEN (NEW.parent_bank_charge_id IS NOT NULL)
  EXECUTE FUNCTION check_parent_bank_charge_type();

-- =============================================================================
-- COMMENTS for documentation
-- =============================================================================

COMMENT ON COLUMN transactions.transaction_type IS
  'Type of transaction: bank_regular (normal bank tx), bank_cc_charge (CC payment in bank), cc_purchase (individual CC purchase)';

COMMENT ON COLUMN transactions.credit_card_id IS
  'Reference to the credit card for CC-related transactions';

COMMENT ON COLUMN transactions.parent_bank_charge_id IS
  'For cc_purchase: links to the bank_cc_charge transaction that this purchase was paid with';

COMMENT ON COLUMN transactions.match_confidence IS
  'Confidence score (0-100) for automatic CC-to-bank matching';

COMMENT ON COLUMN cc_bank_match_results.bank_charge_id IS
  'Reference to the bank CC charge transaction (new name for bank_transaction_id)';
