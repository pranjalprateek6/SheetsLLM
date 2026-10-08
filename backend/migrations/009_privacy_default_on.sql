-- Migration 009: strict privacy mode becomes the default.
--
-- New user_settings rows default to privacy_mode = true (schema only, no
-- sample values or rows in LLM prompts), matching what the landing page
-- promises. Existing rows are left exactly as they are: a user who saved a
-- choice keeps it. Users with no row at all are handled in the backend
-- (db.privacy_mode_from_row), which treats "never chose" as strict.
--
-- Idempotent: safe to run more than once.

ALTER TABLE public.user_settings
  ALTER COLUMN privacy_mode SET DEFAULT true;
