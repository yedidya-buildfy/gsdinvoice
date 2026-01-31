-- =============================================================================
-- Utility script to analyze and clean up duplicate transactions
-- Run this in the Supabase SQL Editor
-- =============================================================================

-- =============================================================================
-- STEP 1: ANALYZE - Count and preview duplicates (READ ONLY)
-- =============================================================================

-- Count total transactions
SELECT 'Total transactions' as metric, COUNT(*) as count
FROM transactions;

-- Count transactions with hash
SELECT 'Transactions with hash' as metric, COUNT(*) as count
FROM transactions
WHERE hash IS NOT NULL;

-- Count transactions without hash (legacy data)
SELECT 'Transactions without hash' as metric, COUNT(*) as count
FROM transactions
WHERE hash IS NULL;

-- Find duplicate hashes and count how many duplicates exist
SELECT 'Duplicate hash groups' as metric, COUNT(*) as count
FROM (
  SELECT user_id, hash
  FROM transactions
  WHERE hash IS NOT NULL
  GROUP BY user_id, hash
  HAVING COUNT(*) > 1
) as duplicate_groups;

-- Total duplicate rows (rows that would be deleted)
SELECT 'Total duplicate rows to remove' as metric, COALESCE(SUM(duplicate_count - 1), 0) as count
FROM (
  SELECT user_id, hash, COUNT(*) as duplicate_count
  FROM transactions
  WHERE hash IS NOT NULL
  GROUP BY user_id, hash
  HAVING COUNT(*) > 1
) as duplicates;

-- Preview duplicates with details (limited to 50)
SELECT
  t.user_id,
  t.hash,
  t.date,
  t.description,
  t.amount_agorot / 100.0 as amount,
  t.created_at,
  t.id,
  d.duplicate_count
FROM transactions t
JOIN (
  SELECT user_id, hash, COUNT(*) as duplicate_count
  FROM transactions
  WHERE hash IS NOT NULL
  GROUP BY user_id, hash
  HAVING COUNT(*) > 1
) d ON t.user_id = d.user_id AND t.hash = d.hash
ORDER BY t.hash, t.created_at
LIMIT 50;

-- =============================================================================
-- STEP 2: CLEANUP - Remove duplicates (UNCOMMENT TO RUN)
-- =============================================================================

-- CAUTION: This will DELETE data. Review the analysis above first!
-- Keeps the earliest entry (by created_at, then by id)

/*
-- Delete duplicate transactions, keeping the earliest one
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
*/

-- =============================================================================
-- STEP 3: VERIFY - Check results after cleanup
-- =============================================================================

/*
-- After running cleanup, verify no duplicates remain
SELECT
  'Remaining duplicate groups' as metric,
  COUNT(*) as count
FROM (
  SELECT user_id, hash
  FROM transactions
  WHERE hash IS NOT NULL
  GROUP BY user_id, hash
  HAVING COUNT(*) > 1
) as remaining_duplicates;

-- Count total transactions after cleanup
SELECT 'Total transactions after cleanup' as metric, COUNT(*) as count
FROM transactions;
*/

-- =============================================================================
-- STEP 4: CREATE UNIQUE CONSTRAINT (if not exists from migration)
-- =============================================================================

/*
-- Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_hash_unique
ON transactions(user_id, hash)
WHERE hash IS NOT NULL;

-- Create index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_transactions_hash
ON transactions(hash)
WHERE hash IS NOT NULL;
*/
