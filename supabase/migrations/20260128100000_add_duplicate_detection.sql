-- Add file_hash column for duplicate detection
ALTER TABLE files ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_files_file_hash ON files(file_hash) WHERE file_hash IS NOT NULL;

-- Index for semantic matching (same user, filename, size)
CREATE INDEX IF NOT EXISTS idx_files_user_name_size ON files(user_id, original_name, file_size);
