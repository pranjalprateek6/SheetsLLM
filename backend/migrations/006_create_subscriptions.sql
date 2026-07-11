-- Migration 006: Subscriptions (Razorpay).
--
-- One row per user tracking their payment-provider subscription and current
-- tier. tier is the source of truth read by usage limit enforcement; it is
-- kept in sync by the Razorpay webhook. No row means the user is on 'free'.
-- Column names are provider-neutral so a future provider swap needs no schema
-- change.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id                  TEXT PRIMARY KEY,
  provider_customer_id     TEXT,
  provider_subscription_id TEXT,
  tier                     TEXT NOT NULL DEFAULT 'free',    -- 'free' | 'pro'
  status                   TEXT,                            -- provider subscription status
  current_period_end       TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub
  ON public.subscriptions (provider_subscription_id);

-- RLS: backend service role bypasses; authenticated users read their own row.
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);
