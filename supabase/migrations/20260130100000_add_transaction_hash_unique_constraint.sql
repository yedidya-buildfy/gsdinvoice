-- Migration: Add unique constraint on transaction hash for duplicate prevention
-- This ensures duplicates cannot be inserted at the database level
-- and allows efficient upsert operations with ON CONFLICT

-- =============================================================================
-- STEP 1: Clean up existing duplicates (keep the earliest entry)
-- =============================================================================

-- First, let's create a temp table to identify duplicates
-- We keep the row with the earliest created_at (or smallest id if created_at is the same)
WITH duplicates AS (
  SELECT
    id,
    hash,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, hash
      ORDER BY created_at ASC, id ASC
    ) as rn
  FROM transactions
  WHERE hash IS NOT NULL
)
DELETE FROM transactions
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Log how many duplicates were removed (for audit purposes)
DO $$
DECLARE
  removed_count INTEGER;
BEGIN
  GET DIAGNOSTICS removed_count = ROW_COUNT;
  RAISE NOTICE 'Removed % duplicate transactions', removed_count;
END $$;

-- =============================================================================
-- STEP 2: Create unique constraint on (user_id, hash)
-- =============================================================================

-- The constraint is on (user_id, hash) because:
-- 1. Different users might have the same transaction hash (same bank statement)
-- 2. We only want to prevent duplicates within the same user's data
-- 3. This allows efficient upsert operations per user

-- First, create a unique index (which also serves as the constraint)
-- Using a partial index to ignore rows with NULL hash (older data or special cases)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_hash_unique
ON transactions(user_id, hash)
WHERE hash IS NOT NULL;

-- =============================================================================
-- STEP 3: Create a regular index for fast hash lookups (if not exists)
-- =============================================================================

-- This index helps with the batch duplicate checking currently in use
-- as a fallback for clients that don't support upsert
CREATE INDEX IF NOT EXISTS idx_transactions_hash
ON transactions(hash)
WHERE hash IS NOT NULL;

-- =============================================================================
-- STEP 4: Add documentation
-- =============================================================================

COMMENT ON INDEX idx_transactions_user_hash_unique IS
  'Unique constraint on (user_id, hash) to prevent duplicate transactions. Use upsert with ON CONFLICT DO NOTHING for efficient duplicate handling.';

COMMENT ON INDEX idx_transactions_hash IS
  'Index for fast hash lookups during batch duplicate checking.';
