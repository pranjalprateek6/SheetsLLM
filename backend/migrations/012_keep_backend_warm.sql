-- 012: keep the Render backend warm from inside Supabase.
--
-- The free Render instance sleeps after about 15 minutes idle and takes 50
-- seconds or more to wake, which the first visitor pays for. The GitHub
-- Actions keep-alive (every 10 minutes on paper) fires hours apart in
-- practice, so it never kept the instance up. pg_cron inside the database
-- runs on time, and pg_net makes the request without blocking anything.
--
-- Run in the Supabase SQL editor (both extensions are available on every
-- plan). To stop it later: select cron.unschedule('keep-backend-warm');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One request every 8 minutes, well inside the 15-minute idle window. A
-- repeat run of this file replaces the job rather than adding a second one.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'keep-backend-warm') then
    perform cron.unschedule('keep-backend-warm');
  end if;
end $$;

select cron.schedule(
  'keep-backend-warm',
  '*/8 * * * *',
  $$ select net.http_get(url := 'https://sheetsllm.onrender.com/health', timeout_milliseconds := 90000) $$
);
