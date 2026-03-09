-- Temporary debug_logs table for webhook troubleshooting
CREATE TABLE IF NOT EXISTS public.debug_logs (
  id serial PRIMARY KEY,
  source text NOT NULL,
  message text NOT NULL,
  data jsonb,
  created_at timestamptz DEFAULT now()
);

-- Allow service role full access
ALTER TABLE public.debug_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.debug_logs FOR ALL USING (true) WITH CHECK (true);
