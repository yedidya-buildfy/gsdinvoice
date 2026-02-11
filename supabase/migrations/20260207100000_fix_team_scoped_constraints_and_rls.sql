-- ============================================================================
-- Fix 1: Transaction hash unique constraint - scope to team
-- ============================================================================

-- Drop the old user-only constraint
DROP INDEX IF EXISTS idx_transactions_user_hash_unique;

-- Create two partial indexes to handle NULL team_id correctly
-- PostgreSQL treats NULLs as distinct in unique indexes, so we need two indexes

-- For rows WITH a team_id: unique per (user_id, team_id, hash)
CREATE UNIQUE INDEX idx_transactions_user_team_hash_unique
ON transactions(user_id, team_id, hash)
WHERE hash IS NOT NULL AND team_id IS NOT NULL;

-- For rows WITHOUT team_id (legacy): unique per (user_id, hash)
CREATE UNIQUE INDEX idx_transactions_user_null_team_hash_unique
ON transactions(user_id, hash)
WHERE hash IS NOT NULL AND team_id IS NULL;

-- ============================================================================
-- Fix 2: Remove old permissive (USING true) policies on cc_bank_match_results
-- These override the team-scoped policies making them useless
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete cc_bank_match_results" ON cc_bank_match_results;
DROP POLICY IF EXISTS "Users can insert cc_bank_match_results" ON cc_bank_match_results;
DROP POLICY IF EXISTS "Users can view all cc_bank_match_results" ON cc_bank_match_results;
DROP POLICY IF EXISTS "Users can update cc_bank_match_results" ON cc_bank_match_results;

-- ============================================================================
-- Fix 3: credit_card_transactions - add team_id and proper team-scoped RLS
-- (Legacy table with 0 rows, but needs proper security)
-- ============================================================================

-- Add team_id column
ALTER TABLE credit_card_transactions
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

-- Create index for team queries
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_team
ON credit_card_transactions(team_id);

-- Drop old permissive policies
DROP POLICY IF EXISTS "Users can view all credit_card_transactions" ON credit_card_transactions;
DROP POLICY IF EXISTS "Users can insert credit_card_transactions" ON credit_card_transactions;
DROP POLICY IF EXISTS "Users can update credit_card_transactions" ON credit_card_transactions;
DROP POLICY IF EXISTS "Users can delete credit_card_transactions" ON credit_card_transactions;

-- Add team-scoped policies (same pattern as other data tables)
CREATE POLICY "Team members can view credit_card_transactions"
  ON credit_card_transactions FOR SELECT TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can insert credit_card_transactions"
  ON credit_card_transactions FOR INSERT TO authenticated
  WITH CHECK (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can update credit_card_transactions"
  ON credit_card_transactions FOR UPDATE TO authenticated
  WITH CHECK (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can delete credit_card_transactions"
  ON credit_card_transactions FOR DELETE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

-- ============================================================================
-- Fix 4: invoice_rows - replace open policy with team-scoped RLS via parent invoice
-- ============================================================================

-- Drop the wide-open policy
DROP POLICY IF EXISTS "Authenticated users full access" ON invoice_rows;

-- Team members can view invoice_rows if they can access the parent invoice
CREATE POLICY "Team members can view invoice_rows"
  ON invoice_rows FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_rows.invoice_id
      AND (invoices.team_id IS NULL OR is_active_team_member(invoices.team_id))
    )
  );

-- Team members can insert invoice_rows if they can access the parent invoice
CREATE POLICY "Team members can insert invoice_rows"
  ON invoice_rows FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_rows.invoice_id
      AND (invoices.team_id IS NULL OR is_active_team_member(invoices.team_id))
    )
  );

-- Team members can update invoice_rows if they can access the parent invoice
CREATE POLICY "Team members can update invoice_rows"
  ON invoice_rows FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_rows.invoice_id
      AND (invoices.team_id IS NULL OR is_active_team_member(invoices.team_id))
    )
  );

-- Team members can delete invoice_rows if they can access the parent invoice
CREATE POLICY "Team members can delete invoice_rows"
  ON invoice_rows FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_rows.invoice_id
      AND (invoices.team_id IS NULL OR is_active_team_member(invoices.team_id))
    )
  );
