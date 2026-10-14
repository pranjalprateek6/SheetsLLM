-- 018: recipes that run themselves.
--
-- files.source_url remembers the link a file was fetched from, so a recipe
-- saved from it can offer to fetch the same link next month. recipes.schedule
-- holds {url, day}. A pg_cron job calls the backend daily; the backend runs
-- the recipes scheduled for that day of the month and emails the owners.
--
-- Paste the same CRON_SECRET that is set on Render before running this.
-- Run in the Supabase SQL editor. To stop it: select cron.unschedule('scheduled-runs');

alter table public.files add column if not exists source_url text;
alter table public.recipes add column if not exists schedule jsonb;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'scheduled-runs') then
    perform cron.unschedule('scheduled-runs');
  end if;
end $$;

-- 04:00 UTC, 09:30 IST, every day
select cron.schedule(
  'scheduled-runs',
  '0 4 * * *',
  $$ select net.http_post(
       url := 'https://sheetsllm.onrender.com/schedules/run',
       headers := jsonb_build_object('X-Cron-Secret', 'PASTE_CRON_SECRET_HERE', 'Content-Type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 300000
     ) $$
);
