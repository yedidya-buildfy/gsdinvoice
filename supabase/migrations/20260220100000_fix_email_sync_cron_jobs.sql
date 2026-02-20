-- Fix cron jobs: replace placeholders with actual values

-- Remove old jobs with placeholders
SELECT cron.unschedule('gmail-sync-continue');
SELECT cron.unschedule('gmail-sync-backstop');
SELECT cron.unschedule('gmail-renew-watch');

-- Recreate with actual values
SELECT cron.schedule(
  'gmail-sync-continue',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://gkagkwpqozymjvehzucy.supabase.co/functions/v1/gmail-sync',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrYWdrd3Bxb3p5bWp2ZWh6dWN5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMjEzOCwiZXhwIjoyMDg1MDg4MTM4fQ.QB14BK0gKqpEPHw3L5p9NpLAM-wdnnFYwKndbl_uy1Y"}'::jsonb,
      body:='{"mode":"continue"}'::jsonb
    ) AS request_id;
  $$
);

SELECT cron.schedule(
  'gmail-sync-backstop',
  '*/30 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://gkagkwpqozymjvehzucy.supabase.co/functions/v1/gmail-sync-backstop',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrYWdrd3Bxb3p5bWp2ZWh6dWN5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMjEzOCwiZXhwIjoyMDg1MDg4MTM4fQ.QB14BK0gKqpEPHw3L5p9NpLAM-wdnnFYwKndbl_uy1Y"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;
  $$
);

SELECT cron.schedule(
  'gmail-renew-watch',
  '0 3 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://gkagkwpqozymjvehzucy.supabase.co/functions/v1/gmail-renew-watch',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrYWdrd3Bxb3p5bWp2ZWh6dWN5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMjEzOCwiZXhwIjoyMDg1MDg4MTM4fQ.QB14BK0gKqpEPHw3L5p9NpLAM-wdnnFYwKndbl_uy1Y"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;
  $$
);
