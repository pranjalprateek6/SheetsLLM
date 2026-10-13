-- Migration 015: lookup tables beside a file, and the lookups a recipe needs.
--
-- file_links: a file (the one being cleaned) points at another file the
-- user owns under a short alias ("managers"). While that file is open its
-- lookups are tables a step or a question can JOIN. Both sides cascade:
-- delete either file and the link goes with it.
--
-- recipes.required_lookups: [{alias, lookup_file_id, lookup_file_name}] for
-- every lookup a recipe's steps name, so a run on next month's file can
-- link the same lookup first.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.file_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  file_id         UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  lookup_file_id  UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  alias           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_file_links_file ON public.file_links (file_id);
CREATE INDEX IF NOT EXISTS idx_file_links_user ON public.file_links (user_id);

ALTER TABLE public.file_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS file_links_select_own ON public.file_links;
CREATE POLICY file_links_select_own ON public.file_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS required_lookups JSONB NOT NULL DEFAULT '[]'::jsonb;
