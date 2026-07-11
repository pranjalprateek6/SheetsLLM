-- Migration 002: Enable Row-Level Security on all application tables.
--
-- Problem this fixes: the Supabase anon key is public (it is inlined into the
-- frontend bundle by design). Without RLS, anyone holding that key can read and
-- write every row in these tables directly via PostgREST, bypassing the backend
-- entirely — a cross-tenant data leak.
--
-- Architecture note: the FastAPI backend connects with the SERVICE ROLE key,
-- which has the BYPASSRLS attribute, so enabling RLS does NOT affect the backend
-- (all app reads/writes continue to work). The frontend only uses Supabase for
-- authentication and reaches data through the backend's /api proxies, so it does
-- not need direct table access. The policies below additionally grant logged-in
-- users read-only access to their OWN rows, should direct reads ever be needed.
--
-- Idempotent: safe to run more than once.

-- ── files ─────────────────────────────────────────────────────────────
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS files_select_own ON public.files;
CREATE POLICY files_select_own ON public.files
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

-- ── transformations (owned transitively via files.user_id) ────────────
ALTER TABLE public.transformations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transformations_select_own ON public.transformations;
CREATE POLICY transformations_select_own ON public.transformations
  FOR SELECT TO authenticated
  USING (
    file_id IN (SELECT id FROM public.files WHERE user_id = auth.uid()::text)
  );

-- ── audit_log ─────────────────────────────────────────────────────────
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_select_own ON public.audit_log;
CREATE POLICY audit_log_select_own ON public.audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

-- ── chat_messages (owned transitively via files.user_id) ──────────────
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_messages_select_own ON public.chat_messages;
CREATE POLICY chat_messages_select_own ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    file_id IN (SELECT id FROM public.files WHERE user_id = auth.uid()::text)
  );

-- After this migration:
--   * anon role            -> RLS enabled, no policy grants it access -> 0 rows
--   * authenticated role   -> can SELECT only its own rows; no INSERT/UPDATE/DELETE
--   * service_role (backend) -> bypasses RLS entirely -> unchanged
