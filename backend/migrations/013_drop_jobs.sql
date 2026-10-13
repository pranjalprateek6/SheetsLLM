-- 013: drop the jobs table.
--
-- The async job runner it backed was retired with POST /transform; nothing
-- reads or writes public.jobs any more, and account deletion no longer
-- touches it. Optional: the table is harmless if left, this only tidies.
--
-- Idempotent: safe to run more than once.

DROP TABLE IF EXISTS public.jobs;
