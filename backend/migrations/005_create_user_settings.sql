-- Migration 005: Per-user settings (first setting: strict privacy mode).
--
-- privacy_mode = true means prompts sent to the LLM contain the schema only
-- (column names, types, aggregate stats) - no sample values and no sample
-- rows. Opt-in; defaults to false.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id      TEXT PRIMARY KEY,
  privacy_mode BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: backend service role bypasses; authenticated users read their own row.
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_settings_select_own ON public.user_settings;
CREATE POLICY user_settings_select_own ON public.user_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);
