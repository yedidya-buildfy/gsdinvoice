-- Fix merchant_vat_preferences unique constraint to include team_id
-- Previously: unique on (user_id, merchant_name) which caused cross-team overwrites

-- Drop old constraint if it exists (try common names)
DROP INDEX IF EXISTS merchant_vat_preferences_user_id_merchant_name_key;
DROP INDEX IF EXISTS idx_merchant_vat_preferences_user_merchant;

-- Create new team-scoped unique constraint
-- Use COALESCE for team_id since it's nullable (personal accounts have no team)
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_vat_preferences_user_team_merchant
ON merchant_vat_preferences(user_id, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid), merchant_name);
