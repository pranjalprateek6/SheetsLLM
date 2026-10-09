-- Migration 010: what each step sent to the AI.
--
-- sent = {mode, columns_sent, sample_rows_sent, values_per_column, source}
-- where source is llm, cache, recipe or op. Counts and column names only,
-- never the sample values themselves. Shown as the "Sent to Chef" receipt.
-- The backend saves steps without it until this is applied.
--
-- Idempotent: safe to run more than once.

ALTER TABLE public.transformations
  ADD COLUMN IF NOT EXISTS sent JSONB;
