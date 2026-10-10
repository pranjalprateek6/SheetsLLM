-- Migration 011: checks a recipe runs on every file it cleans.
--
-- checks = [{type, column, value?}] where type is unique, not_empty,
-- at_least (value: a number) or one_of (value: a list of allowed values).
-- They are evaluated after the recipe's steps, on the cleaned rows, and
-- reported with the run; a failing check warns, it does not undo the run.
-- Until this is applied the backend reads every recipe as having no checks
-- and refuses to save them, saying which migration is missing.
--
-- Idempotent: safe to run more than once.

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS checks JSONB NOT NULL DEFAULT '[]'::jsonb;
