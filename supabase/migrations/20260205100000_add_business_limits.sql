-- Add max_businesses column to plan_limits
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS max_businesses INTEGER DEFAULT 1;

-- Update existing plan tiers with business limits
UPDATE plan_limits SET max_businesses = 1 WHERE plan_tier = 'free';
UPDATE plan_limits SET max_businesses = 3 WHERE plan_tier = 'pro';
UPDATE plan_limits SET max_businesses = 10 WHERE plan_tier = 'business';

-- RPC function to check if user can create a new business (team)
CREATE OR REPLACE FUNCTION can_create_business()
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_plan_tier TEXT;
  v_max_businesses INTEGER;
  v_current_count INTEGER;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get user's plan tier from subscriptions
  SELECT plan_tier INTO v_plan_tier
  FROM subscriptions
  WHERE user_id = v_user_id
    AND status = 'active';

  -- Default to free if no subscription found
  IF v_plan_tier IS NULL THEN
    v_plan_tier := 'free';
  END IF;

  -- Get max businesses allowed for this plan
  SELECT max_businesses INTO v_max_businesses
  FROM plan_limits
  WHERE plan_tier = v_plan_tier;

  -- NULL means unlimited
  IF v_max_businesses IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Count user's owned teams (businesses)
  SELECT COUNT(*) INTO v_current_count
  FROM teams
  WHERE owner_id = v_user_id;

  RETURN v_current_count < v_max_businesses;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION can_create_business() TO authenticated;

-- Update create_personal_team function to use "Personal" as the default team name
CREATE OR REPLACE FUNCTION create_personal_team(p_user_id UUID, p_team_name TEXT DEFAULT 'Personal')
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

-- Update the handle_new_user_team function to use "Personal" as team name
CREATE OR REPLACE FUNCTION handle_new_user_team()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_personal_team(NEW.id, 'Personal');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON FUNCTION can_create_business() IS 'Checks if the current user can create a new business based on their subscription plan limits';
COMMENT ON COLUMN plan_limits.max_businesses IS 'Maximum number of businesses (teams) a user can own on this plan. NULL means unlimited.';
