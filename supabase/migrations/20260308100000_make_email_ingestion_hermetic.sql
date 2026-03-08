-- Make email ingestion candidate-hermetic instead of message-hermetic.

-- Expand email connection statuses to match runtime usage.
ALTER TABLE email_connections
  DROP CONSTRAINT IF EXISTS email_connections_status_check;

ALTER TABLE email_connections
  ADD CONSTRAINT email_connections_status_check
  CHECK (status IN ('active', 'syncing', 'expired', 'revoked', 'failed', 'reauthorization_required'));

DROP INDEX IF EXISTS idx_email_connections_status;

CREATE INDEX idx_email_connections_status
  ON email_connections(status)
  WHERE status IN ('active', 'syncing', 'failed', 'reauthorization_required');

-- Track email candidate identity at the document level.
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS email_attachment_id TEXT,
  ADD COLUMN IF NOT EXISTS email_content_kind TEXT
    CHECK (email_content_kind IN ('attachment', 'html_body', 'download_link')),
  ADD COLUMN IF NOT EXISTS email_source_url TEXT,
  ADD COLUMN IF NOT EXISTS email_detection_label TEXT
    CHECK (email_detection_label IN ('yes', 'maybe', 'no')),
  ADD COLUMN IF NOT EXISTS email_detection_confidence INTEGER,
  ADD COLUMN IF NOT EXISTS email_detection_reason TEXT,
  ADD COLUMN IF NOT EXISTS email_discovery_metadata JSONB;

DROP INDEX IF EXISTS idx_files_email_message_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_files_email_candidate_identity
  ON files (
    team_id,
    email_message_id,
    COALESCE(email_attachment_id, ''),
    COALESCE(email_content_kind, ''),
    COALESCE(email_source_url, '')
  )
  WHERE email_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_files_email_lookup
  ON files(team_id, email_message_id, email_content_kind);
