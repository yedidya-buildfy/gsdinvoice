-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members with soft delete
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  removed_at TIMESTAMPTZ, -- Soft delete
  UNIQUE(team_id, user_id)
);

-- Team invitations
CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  token TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team audit log for critical actions
CREATE TABLE IF NOT EXISTS team_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_user_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add team_id to existing tables (nullable initially for migration)
ALTER TABLE files ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE cc_bank_match_results ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE merchant_vat_preferences ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_team_audit_logs_team ON team_audit_logs(team_id, created_at DESC);

-- Indexes for team_id on existing tables
CREATE INDEX IF NOT EXISTS idx_files_team ON files(team_id);
CREATE INDEX IF NOT EXISTS idx_invoices_team ON invoices(team_id);
CREATE INDEX IF NOT EXISTS idx_transactions_team ON transactions(team_id);
CREATE INDEX IF NOT EXISTS idx_credit_cards_team ON credit_cards(team_id);
CREATE INDEX IF NOT EXISTS idx_cc_bank_match_results_team ON cc_bank_match_results(team_id);
CREATE INDEX IF NOT EXISTS idx_merchant_vat_preferences_team ON merchant_vat_preferences(team_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_team ON user_settings(team_id);

-- RLS Helper functions
CREATE OR REPLACE FUNCTION is_active_team_member(check_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = check_team_id
    AND user_id = auth.uid()
    AND removed_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_team_admin(check_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = check_team_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND removed_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_team_role(check_team_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM team_members
  WHERE team_id = check_team_id
  AND user_id = auth.uid()
  AND removed_at IS NULL
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Enable RLS on new tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_audit_logs ENABLE ROW LEVEL SECURITY;

-- Teams policies
DROP POLICY IF EXISTS "Users can view their teams" ON teams;
CREATE POLICY "Users can view their teams"
  ON teams FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR is_active_team_member(id));

DROP POLICY IF EXISTS "Users can create teams" ON teams;
CREATE POLICY "Users can create teams"
  ON teams FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Team admins can update team" ON teams;
CREATE POLICY "Team admins can update team"
  ON teams FOR UPDATE TO authenticated
  USING (is_team_admin(id))
  WITH CHECK (is_team_admin(id));

DROP POLICY IF EXISTS "Only owner can delete team" ON teams;
CREATE POLICY "Only owner can delete team"
  ON teams FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Team members policies
DROP POLICY IF EXISTS "Team members can view members" ON team_members;
CREATE POLICY "Team members can view members"
  ON team_members FOR SELECT TO authenticated
  USING (is_active_team_member(team_id));

DROP POLICY IF EXISTS "Team admins can add members" ON team_members;
CREATE POLICY "Team admins can add members"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (is_team_admin(team_id) OR (team_id IN (SELECT id FROM teams WHERE owner_id = auth.uid())));

DROP POLICY IF EXISTS "Team admins can update members" ON team_members;
CREATE POLICY "Team admins can update members"
  ON team_members FOR UPDATE TO authenticated
  USING (is_team_admin(team_id))
  WITH CHECK (is_team_admin(team_id));

DROP POLICY IF EXISTS "Team admins can remove members" ON team_members;
CREATE POLICY "Team admins can remove members"
  ON team_members FOR DELETE TO authenticated
  USING (is_team_admin(team_id));

-- Team invitations policies
DROP POLICY IF EXISTS "Team members can view invitations" ON team_invitations;
CREATE POLICY "Team members can view invitations"
  ON team_invitations FOR SELECT TO authenticated
  USING (is_active_team_member(team_id) OR email = (auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Team admins can create invitations" ON team_invitations;
CREATE POLICY "Team admins can create invitations"
  ON team_invitations FOR INSERT TO authenticated
  WITH CHECK (is_team_admin(team_id));

DROP POLICY IF EXISTS "Team admins can update invitations" ON team_invitations;
CREATE POLICY "Team admins can update invitations"
  ON team_invitations FOR UPDATE TO authenticated
  USING (is_team_admin(team_id) OR email = (auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Team admins can delete invitations" ON team_invitations;
CREATE POLICY "Team admins can delete invitations"
  ON team_invitations FOR DELETE TO authenticated
  USING (is_team_admin(team_id));

-- Team audit logs policies (read-only for team members)
DROP POLICY IF EXISTS "Team members can view audit logs" ON team_audit_logs;
CREATE POLICY "Team members can view audit logs"
  ON team_audit_logs FOR SELECT TO authenticated
  USING (is_active_team_member(team_id));

DROP POLICY IF EXISTS "System can insert audit logs" ON team_audit_logs;
CREATE POLICY "System can insert audit logs"
  ON team_audit_logs FOR INSERT TO authenticated
  WITH CHECK (is_active_team_member(team_id));

-- Update RLS policies on existing tables to use team_id
-- Files
DROP POLICY IF EXISTS "Users can view own files" ON files;
DROP POLICY IF EXISTS "Users can insert own files" ON files;
DROP POLICY IF EXISTS "Users can update own files" ON files;
DROP POLICY IF EXISTS "Users can delete own files" ON files;
DROP POLICY IF EXISTS "Team members can view files" ON files;
DROP POLICY IF EXISTS "Team members can insert files" ON files;
DROP POLICY IF EXISTS "Team members can update files" ON files;
DROP POLICY IF EXISTS "Team members can delete files" ON files;

CREATE POLICY "Team members can view files"
  ON files FOR SELECT TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can insert files"
  ON files FOR INSERT TO authenticated
  WITH CHECK (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can update files"
  ON files FOR UPDATE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can delete files"
  ON files FOR DELETE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

-- Invoices
DROP POLICY IF EXISTS "Users can view own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can insert own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can update own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can delete own invoices" ON invoices;
DROP POLICY IF EXISTS "Team members can view invoices" ON invoices;
DROP POLICY IF EXISTS "Team members can insert invoices" ON invoices;
DROP POLICY IF EXISTS "Team members can update invoices" ON invoices;
DROP POLICY IF EXISTS "Team members can delete invoices" ON invoices;

CREATE POLICY "Team members can view invoices"
  ON invoices FOR SELECT TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can insert invoices"
  ON invoices FOR INSERT TO authenticated
  WITH CHECK (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can update invoices"
  ON invoices FOR UPDATE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can delete invoices"
  ON invoices FOR DELETE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

-- Transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON transactions;
DROP POLICY IF EXISTS "Team members can view transactions" ON transactions;
DROP POLICY IF EXISTS "Team members can insert transactions" ON transactions;
DROP POLICY IF EXISTS "Team members can update transactions" ON transactions;
DROP POLICY IF EXISTS "Team members can delete transactions" ON transactions;

CREATE POLICY "Team members can view transactions"
  ON transactions FOR SELECT TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can insert transactions"
  ON transactions FOR INSERT TO authenticated
  WITH CHECK (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can update transactions"
  ON transactions FOR UPDATE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can delete transactions"
  ON transactions FOR DELETE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

-- Credit cards
DROP POLICY IF EXISTS "Users can view own credit_cards" ON credit_cards;
DROP POLICY IF EXISTS "Users can insert own credit_cards" ON credit_cards;
DROP POLICY IF EXISTS "Users can update own credit_cards" ON credit_cards;
DROP POLICY IF EXISTS "Users can delete own credit_cards" ON credit_cards;
DROP POLICY IF EXISTS "Team members can view credit_cards" ON credit_cards;
DROP POLICY IF EXISTS "Team members can insert credit_cards" ON credit_cards;
DROP POLICY IF EXISTS "Team members can update credit_cards" ON credit_cards;
DROP POLICY IF EXISTS "Team members can delete credit_cards" ON credit_cards;

CREATE POLICY "Team members can view credit_cards"
  ON credit_cards FOR SELECT TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can insert credit_cards"
  ON credit_cards FOR INSERT TO authenticated
  WITH CHECK (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can update credit_cards"
  ON credit_cards FOR UPDATE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can delete credit_cards"
  ON credit_cards FOR DELETE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

-- CC bank match results
DROP POLICY IF EXISTS "Users can view own cc_bank_match_results" ON cc_bank_match_results;
DROP POLICY IF EXISTS "Users can insert own cc_bank_match_results" ON cc_bank_match_results;
DROP POLICY IF EXISTS "Users can update own cc_bank_match_results" ON cc_bank_match_results;
DROP POLICY IF EXISTS "Users can delete own cc_bank_match_results" ON cc_bank_match_results;
DROP POLICY IF EXISTS "Team members can view cc_bank_match_results" ON cc_bank_match_results;
DROP POLICY IF EXISTS "Team members can insert cc_bank_match_results" ON cc_bank_match_results;
DROP POLICY IF EXISTS "Team members can update cc_bank_match_results" ON cc_bank_match_results;
DROP POLICY IF EXISTS "Team members can delete cc_bank_match_results" ON cc_bank_match_results;

CREATE POLICY "Team members can view cc_bank_match_results"
  ON cc_bank_match_results FOR SELECT TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can insert cc_bank_match_results"
  ON cc_bank_match_results FOR INSERT TO authenticated
  WITH CHECK (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can update cc_bank_match_results"
  ON cc_bank_match_results FOR UPDATE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can delete cc_bank_match_results"
  ON cc_bank_match_results FOR DELETE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

-- Merchant VAT preferences
DROP POLICY IF EXISTS "Users can view own merchant_vat_preferences" ON merchant_vat_preferences;
DROP POLICY IF EXISTS "Users can insert own merchant_vat_preferences" ON merchant_vat_preferences;
DROP POLICY IF EXISTS "Users can update own merchant_vat_preferences" ON merchant_vat_preferences;
DROP POLICY IF EXISTS "Users can delete own merchant_vat_preferences" ON merchant_vat_preferences;
DROP POLICY IF EXISTS "Team members can view merchant_vat_preferences" ON merchant_vat_preferences;
DROP POLICY IF EXISTS "Team members can insert merchant_vat_preferences" ON merchant_vat_preferences;
DROP POLICY IF EXISTS "Team members can update merchant_vat_preferences" ON merchant_vat_preferences;
DROP POLICY IF EXISTS "Team members can delete merchant_vat_preferences" ON merchant_vat_preferences;

CREATE POLICY "Team members can view merchant_vat_preferences"
  ON merchant_vat_preferences FOR SELECT TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can insert merchant_vat_preferences"
  ON merchant_vat_preferences FOR INSERT TO authenticated
  WITH CHECK (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can update merchant_vat_preferences"
  ON merchant_vat_preferences FOR UPDATE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can delete merchant_vat_preferences"
  ON merchant_vat_preferences FOR DELETE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

-- User settings
DROP POLICY IF EXISTS "Users can view own user_settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert own user_settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own user_settings" ON user_settings;
DROP POLICY IF EXISTS "Users can delete own user_settings" ON user_settings;
DROP POLICY IF EXISTS "Team members can view user_settings" ON user_settings;
DROP POLICY IF EXISTS "Team members can insert user_settings" ON user_settings;
DROP POLICY IF EXISTS "Team members can update user_settings" ON user_settings;
DROP POLICY IF EXISTS "Team members can delete user_settings" ON user_settings;

CREATE POLICY "Team members can view user_settings"
  ON user_settings FOR SELECT TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can insert user_settings"
  ON user_settings FOR INSERT TO authenticated
  WITH CHECK (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can update user_settings"
  ON user_settings FOR UPDATE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

CREATE POLICY "Team members can delete user_settings"
  ON user_settings FOR DELETE TO authenticated
  USING (team_id IS NULL OR is_active_team_member(team_id));

-- Function to generate unique team slug
CREATE OR REPLACE FUNCTION generate_team_slug(team_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INT := 0;
BEGIN
  -- Create base slug from name
  base_slug := LOWER(REGEXP_REPLACE(team_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := TRIM(BOTH '-' FROM base_slug);

  -- If empty, use 'team'
  IF base_slug = '' THEN
    base_slug := 'team';
  END IF;

  final_slug := base_slug;

  -- Check for uniqueness and add suffix if needed
  WHILE EXISTS (SELECT 1 FROM teams WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Function to create a personal team for a user
CREATE OR REPLACE FUNCTION create_personal_team(p_user_id UUID, p_team_name TEXT DEFAULT 'My Team')
RETURNS UUID AS $$
DECLARE
  new_team_id UUID;
  team_slug TEXT;
BEGIN
  -- Generate unique slug
  team_slug := generate_team_slug(p_team_name);

  -- Create the team
  INSERT INTO teams (name, slug, owner_id)
  VALUES (p_team_name, team_slug, p_user_id)
  RETURNING id INTO new_team_id;

  -- Add user as owner
  INSERT INTO team_members (team_id, user_id, role)
  VALUES (new_team_id, p_user_id, 'owner');

  RETURN new_team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create team on user signup (optional - can be done in application code)
CREATE OR REPLACE FUNCTION handle_new_user_team()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_personal_team(NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'My') || '''s Team');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment out the trigger - we'll handle team creation in application code for more control
-- CREATE TRIGGER on_auth_user_created_team
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION handle_new_user_team();
