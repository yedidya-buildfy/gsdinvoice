-- =============================================================================
-- Email Sync Cron Jobs
-- =============================================================================
-- Sets up pg_cron jobs to manage Gmail email synchronization:
--   1. gmail-sync-continue  - Continues historical scanning (every 1 min)
--   2. gmail-sync-backstop  - Catches missed push notifications (every 30 min)
--   3. gmail-renew-watch    - Renews Pub/Sub watch subscriptions (daily 3 AM UTC)
--
-- IMPORTANT: Before running this migration, replace the placeholders:
--   {{SUPABASE_URL}}    - Your Supabase project URL (e.g. https://xyzref.supabase.co)
--   {{SERVICE_ROLE_KEY}} - Your Supabase service_role key (found in project settings)
--
-- Alternatively, if your project has the Supabase Vault enabled, you can store
-- these values as vault secrets and reference them with:
--   (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
--   (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =============================================================================
-- Job 1: gmail-sync-continue
-- =============================================================================
-- Frequency: Every 1 minute
-- Purpose:  Continues historical email scanning for connections with
--           status='syncing'. When a user first connects their Gmail account,
--           we page through their history in batches. This job picks up where
--           the last batch left off, processing the next page of messages until
--           the full history has been scanned.
-- =============================================================================
SELECT cron.schedule(
  'gmail-sync-continue',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url:='{{SUPABASE_URL}}/functions/v1/gmail-sync',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer {{SERVICE_ROLE_KEY}}"}'::jsonb,
      body:='{"mode":"continue"}'::jsonb
    ) AS request_id;
  $$
);

-- =============================================================================
-- Job 2: gmail-sync-backstop
-- =============================================================================
-- Frequency: Every 30 minutes
-- Purpose:  Acts as a safety net for Gmail push notifications. Google's Pub/Sub
--           push delivery is at-least-once but not guaranteed, so some
--           notifications may be dropped. This job performs an incremental sync
--           using history_id to catch any emails that were missed by the
--           real-time push handler.
-- =============================================================================
SELECT cron.schedule(
  'gmail-sync-backstop',
  '*/30 * * * *',
  $$
  SELECT
    net.http_post(
      url:='{{SUPABASE_URL}}/functions/v1/gmail-sync-backstop',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer {{SERVICE_ROLE_KEY}}"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;
  $$
);

-- =============================================================================
-- Job 3: gmail-renew-watch
-- =============================================================================
-- Frequency: Daily at 03:00 UTC
-- Purpose:  Renews Gmail Pub/Sub watch subscriptions. Google requires watch
--           subscriptions to be renewed before they expire (typically 7 days).
--           Running daily at 3 AM UTC ensures subscriptions stay active with
--           comfortable margin, and avoids peak hours.
-- =============================================================================
SELECT cron.schedule(
  'gmail-renew-watch',
  '0 3 * * *',
  $$
  SELECT
    net.http_post(
      url:='{{SUPABASE_URL}}/functions/v1/gmail-renew-watch',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer {{SERVICE_ROLE_KEY}}"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;
  $$
);
