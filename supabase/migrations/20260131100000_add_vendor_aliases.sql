-- Vendor aliases table for normalizing vendor names
-- Supports both personal and team-level aliases

-- Create update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create vendor_aliases table
CREATE TABLE vendor_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  alias_pattern TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'starts_with', 'ends_with')),
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('system', 'user', 'learned')),
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid), alias_pattern)
);

-- Create indexes for efficient lookups
CREATE INDEX idx_vendor_aliases_user ON vendor_aliases(user_id);
CREATE INDEX idx_vendor_aliases_team ON vendor_aliases(team_id);
CREATE INDEX idx_vendor_aliases_pattern ON vendor_aliases(alias_pattern);
CREATE INDEX idx_vendor_aliases_canonical ON vendor_aliases(canonical_name);

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER update_vendor_aliases_updated_at
  BEFORE UPDATE ON vendor_aliases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE vendor_aliases ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own aliases OR team aliases if active team member
CREATE POLICY "Users can view own or team aliases"
  ON vendor_aliases FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND is_active_team_member(team_id))
  );

-- Users can create their own aliases
CREATE POLICY "Users can create own aliases"
  ON vendor_aliases FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own aliases
CREATE POLICY "Users can update own aliases"
  ON vendor_aliases FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own aliases
CREATE POLICY "Users can delete own aliases"
  ON vendor_aliases FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Function to seed default vendor aliases for a user
CREATE OR REPLACE FUNCTION seed_default_vendor_aliases(p_user_id UUID, p_team_id UUID DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO vendor_aliases (user_id, team_id, alias_pattern, canonical_name, match_type, source, priority)
  VALUES
    -- Meta/Facebook
    (p_user_id, p_team_id, 'FACEBK', 'Meta (Facebook)', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'FB*', 'Meta (Facebook)', 'starts_with', 'system', 100),
    (p_user_id, p_team_id, 'META PLATFORMS', 'Meta (Facebook)', 'contains', 'system', 100),

    -- Google
    (p_user_id, p_team_id, 'GOOG', 'Google', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'GOOGLE*', 'Google', 'starts_with', 'system', 100),
    (p_user_id, p_team_id, 'GCP', 'Google Cloud Platform', 'exact', 'system', 100),

    -- Amazon
    (p_user_id, p_team_id, 'AMZN', 'Amazon', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'AMAZON', 'Amazon', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'AWS', 'Amazon Web Services', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'PRIME VIDEO', 'Amazon Prime Video', 'contains', 'system', 100),

    -- Microsoft
    (p_user_id, p_team_id, 'MSFT', 'Microsoft', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'MICROSOFT*', 'Microsoft', 'starts_with', 'system', 100),
    (p_user_id, p_team_id, 'AZURE', 'Microsoft Azure', 'contains', 'system', 100),

    -- Apple
    (p_user_id, p_team_id, 'APPLE.COM', 'Apple', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'APPLE STORE', 'Apple', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'ITUNES', 'Apple', 'contains', 'system', 100),

    -- Uber
    (p_user_id, p_team_id, 'UBER* TRIP', 'Uber', 'starts_with', 'system', 100),
    (p_user_id, p_team_id, 'UBER* EATS', 'Uber Eats', 'starts_with', 'system', 100),
    (p_user_id, p_team_id, 'UBEREATS', 'Uber Eats', 'contains', 'system', 100),

    -- Netflix
    (p_user_id, p_team_id, 'NETFLIX.COM', 'Netflix', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'NETFLIX', 'Netflix', 'exact', 'system', 100),

    -- Spotify
    (p_user_id, p_team_id, 'SPOTIFY', 'Spotify', 'contains', 'system', 100),

    -- PayPal
    (p_user_id, p_team_id, 'PAYPAL', 'PayPal', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'PP*', 'PayPal', 'starts_with', 'system', 100),

    -- Stripe
    (p_user_id, p_team_id, 'STRIPE', 'Stripe', 'contains', 'system', 100),

    -- Shopify
    (p_user_id, p_team_id, 'SHOPIFY', 'Shopify', 'contains', 'system', 100),

    -- Dropbox
    (p_user_id, p_team_id, 'DROPBOX', 'Dropbox', 'contains', 'system', 100),

    -- Slack
    (p_user_id, p_team_id, 'SLACK', 'Slack', 'contains', 'system', 100),

    -- Zoom
    (p_user_id, p_team_id, 'ZOOM.US', 'Zoom', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'ZOOM VIDEO', 'Zoom', 'contains', 'system', 100),

    -- Adobe
    (p_user_id, p_team_id, 'ADOBE', 'Adobe', 'contains', 'system', 100),

    -- LinkedIn
    (p_user_id, p_team_id, 'LINKEDIN', 'LinkedIn', 'contains', 'system', 100),

    -- Twitter/X
    (p_user_id, p_team_id, 'TWITTER', 'X (Twitter)', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'X.COM', 'X (Twitter)', 'contains', 'system', 100)
  ON CONFLICT (user_id, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid), alias_pattern)
  DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check vendor alias limit (max 100 per user)
CREATE OR REPLACE FUNCTION check_vendor_alias_limit()
RETURNS TRIGGER AS $$
DECLARE
  alias_count INTEGER;
  max_aliases CONSTANT INTEGER := 100;
BEGIN
  SELECT COUNT(*)
  INTO alias_count
  FROM vendor_aliases
  WHERE user_id = NEW.user_id;

  IF alias_count >= max_aliases THEN
    RAISE EXCEPTION 'Maximum vendor alias limit reached (%). Please delete existing aliases before adding new ones.', max_aliases;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce alias limit on insert
CREATE TRIGGER enforce_vendor_alias_limit
  BEFORE INSERT ON vendor_aliases
  FOR EACH ROW
  EXECUTE FUNCTION check_vendor_alias_limit();
