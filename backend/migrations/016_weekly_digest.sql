-- 016: the weekly digest, from inside Supabase.
--
-- Every Monday the backend mails the week's numbers to every address in
-- ADMIN_EMAILS (when RESEND_API_KEY and REMINDER_FROM are set on Render).
-- The endpoint is public but needs the CRON_SECRET header; set the same
-- value on Render as CRON_SECRET and paste it below before running this.
--
-- Run in the Supabase SQL editor. To stop it: select cron.unschedule('weekly-digest');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'weekly-digest') then
    perform cron.unschedule('weekly-digest');
  end if;
end $$;

-- 03:45 UTC on Mondays, 09:15 IST
select cron.schedule(
  'weekly-digest',
  '45 3 * * 1',
  $$ select net.http_post(
       url := 'https://sheetsllm.onrender.com/admin/digest/run',
       headers := jsonb_build_object('X-Cron-Secret', 'PASTE_CRON_SECRET_HERE', 'Content-Type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 90000
     ) $$
);
