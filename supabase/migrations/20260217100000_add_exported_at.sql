-- Add exported_at column to track when records were last exported
-- Used by the contextual export feature on each data page

ALTER TABLE files ADD COLUMN IF NOT EXISTS exported_at timestamptz DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exported_at timestamptz DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exported_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN files.exported_at IS 'Timestamp when this file was last exported';
COMMENT ON COLUMN invoices.exported_at IS 'Timestamp when this invoice was last exported';
COMMENT ON COLUMN transactions.exported_at IS 'Timestamp when this transaction was last exported';
