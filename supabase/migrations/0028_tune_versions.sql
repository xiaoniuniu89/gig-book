-- Chart versions (R3.5): the reharmonisations players actually recorded, plus versions players add themselves.
-- Shared with everyone signed in, keyed by song_key (norm(title)|norm(composer), lib/songs.ts). Safe to run more than once.
--  * source 'ai': written once per tune by the server (famous recorded versions); carries an "AI can make mistakes" tag
--    until someone checks it (a saved fix or "Mark checked" sets checked_by / checked_at).
--  * source 'community': added by a player; only the author edits or deletes it. 60-char names, 10 new ones a day each.
-- The service role (Dan) can delete anything, since it skips these rules.

create table if not exists public.tune_versions (
  id uuid primary key default gen_random_uuid(),
  song_key text not null check (char_length(song_key) between 1 and 300),
  name text not null check (char_length(name) between 1 and 60),
  changes text not null check (char_length(changes) between 1 and 6000),
  source text not null check (source in ('ai', 'community')),
  checked_by uuid references auth.users (id) on delete set null,
  checked_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tune_versions_song_idx on public.tune_versions (song_key, created_at);
create index if not exists tune_versions_user_idx on public.tune_versions (created_by, created_at);

-- One row per tune the AI has been asked about, ever. The primary key is the lock.
create table if not exists public.tune_version_claims (
  song_key text primary key check (char_length(song_key) between 1 and 300),
  claimed_by uuid default auth.uid() references auth.users (id) on delete set null,
  claimed_at timestamptz not null default now(),
  filled_at timestamptz
);

alter table public.tune_versions enable row level security;
alter table public.tune_version_claims enable row level security;
revoke all on public.tune_versions, public.tune_version_claims from public, anon;
grant select, insert, update, delete on public.tune_versions to authenticated;
grant select on public.tune_version_claims to authenticated;

drop policy if exists tune_versions_select on public.tune_versions;
create policy tune_versions_select on public.tune_versions for select to authenticated using (true);
-- insert: your own community versions only (AI ones go through add_ai_tune_versions)
drop policy if exists tune_versions_insert on public.tune_versions;
create policy tune_versions_insert on public.tune_versions for insert to authenticated
  with check (source = 'community' and created_by = auth.uid());
-- update: any signed-in user may fix an AI version; community versions are the author's. The trigger limits which columns.
drop policy if exists tune_versions_update on public.tune_versions;
create policy tune_versions_update on public.tune_versions for update to authenticated
  using (source = 'ai' or created_by = auth.uid()) with check (source = 'ai' or created_by = auth.uid());
drop policy if exists tune_versions_delete on public.tune_versions;
create policy tune_versions_delete on public.tune_versions for delete to authenticated using (created_by = auth.uid());

drop policy if exists tune_version_claims_select on public.tune_version_claims;
create policy tune_version_claims_select on public.tune_version_claims for select to authenticated using (true);

-- Rules the policies can't express: the daily limit on new versions, which columns may change, and who is recorded as checker.
create or replace function public.tune_versions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if; -- service role / migrations
  if tg_op = 'INSERT' then
    new.checked_by := null; new.checked_at := null; new.updated_at := now();
    if new.source = 'community' and (select count(*) from public.tune_versions
        where created_by = auth.uid() and created_at > now() - interval '24 hours') >= 10 then
      raise exception 'version_limit' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.song_key is distinct from old.song_key or new.source is distinct from old.source
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at or new.id is distinct from old.id then
    raise exception 'Only the name, changes and checked mark can change.' using errcode = '42501';
  end if;
  if new.name is distinct from old.name and old.created_by is distinct from auth.uid() then
    raise exception 'Only the author can rename a version.' using errcode = '42501';
  end if;
  if new.changes is distinct from old.changes and old.source = 'ai' then
    new.checked_by := auth.uid(); new.checked_at := now();   -- saving a fix counts as checking it
  elsif new.checked_by is distinct from old.checked_by or new.checked_at is distinct from old.checked_at then
    if old.source <> 'ai' then raise exception 'Only AI versions are marked checked.' using errcode = '42501'; end if;
    new.checked_by := auth.uid(); new.checked_at := now();   -- never in someone else's name
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists tune_versions_guard on public.tune_versions;
create trigger tune_versions_guard before insert or update on public.tune_versions
  for each row execute function public.tune_versions_guard();

-- Claim the AI run for a tune. True = you may call the model now (and it counted against your daily Niu AI limit);
-- false = someone already did. Raises 'user_limit' / 'site_limit' (from ai_claim) and then nothing is claimed.
create or replace function public.claim_tune_versions(p_song_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare got int;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_song_key is null or char_length(p_song_key) not between 1 and 300 then raise exception 'Bad song.' using errcode = '22023'; end if;
  insert into public.tune_version_claims (song_key, claimed_by) values (p_song_key, auth.uid()) on conflict do nothing;
  get diagnostics got = row_count;
  if got = 0 then return false; end if;
  perform public.ai_claim();   -- rolls the claim back too when a limit is hit
  return true;
end;
$$;

-- Give the claim back when the model could not be reached (not when it simply had nothing): only the claimer, only while empty.
create or replace function public.release_tune_versions(p_song_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.tune_version_claims
  where song_key = p_song_key and claimed_by = auth.uid() and filled_at is null
    and not exists (select 1 from public.tune_versions v where v.song_key = p_song_key and v.source = 'ai');
$$;

-- The server saves what the model wrote, once, for the caller who holds the claim. At most 3, already checked by the server.
create or replace function public.add_ai_tune_versions(p_song_key text, p_versions jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v jsonb; n int := 0;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if jsonb_typeof(p_versions) <> 'array' then raise exception 'Bad versions.' using errcode = '22023'; end if;
  perform 1 from public.tune_version_claims where song_key = p_song_key and claimed_by = auth.uid() and filled_at is null for update;
  if not found then raise exception 'Not yours to fill.' using errcode = '42501'; end if;
  for v in select * from jsonb_array_elements(p_versions) limit 3 loop
    insert into public.tune_versions (song_key, name, changes, source, created_by)
      values (p_song_key, left(v->>'name', 60), left(v->>'changes', 6000), 'ai', null);
    n := n + 1;
  end loop;
  update public.tune_version_claims set filled_at = now() where song_key = p_song_key;
  return n;
end;
$$;

revoke all on function public.tune_versions_guard() from public, anon, authenticated;
revoke all on function public.claim_tune_versions(text), public.release_tune_versions(text), public.add_ai_tune_versions(text, jsonb) from public, anon;
grant execute on function public.claim_tune_versions(text), public.release_tune_versions(text), public.add_ai_tune_versions(text, jsonb) to authenticated;
