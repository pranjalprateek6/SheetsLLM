-- 019: a recipe's history.
--
-- Every change to a recipe (saved, steps reordered or removed, steps taken
-- from another file, renamed, checks changed, restored, imported) keeps the
-- recipe as it then was, so an older version can be looked at and brought
-- back. The backend keeps the last 50 versions of each recipe.
--
-- Idempotent: safe to run more than once. Run in the Supabase SQL editor.

create table if not exists public.recipe_versions (
  id               uuid primary key default gen_random_uuid(),
  recipe_id        uuid not null references public.recipes(id) on delete cascade,
  user_id          text not null,
  version          integer not null,
  reason           text not null,
  -- The version restored from, for reason 'restored'
  restored_from    integer,
  name             text not null,
  steps            jsonb not null,
  required_columns jsonb not null default '[]',
  checks           jsonb not null default '[]',
  required_lookups jsonb not null default '[]',
  created_at       timestamptz not null default now(),
  unique (recipe_id, version)
);

create index if not exists idx_recipe_versions_recipe on public.recipe_versions (recipe_id, version desc);

-- RLS: the backend's service role bypasses it; signed-in users read their own.
alter table public.recipe_versions enable row level security;
drop policy if exists recipe_versions_select_own on public.recipe_versions;
create policy recipe_versions_select_own on public.recipe_versions
  for select to authenticated
  using (user_id = auth.uid()::text);
