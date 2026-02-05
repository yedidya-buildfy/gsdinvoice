-- Add columns for processing guard and retry tracking
-- This prevents duplicate processing and allows retry after failure

-- Add processing_started_at for stale lock detection
ALTER TABLE files ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

-- Add retry_count to track and limit retries
ALTER TABLE files ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;

-- Add max_retries setting (optional, for future use)
ALTER TABLE files ADD COLUMN IF NOT EXISTS max_retries integer DEFAULT 3;

-- Index for efficient status + timestamp queries
CREATE INDEX IF NOT EXISTS idx_files_status_processing_started
ON files (status, processing_started_at)
WHERE status IN ('pending', 'processing', 'failed');

-- Comment for documentation
COMMENT ON COLUMN files.processing_started_at IS 'Timestamp when processing started, used for stale lock detection';
COMMENT ON COLUMN files.retry_count IS 'Number of processing attempts, incremented on each retry';
COMMENT ON COLUMN files.max_retries IS 'Maximum allowed retry attempts before permanent failure';
