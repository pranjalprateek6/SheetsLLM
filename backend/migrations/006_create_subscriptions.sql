-- Migration 006: Stripe subscriptions.
--
-- One row per user tracking their Stripe customer, subscription, and current
-- tier. tier is the source of truth read by usage limit enforcement; it is
-- kept in sync by the Stripe webhook. No rows means the user is on 'free'.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id                TEXT PRIMARY KEY,
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT,
  tier                   TEXT NOT NULL DEFAULT 'free',    -- 'free' | 'pro'
  status                 TEXT,                            -- Stripe subscription status
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer
  ON public.subscriptions (stripe_customer_id);

-- RLS: backend service role bypasses; authenticated users read their own row.
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);
