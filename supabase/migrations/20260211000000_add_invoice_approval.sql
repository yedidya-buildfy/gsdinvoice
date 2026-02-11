-- Add approval columns to invoices table
-- is_approved: tracks whether a user has reviewed the document's extraction/matching
-- approved_at: audit timestamp for when approval was toggled

ALTER TABLE invoices
  ADD COLUMN is_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN approved_at timestamptz;
