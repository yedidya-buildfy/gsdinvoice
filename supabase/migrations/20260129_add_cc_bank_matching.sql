-- Credit Card Transactions table for CC statement uploads
CREATE TABLE IF NOT EXISTS credit_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- From CC CSV
  transaction_date DATE NOT NULL,           -- תאריך עסקה
  merchant_name TEXT NOT NULL,              -- שם בית עסק
  amount_agorot INTEGER NOT NULL,           -- Amount in agorot
  currency TEXT NOT NULL DEFAULT 'ILS',     -- ILS if סכום בש"ח, else USD
  foreign_amount_cents INTEGER,             -- סכום בדולר (cents)
  foreign_currency TEXT,                    -- USD/EUR
  card_last_four TEXT NOT NULL,             -- From כרטיס
  charge_date DATE NOT NULL,                -- מועד חיוב (KEY for matching)
  transaction_type TEXT,                    -- סוג עסקה
  notes TEXT,                               -- הערות

  -- Matching to bank transactions
  bank_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'manual')),
  match_confidence NUMERIC(5,2),

  -- Normalized for cross-matching
  normalized_merchant TEXT,

  -- Deduplication
  hash TEXT UNIQUE,
  source_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  credit_card_id UUID REFERENCES credit_cards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for CC transactions
CREATE INDEX IF NOT EXISTS idx_cc_tx_user ON credit_card_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_cc_tx_card_charge ON credit_card_transactions(card_last_four, charge_date);
CREATE INDEX IF NOT EXISTS idx_cc_tx_unmatched ON credit_card_transactions(user_id, match_status)
  WHERE match_status = 'unmatched';
CREATE INDEX IF NOT EXISTS idx_cc_tx_bank_tx ON credit_card_transactions(bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;

-- Match results audit table for dashboard display
CREATE TABLE IF NOT EXISTS cc_bank_match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  card_last_four TEXT NOT NULL,
  charge_date DATE NOT NULL,
  total_cc_amount_agorot INTEGER NOT NULL,
  bank_amount_agorot INTEGER NOT NULL,
  discrepancy_agorot INTEGER NOT NULL,
  discrepancy_percent NUMERIC(5,2),
  cc_transaction_count INTEGER NOT NULL,
  match_confidence NUMERIC(5,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for match results
CREATE INDEX IF NOT EXISTS idx_match_results_user ON cc_bank_match_results(user_id);
CREATE INDEX IF NOT EXISTS idx_match_results_bank_tx ON cc_bank_match_results(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_match_results_status ON cc_bank_match_results(user_id, status);

-- Add normalized_description to transactions for future cross-matching
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS normalized_description TEXT;

-- Add normalized_description to invoice_rows for future cross-matching
ALTER TABLE invoice_rows ADD COLUMN IF NOT EXISTS normalized_description TEXT;

-- Enable RLS on new tables
ALTER TABLE credit_card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_bank_match_results ENABLE ROW LEVEL SECURITY;

-- RLS policies for credit_card_transactions (team access - all users can access all data)
DROP POLICY IF EXISTS "Users can view all credit_card_transactions" ON credit_card_transactions;
CREATE POLICY "Users can view all credit_card_transactions"
  ON credit_card_transactions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert credit_card_transactions" ON credit_card_transactions;
CREATE POLICY "Users can insert credit_card_transactions"
  ON credit_card_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update credit_card_transactions" ON credit_card_transactions;
CREATE POLICY "Users can update credit_card_transactions"
  ON credit_card_transactions FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can delete credit_card_transactions" ON credit_card_transactions;
CREATE POLICY "Users can delete credit_card_transactions"
  ON credit_card_transactions FOR DELETE
  TO authenticated
  USING (true);

-- RLS policies for cc_bank_match_results (team access)
DROP POLICY IF EXISTS "Users can view all cc_bank_match_results" ON cc_bank_match_results;
CREATE POLICY "Users can view all cc_bank_match_results"
  ON cc_bank_match_results FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert cc_bank_match_results" ON cc_bank_match_results;
CREATE POLICY "Users can insert cc_bank_match_results"
  ON cc_bank_match_results FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update cc_bank_match_results" ON cc_bank_match_results;
CREATE POLICY "Users can update cc_bank_match_results"
  ON cc_bank_match_results FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can delete cc_bank_match_results" ON cc_bank_match_results;
CREATE POLICY "Users can delete cc_bank_match_results"
  ON cc_bank_match_results FOR DELETE
  TO authenticated
  USING (true);
