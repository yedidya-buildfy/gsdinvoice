-- Email connections: stores Gmail OAuth tokens and sync state per team
CREATE TABLE email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  provider TEXT NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail')),
  email_address TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL,
  last_history_id TEXT,
  last_sync_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'syncing', 'expired', 'revoked')),
  sync_state JSONB DEFAULT '{}',
  sender_rules JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, email_address)
);

CREATE INDEX idx_email_connections_team ON email_connections(team_id);
CREATE INDEX idx_email_connections_status ON email_connections(status)
  WHERE status IN ('active', 'syncing');

ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view email connections"
  ON email_connections FOR SELECT TO authenticated
  USING (is_active_team_member(team_id));

CREATE POLICY "Team admins can insert email connections"
  ON email_connections FOR INSERT TO authenticated
  WITH CHECK (is_team_admin(team_id));

CREATE POLICY "Team admins can update email connections"
  ON email_connections FOR UPDATE TO authenticated
  USING (is_team_admin(team_id));

CREATE POLICY "Team admins can delete email connections"
  ON email_connections FOR DELETE TO authenticated
  USING (is_team_admin(team_id));

-- Add source column to files table (upload vs email)
ALTER TABLE files ADD COLUMN source TEXT NOT NULL DEFAULT 'upload'
  CHECK (source IN ('upload', 'email'));

-- Add email_message_id for deduplication
ALTER TABLE files ADD COLUMN email_message_id TEXT;

-- Unique index: same email message can only be processed once per team
CREATE UNIQUE INDEX idx_files_email_message_id
  ON files(team_id, email_message_id)
  WHERE email_message_id IS NOT NULL;

CREATE INDEX idx_files_source ON files(source);

-- Auto-update updated_at trigger for email_connections
CREATE TRIGGER update_email_connections_updated_at
  BEFORE UPDATE ON email_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
