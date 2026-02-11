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
CREATE TABLE IF NOT EXISTS vendor_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  alias_pattern TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'starts_with', 'ends_with')),
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('system', 'user', 'learned')),
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index with COALESCE for null team_id handling
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_aliases_unique_pattern
  ON vendor_aliases (user_id, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid), alias_pattern);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_user ON vendor_aliases(user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_team ON vendor_aliases(team_id);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_pattern ON vendor_aliases(alias_pattern);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_canonical ON vendor_aliases(canonical_name);

-- Trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS update_vendor_aliases_updated_at ON vendor_aliases;
CREATE TRIGGER update_vendor_aliases_updated_at
  BEFORE UPDATE ON vendor_aliases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE vendor_aliases ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own aliases OR team aliases if active team member
DROP POLICY IF EXISTS "Users can view own or team aliases" ON vendor_aliases;
CREATE POLICY "Users can view own or team aliases"
  ON vendor_aliases FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND is_active_team_member(team_id))
  );

-- Users can create their own aliases
DROP POLICY IF EXISTS "Users can create own aliases" ON vendor_aliases;
CREATE POLICY "Users can create own aliases"
  ON vendor_aliases FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own aliases
DROP POLICY IF EXISTS "Users can update own aliases" ON vendor_aliases;
CREATE POLICY "Users can update own aliases"
  ON vendor_aliases FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own aliases
DROP POLICY IF EXISTS "Users can delete own aliases" ON vendor_aliases;
CREATE POLICY "Users can delete own aliases"
  ON vendor_aliases FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Function to seed default vendor aliases for a user
CREATE OR REPLACE FUNCTION seed_default_vendor_aliases(p_user_id UUID, p_team_id UUID DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO vendor_aliases (user_id, team_id, alias_pattern, canonical_name, match_type, source, priority)
  VALUES
    -- Meta/Facebook (Ads platform)
    (p_user_id, p_team_id, 'FACEBK', 'Meta (Facebook)', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'FB*', 'Meta (Facebook)', 'starts_with', 'system', 100),
    (p_user_id, p_team_id, 'META PLATFORMS', 'Meta (Facebook)', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'FACEBOOK', 'Meta (Facebook)', 'contains', 'system', 100),

    -- Google (Ads, Cloud, Workspace)
    (p_user_id, p_team_id, 'GOOG', 'Google', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'GOOGLE*', 'Google', 'starts_with', 'system', 100),
    (p_user_id, p_team_id, 'GCP', 'Google Cloud Platform', 'exact', 'system', 100),
    (p_user_id, p_team_id, 'GOOGLE ADS', 'Google Ads', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'GOOGLE CLOUD', 'Google Cloud Platform', 'contains', 'system', 100),

    -- Microsoft (Azure, 365, Ads)
    (p_user_id, p_team_id, 'MSFT', 'Microsoft', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'MICROSOFT*', 'Microsoft', 'starts_with', 'system', 100),
    (p_user_id, p_team_id, 'AZURE', 'Microsoft Azure', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'OFFICE 365', 'Microsoft 365', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'M365', 'Microsoft 365', 'contains', 'system', 100),

    -- Shopify (E-commerce platform)
    (p_user_id, p_team_id, 'SHOPIFY', 'Shopify', 'contains', 'system', 100),
    (p_user_id, p_team_id, 'SHOPIFY*', 'Shopify', 'starts_with', 'system', 100)
  ON CONFLICT DO NOTHING;
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
DROP TRIGGER IF EXISTS enforce_vendor_alias_limit ON vendor_aliases;
CREATE TRIGGER enforce_vendor_alias_limit
  BEFORE INSERT ON vendor_aliases
  FOR EACH ROW
  EXECUTE FUNCTION check_vendor_alias_limit();
