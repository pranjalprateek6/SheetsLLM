-- 014: the daily reminders pass, from inside Supabase.
--
-- Once a day the backend looks for recipes that have not run in 28 days
-- and emails their owners (when RESEND_API_KEY is set on Render). The
-- endpoint is public but needs the CRON_SECRET header; set the same value
-- on Render as CRON_SECRET and paste it below before running this.
--
-- Run in the Supabase SQL editor. To stop it: select cron.unschedule('daily-reminders');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-reminders') then
    perform cron.unschedule('daily-reminders');
  end if;
end $$;

-- 03:30 UTC, 09:00 IST, every day
select cron.schedule(
  'daily-reminders',
  '30 3 * * *',
  $$ select net.http_post(
       url := 'https://sheetsllm.onrender.com/reminders/run',
       headers := jsonb_build_object('X-Cron-Secret', 'PASTE_CRON_SECRET_HERE', 'Content-Type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 90000
     ) $$
);
