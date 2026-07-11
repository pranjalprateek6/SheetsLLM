-- ── Funnel events ─────────────────────────────────────────────────────
--
-- Append-only product analytics events, written by the backend (service
-- role) only. Complements what existing tables already answer:
-- files/transformations/recipes/subscriptions cover most funnel stages;
-- events capture the moments that leave no table row otherwise
-- (paywall hits, checkout starts, subscription activations).
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  event       TEXT NOT NULL,
  properties  JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_event_created ON public.events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user ON public.events (user_id);

-- Service-role only: RLS enabled with no policies means the anon and
-- authenticated roles can neither read nor write; the backend's service
-- key bypasses RLS.
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
