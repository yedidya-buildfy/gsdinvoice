-- Migration: Add indexes for optimized linking modal queries
-- Improves performance of transaction filtering in InvoiceBankLinkModal

-- Enable trigram extension for text search (ILIKE optimization)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Composite index for linking modal queries
-- Covers: user_id (equality) + transaction_type (equality) + date (range)
-- Partial index for only matchable transaction types
CREATE INDEX IF NOT EXISTS idx_transactions_linking_modal
ON transactions(user_id, transaction_type, date DESC)
WHERE transaction_type IN ('bank_regular', 'cc_purchase');

-- Trigram index for ILIKE description search
-- Enables efficient partial text matching on Hebrew/English descriptions
CREATE INDEX IF NOT EXISTS idx_transactions_description_trgm
ON transactions USING gin (description gin_trgm_ops);

-- Add comments for documentation
COMMENT ON INDEX idx_transactions_linking_modal IS
  'Optimized for InvoiceBankLinkModal queries filtering by user, type, and date range';

COMMENT ON INDEX idx_transactions_description_trgm IS
  'Trigram index for efficient ILIKE text search on transaction descriptions';
