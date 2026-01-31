-- Subscription plans and limits
CREATE TABLE IF NOT EXISTS plan_limits (
  plan_tier TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_invoices_per_month INTEGER,
  max_team_members INTEGER,
  max_bank_connections INTEGER,
  has_auto_matching BOOLEAN DEFAULT FALSE,
  has_ai_matching BOOLEAN DEFAULT FALSE,
  has_api_access BOOLEAN DEFAULT FALSE,
  overage_price_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert plan limits
INSERT INTO plan_limits (plan_tier, name, max_invoices_per_month, max_team_members, max_bank_connections, has_auto_matching, has_ai_matching, has_api_access, overage_price_cents)
VALUES
  ('free', 'Free', 20, 1, 1, FALSE, FALSE, FALSE, 0),
  ('pro', 'Pro', 200, 3, 3, TRUE, FALSE, FALSE, 15),
  ('business', 'Business', NULL, 10, NULL, TRUE, TRUE, TRUE, 10)
ON CONFLICT (plan_tier) DO UPDATE SET
  name = EXCLUDED.name,
  max_invoices_per_month = EXCLUDED.max_invoices_per_month,
  max_team_members = EXCLUDED.max_team_members,
  max_bank_connections = EXCLUDED.max_bank_connections,
  has_auto_matching = EXCLUDED.has_auto_matching,
  has_ai_matching = EXCLUDED.has_ai_matching,
  has_api_access = EXCLUDED.has_api_access,
  overage_price_cents = EXCLUDED.overage_price_cents;

-- User subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_tier TEXT NOT NULL DEFAULT 'free' REFERENCES plan_limits(plan_tier),
  status TEXT NOT NULL DEFAULT 'active', -- active, canceled, past_due, trialing
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Usage tracking per billing period
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  invoices_processed INTEGER DEFAULT 0,
  team_members_count INTEGER DEFAULT 0,
  bank_connections_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, period_start)
);

-- Enable RLS
ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- Plan limits are readable by everyone
CREATE POLICY "Plan limits are viewable by everyone" ON plan_limits
  FOR SELECT USING (true);

-- Users can only see their own subscription
CREATE POLICY "Users can view own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only see their own usage
CREATE POLICY "Users can view own usage" ON usage_records
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all subscriptions (for webhooks)
CREATE POLICY "Service role can manage subscriptions" ON subscriptions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage usage" ON usage_records
  FOR ALL USING (auth.role() = 'service_role');

-- Function to create subscription for new users
CREATE OR REPLACE FUNCTION create_subscription_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (user_id, plan_tier, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create subscription on user signup
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_subscription_for_new_user();

-- Function to increment invoice count
CREATE OR REPLACE FUNCTION increment_invoice_usage(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
BEGIN
  -- Get current billing period from subscription
  SELECT
    COALESCE(current_period_start, date_trunc('month', NOW())),
    COALESCE(current_period_end, date_trunc('month', NOW()) + INTERVAL '1 month')
  INTO v_period_start, v_period_end
  FROM subscriptions
  WHERE user_id = p_user_id;

  -- If no subscription, use current month
  IF v_period_start IS NULL THEN
    v_period_start := date_trunc('month', NOW());
    v_period_end := date_trunc('month', NOW()) + INTERVAL '1 month';
  END IF;

  -- Upsert usage record
  INSERT INTO usage_records (user_id, period_start, period_end, invoices_processed)
  VALUES (p_user_id, v_period_start, v_period_end, 1)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET
    invoices_processed = usage_records.invoices_processed + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can upload more invoices
CREATE OR REPLACE FUNCTION can_upload_invoice(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan_tier TEXT;
  v_max_invoices INTEGER;
  v_current_usage INTEGER;
  v_period_start TIMESTAMPTZ;
BEGIN
  -- Get user's plan
  SELECT plan_tier, COALESCE(current_period_start, date_trunc('month', NOW()))
  INTO v_plan_tier, v_period_start
  FROM subscriptions
  WHERE user_id = p_user_id;

  -- Default to free if no subscription
  IF v_plan_tier IS NULL THEN
    v_plan_tier := 'free';
    v_period_start := date_trunc('month', NOW());
  END IF;

  -- Get plan limit
  SELECT max_invoices_per_month INTO v_max_invoices
  FROM plan_limits
  WHERE plan_tier = v_plan_tier;

  -- NULL means unlimited
  IF v_max_invoices IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Get current usage
  SELECT COALESCE(invoices_processed, 0) INTO v_current_usage
  FROM usage_records
  WHERE user_id = p_user_id AND period_start = v_period_start;

  IF v_current_usage IS NULL THEN
    v_current_usage := 0;
  END IF;

  RETURN v_current_usage < v_max_invoices;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_user_period ON usage_records(user_id, period_start);
