-- Gig Book: accounts, setlists, sharing and the iReal library.
-- Apply once to a new Supabase project (SQL editor, or `supabase db push`).
--
-- Access rules (row-level security):
--   * Owners have full access to their setlists and library.
--   * setlist_members: editors can change a setlist's name, playlist and tunes; viewers can read it.
--     Only the owner can delete it, change its visibility or manage members.
--   * visibility 'link' and 'public' setlists can be read by anyone, signed in or not. ('link' is meant to be
--     opened from a shared URL and is never listed; 'public' may be listed in a future browse page.)
--   * library_playlists are private to their owner.
-- Lead sheets (scanned Real Book pages) will come later and must stay private to the uploader, so this
-- migration creates no storage buckets.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- setlists
create type public.setlist_visibility as enum ('private', 'link', 'public');

create table public.setlists (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  spotify_uri text check (spotify_uri is null or spotify_uri ~ '^spotify:(playlist|album|track):[A-Za-z0-9]+$'),
  visibility public.setlist_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index setlists_owner_idx on public.setlists (owner);

create table public.setlist_items (
  id uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references public.setlists (id) on delete cascade,
  position integer not null check (position >= 0),
  set_no smallint not null default 1 check (set_no in (1, 2)),
  song text not null,                                   -- the raw iReal Pro song string
  shift smallint check (shift between -11 and 11),      -- semitones; null = iReal's own key
  versions jsonb not null default '[]'::jsonb check (jsonb_typeof(versions) = 'array'),
  note text,
  created_at timestamptz not null default now()
);
create index setlist_items_setlist_idx on public.setlist_items (setlist_id, position);

create table public.setlist_members (
  setlist_id uuid not null references public.setlists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (setlist_id, user_id)
);
create index setlist_members_user_idx on public.setlist_members (user_id);

-- ---------------------------------------------------------------- library
create table public.library_playlists (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  songs jsonb not null default '[]'::jsonb check (jsonb_typeof(songs) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index library_playlists_owner_idx on public.library_playlists (owner);

-- ---------------------------------------------------------------- helpers
-- Your role on a setlist: 'owner', 'editor', 'viewer' or null. SECURITY DEFINER so policies can call it
-- without recursing through the RLS of the tables it reads.
create or replace function public.setlist_role(p_setlist uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.owner = auth.uid() then 'owner'
    else (select m.role from public.setlist_members m where m.setlist_id = s.id and m.user_id = auth.uid())
  end
  from public.setlists s
  where s.id = p_setlist;
$$;

-- Can the current user (or an anonymous visitor) read this setlist?
create or replace function public.setlist_readable(p_setlist uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.setlists s
    where s.id = p_setlist
      and (s.visibility <> 'private' or public.setlist_role(s.id) is not null)
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger setlists_touch before update on public.setlists
  for each row execute function public.touch_updated_at();
create trigger library_playlists_touch before update on public.library_playlists
  for each row execute function public.touch_updated_at();

-- Editors may update a setlist, but only the owner may hand it over or change who can see it.
create or replace function public.guard_setlist_update()
returns trigger
language plpgsql
as $$
begin
  if new.owner is distinct from old.owner then
    raise exception 'A setlist''s owner can''t be changed.';
  end if;
  if new.visibility is distinct from old.visibility and auth.uid() is distinct from old.owner then
    raise exception 'Only the owner can change who can see this setlist.';
  end if;
  return new;
end;
$$;

create trigger setlists_guard before update on public.setlists
  for each row execute function public.guard_setlist_update();

-- Replace all tunes of a setlist in one transaction (the app saves the whole list after each change).
-- SECURITY INVOKER: row-level security on setlist_items still decides whether this is allowed.
create or replace function public.replace_setlist_items(p_setlist_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(public.setlist_role(p_setlist_id), '') not in ('owner', 'editor') then
    raise exception 'You can''t edit this setlist.' using errcode = '42501';
  end if;
  delete from public.setlist_items where setlist_id = p_setlist_id;
  insert into public.setlist_items (setlist_id, position, set_no, song, shift, versions, note)
  select p_setlist_id, x.position, coalesce(x.set_no, 1), x.song, x.shift, coalesce(x.versions, '[]'::jsonb), x.note
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as x(position integer, set_no smallint, song text, shift smallint, versions jsonb, note text);
  update public.setlists set updated_at = now() where id = p_setlist_id;
end;
$$;

-- ---------------------------------------------------------------- row-level security
alter table public.profiles enable row level security;
alter table public.setlists enable row level security;
alter table public.setlist_items enable row level security;
alter table public.setlist_members enable row level security;
alter table public.library_playlists enable row level security;

-- profiles: signed-in users can see display names (to show who a setlist is shared with); edit only your own.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- setlists
create policy setlists_select on public.setlists for select to anon, authenticated
  using (visibility <> 'private' or owner = auth.uid() or public.setlist_role(id) is not null);
create policy setlists_insert on public.setlists for insert to authenticated
  with check (owner = auth.uid());
create policy setlists_update on public.setlists for update to authenticated
  using (public.setlist_role(id) in ('owner', 'editor'))
  with check (public.setlist_role(id) in ('owner', 'editor'));
create policy setlists_delete on public.setlists for delete to authenticated
  using (owner = auth.uid());

-- setlist_items follow their setlist
create policy setlist_items_select on public.setlist_items for select to anon, authenticated
  using (public.setlist_readable(setlist_id));
create policy setlist_items_insert on public.setlist_items for insert to authenticated
  with check (public.setlist_role(setlist_id) in ('owner', 'editor'));
create policy setlist_items_update on public.setlist_items for update to authenticated
  using (public.setlist_role(setlist_id) in ('owner', 'editor'))
  with check (public.setlist_role(setlist_id) in ('owner', 'editor'));
create policy setlist_items_delete on public.setlist_items for delete to authenticated
  using (public.setlist_role(setlist_id) in ('owner', 'editor'));

-- setlist_members: the owner manages them; members can see their own membership and leave.
create policy setlist_members_select on public.setlist_members for select to authenticated
  using (user_id = auth.uid() or public.setlist_role(setlist_id) = 'owner');
create policy setlist_members_insert on public.setlist_members for insert to authenticated
  with check (public.setlist_role(setlist_id) = 'owner');
create policy setlist_members_update on public.setlist_members for update to authenticated
  using (public.setlist_role(setlist_id) = 'owner')
  with check (public.setlist_role(setlist_id) = 'owner');
create policy setlist_members_delete on public.setlist_members for delete to authenticated
  using (user_id = auth.uid() or public.setlist_role(setlist_id) = 'owner');

-- library_playlists: owner only
create policy library_select on public.library_playlists for select to authenticated using (owner = auth.uid());
create policy library_insert on public.library_playlists for insert to authenticated with check (owner = auth.uid());
create policy library_update on public.library_playlists for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy library_delete on public.library_playlists for delete to authenticated using (owner = auth.uid());

-- ---------------------------------------------------------------- grants
grant usage on schema public to anon, authenticated;
grant select on public.setlists, public.setlist_items to anon;
grant select, insert, update, delete on public.setlists, public.setlist_items, public.setlist_members,
  public.library_playlists, public.profiles to authenticated;
grant execute on function public.setlist_role(uuid), public.setlist_readable(uuid) to anon, authenticated;
grant execute on function public.replace_setlist_items(uuid, jsonb) to authenticated;
revoke execute on function public.replace_setlist_items(uuid, jsonb) from anon, public;
