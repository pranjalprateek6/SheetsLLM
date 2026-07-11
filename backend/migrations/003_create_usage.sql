-- Migration 003: Usage metering.
--
-- One row per (user, month). Counters are incremented atomically via the
-- increment_usage() function (INSERT ... ON CONFLICT), so concurrent requests
-- cannot lose updates. The backend (service role) reads and writes; RLS lets
-- authenticated users read only their own usage.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  month         DATE NOT NULL,                    -- first day of the month (UTC)
  uploads       INTEGER NOT NULL DEFAULT 0,
  transforms    INTEGER NOT NULL DEFAULT 0,       -- LLM-backed /transform requests
  chat_requests INTEGER NOT NULL DEFAULT 0,       -- LLM-backed /chat requests
  rows_processed BIGINT  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_month ON public.usage (user_id, month);

-- Atomic upsert-increment. All counters optional; defaults add nothing.
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id        TEXT,
  p_uploads        INTEGER DEFAULT 0,
  p_transforms     INTEGER DEFAULT 0,
  p_chat_requests  INTEGER DEFAULT 0,
  p_rows_processed BIGINT  DEFAULT 0
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.usage (user_id, month, uploads, transforms, chat_requests, rows_processed)
  VALUES (
    p_user_id,
    date_trunc('month', now() AT TIME ZONE 'utc')::date,
    p_uploads, p_transforms, p_chat_requests, p_rows_processed
  )
  ON CONFLICT (user_id, month) DO UPDATE SET
    uploads        = usage.uploads        + EXCLUDED.uploads,
    transforms     = usage.transforms     + EXCLUDED.transforms,
    chat_requests  = usage.chat_requests  + EXCLUDED.chat_requests,
    rows_processed = usage.rows_processed + EXCLUDED.rows_processed,
    updated_at     = now();
$$;

-- RLS: backend service role bypasses; authenticated users may read their own row.
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_select_own ON public.usage;
CREATE POLICY usage_select_own ON public.usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);
