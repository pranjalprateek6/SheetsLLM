-- ── Background jobs ───────────────────────────────────────────────────
--
-- Persistent state for async jobs (large-file transforms). Jobs used to
-- live only in a process dict, so a deploy or OOM mid-job orphaned the
-- client into polling a 404 forever. The in-memory dict remains the fast
-- path; this table is the write-through copy that survives restarts.
-- A "processing" row whose job is not in the current process's memory
-- means the worker died — the poll endpoint marks it failed so clients
-- get a definitive "job lost, retry" instead of eternal polling.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.jobs (
  id          UUID PRIMARY KEY,
  user_id     TEXT NOT NULL,
  action      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'processing',
  progress    INTEGER NOT NULL DEFAULT 0,
  result      JSONB,
  error       TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user ON public.jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status_updated ON public.jobs (status, updated_at);

-- Service-role only: RLS enabled with no policies means the anon and
-- authenticated roles can neither read nor write; the backend's service
-- key bypasses RLS.
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
