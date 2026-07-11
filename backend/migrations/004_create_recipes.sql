-- Migration 004: Recipes — saved, reusable transformation pipelines.
--
-- A recipe snapshots a file's transformation step chain so the same cleanup
-- can be re-applied to future uploads without re-prompting the LLM. steps is
-- a JSONB array of {step_number, instruction, sql_query}; required_columns
-- captures the source file's base schema for friendly compatibility errors
-- (the authoritative check at apply time is a DuckDB EXPLAIN dry run).
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.recipes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  source_file_id   UUID REFERENCES public.files(id) ON DELETE SET NULL,
  steps            JSONB NOT NULL,
  required_columns JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipes_user ON public.recipes (user_id, created_at DESC);

-- RLS: backend service role bypasses; authenticated users read their own.
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recipes_select_own ON public.recipes;
CREATE POLICY recipes_select_own ON public.recipes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);
