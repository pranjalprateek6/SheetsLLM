-- 020: a recipe's live link.
--
-- A recipe can have a link that always serves the latest file it cleaned,
-- as CSV, to anyone who has it: paste it into Google Sheets with
-- =IMPORTDATA("...") or into Excel's Data > From Web, and the sheet keeps
-- up with every run. The link is signed; this column holds the key it was
-- signed with, so turning the link off (or making a new one) clears or
-- replaces the key and every old link stops working.
--
-- Idempotent: safe to run more than once. Run in the Supabase SQL editor.

alter table public.recipes add column if not exists live_key text;
