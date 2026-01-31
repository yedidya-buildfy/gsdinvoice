-- Migration: Add ISO 4217 Currency Code Validation
-- ================================================
--
-- This migration adds proper validation for currency codes across the database.
-- We use a TEXT column type (not ENUM) for flexibility, with CHECK constraints
-- for validation. This approach allows adding new currencies without migrations.
--
-- Design decision: TEXT + validation function instead of ENUM
-- - ENUMs require ALTER TYPE to add new currencies (migration needed)
-- - ISO 4217 has ~180 currencies, too many for an ENUM
-- - ISO 4217 updates periodically (new currencies, obsolete ones)
-- - Application layer does full ISO 4217 validation via currency-codes-ts
--
-- The database validates format (3 uppercase letters) as a basic check.
-- Full ISO 4217 compliance is validated at the application layer.

-- ============================================================================
-- Step 1: Create validation function
-- ============================================================================

-- Function to validate currency code format (3 uppercase letters)
-- This is a syntactic check; semantic validation happens in the app
CREATE OR REPLACE FUNCTION is_valid_currency_code(code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- NULL is valid (nullable columns)
  IF code IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Must be exactly 3 uppercase letters (ISO 4217 format)
  RETURN code ~ '^[A-Z]{3}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION is_valid_currency_code(TEXT) IS
  'Validates ISO 4217 currency code format (3 uppercase letters). Full validation done in app layer.';

-- ============================================================================
-- Step 2: Update profiles table
-- ============================================================================

-- profiles.currency already has a CHECK constraint limiting to 4 currencies
-- We need to drop it and add a more flexible one

DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_currency_check'
    AND table_name = 'profiles'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_currency_check;
  END IF;
END $$;

-- Add new flexible constraint
ALTER TABLE profiles
  ADD CONSTRAINT profiles_currency_format_check
  CHECK (is_valid_currency_code(currency));

-- ============================================================================
-- Step 3: Add constraints to invoices table
-- ============================================================================

-- invoices.currency currently has no constraint
ALTER TABLE invoices
  ADD CONSTRAINT invoices_currency_format_check
  CHECK (is_valid_currency_code(currency));

-- ============================================================================
-- Step 4: Add constraints to invoice_rows table
-- ============================================================================

-- invoice_rows.currency currently has no constraint
ALTER TABLE invoice_rows
  ADD CONSTRAINT invoice_rows_currency_format_check
  CHECK (is_valid_currency_code(currency));

-- ============================================================================
-- Step 5: Add constraints to transactions table
-- ============================================================================

-- transactions.foreign_currency currently has no constraint
ALTER TABLE transactions
  ADD CONSTRAINT transactions_foreign_currency_format_check
  CHECK (is_valid_currency_code(foreign_currency));

-- ============================================================================
-- Step 6: Add indexes for currency filtering performance
-- ============================================================================

-- Partial indexes only on non-null values for efficiency
CREATE INDEX IF NOT EXISTS idx_invoices_currency
  ON invoices(currency)
  WHERE currency IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_rows_currency
  ON invoice_rows(currency)
  WHERE currency IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_foreign_currency
  ON transactions(foreign_currency)
  WHERE foreign_currency IS NOT NULL;

-- ============================================================================
-- Step 7: Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN invoices.currency IS
  'ISO 4217 currency code (e.g., ILS, USD, EUR). Validated at app layer. Default: ILS';

COMMENT ON COLUMN invoice_rows.currency IS
  'ISO 4217 currency code for this line item. Inherits from invoice if not specified.';

COMMENT ON COLUMN transactions.foreign_currency IS
  'Original transaction currency (ISO 4217) for foreign currency transactions.';

COMMENT ON COLUMN profiles.currency IS
  'User preferred currency for display (ISO 4217). Default: ILS';
