-- Arrangements (R13): your own working copies of tunes, outside any setlist. Owner only. Safe to run more than once.
-- Stored like a setlist tune (song string, key shift, saved recordings). Their private notes, licks and resources
-- use the existing per-song homes with song_key = 'arr:<id>', so no shared rule changes.
create table if not exists public.arrangements (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  song text not null check (char_length(song) between 1 and 20000),   -- the raw iReal Pro song string
  shift smallint check (shift between -11 and 11),                    -- semitones; null = iReal's own key
  versions jsonb not null default '[]'::jsonb check (jsonb_typeof(versions) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists arrangements_owner_idx on public.arrangements (owner, created_at desc);

alter table public.arrangements enable row level security;
revoke all on public.arrangements from public, anon;
grant select, insert, update, delete on public.arrangements to authenticated;

drop policy if exists arrangements_select on public.arrangements;
create policy arrangements_select on public.arrangements for select to authenticated using (owner = auth.uid());
drop policy if exists arrangements_insert on public.arrangements;
create policy arrangements_insert on public.arrangements for insert to authenticated with check (owner = auth.uid());
drop policy if exists arrangements_update on public.arrangements;
create policy arrangements_update on public.arrangements for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists arrangements_delete on public.arrangements;
create policy arrangements_delete on public.arrangements for delete to authenticated using (owner = auth.uid());

-- keep updated_at honest
create or replace function public.arrangements_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists arrangements_touch on public.arrangements;
create trigger arrangements_touch before update on public.arrangements for each row execute function public.arrangements_touch();
