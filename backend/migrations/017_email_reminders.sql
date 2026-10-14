-- 017: a switch for recipe reminder emails.
--
-- Every reminder carries a one-click unsubscribe link (and the
-- List-Unsubscribe header); the link and the account page both set this.
-- Until it is applied the backend reads "on" for everyone and the link
-- answers that it could not save.
--
-- Idempotent: safe to run more than once.

alter table public.user_settings
  add column if not exists email_reminders boolean not null default true;
