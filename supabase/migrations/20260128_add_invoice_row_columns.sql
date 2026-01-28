-- Migration: Add columns to invoice_rows for billing summary line items
-- These columns support extraction of billing summaries (Meta, TikTok, Google, etc.)
-- where each payment/transaction becomes a separate line item for matching

-- Reference ID from billing summary (e.g., Meta Transaction ID)
ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS reference_id TEXT;

-- Transaction date (when the payment/charge occurred)
ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS transaction_date DATE;

-- Currency per line item (can differ from invoice total currency)
ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ILS';

-- VAT rate for this specific line item
ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2);

-- VAT amount in agorot for this line item
ALTER TABLE invoice_rows
ADD COLUMN IF NOT EXISTS vat_amount_agorot INTEGER;

-- Add index on reference_id for faster matching lookups
CREATE INDEX IF NOT EXISTS idx_invoice_rows_reference_id
ON invoice_rows(reference_id)
WHERE reference_id IS NOT NULL;

-- Add index on transaction_date for date-based matching
CREATE INDEX IF NOT EXISTS idx_invoice_rows_transaction_date
ON invoice_rows(transaction_date)
WHERE transaction_date IS NOT NULL;
