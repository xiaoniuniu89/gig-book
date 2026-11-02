-- Account page and press kit (R11). Safe to run more than once.
--
-- profiles gains bio, instruments, contact, share settings and an optional public page slug.
-- Contact details and bio are NOT readable through plain selects: column grants keep `id` and
-- `display_name` readable (as before) and everything else goes through security-definer functions.
-- Promo files are attachments with profile_id set, stored at user/<uid>/profile/<uuid>-<name>.
-- Run after 0011: the attachment rules below cover every kind of file (note, lick, resource, profile).

alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists instruments text[] not null default '{}';
alter table public.profiles add column if not exists contact jsonb not null default '{}';
alter table public.profiles add column if not exists share jsonb not null default '{}';
alter table public.profiles add column if not exists epk_slug text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.profiles add constraint profiles_bio_len check (bio is null or char_length(bio) <= 5000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_slug_fmt check (epk_slug is null or epk_slug ~ '^[a-z0-9-]{3,40}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_instruments_len check (cardinality(instruments) <= 30);
exception when duplicate_object then null; end $$;
create unique index if not exists profiles_epk_slug_key on public.profiles (epk_slug) where epk_slug is not null;

-- Only display_name is readable by everyone signed in; the rest of the row only through the functions below.
revoke select on public.profiles from authenticated;
grant select (id, display_name, created_at) on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, bio, instruments, contact, share, epk_slug, updated_at) on public.profiles to authenticated;
-- (The existing RLS policies already limit inserts and updates to your own row.)

create or replace function public.profiles_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.profiles_touch();

-- Added here, before the functions below: a SQL function can't be created against a column that doesn't exist yet
-- (found by the test suite on a fresh database).
alter table public.attachments add column if not exists profile_id uuid references public.profiles (id) on delete cascade;
create index if not exists attachments_profile_idx on public.attachments (profile_id);

-- ---------------------------------------------------------------- reading
-- Your whole profile.
create or replace function public.my_profile()
returns table (display_name text, bio text, instruments text[], contact jsonb, share jsonb, epk_slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, p.bio, p.instruments, p.contact, p.share, p.epk_slug
  from public.profiles p where p.id = auth.uid();
$$;

-- The public page: the name, plus bio, instruments and contact fields only where shared 'public'.
create or replace function public.public_profile(p_slug text)
returns table (display_name text, bio text, instruments text[], contact jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name,
    case when p.share ->> 'bio' = 'public' then p.bio end,
    case when p.share ->> 'instruments' = 'public' then p.instruments else '{}' end,
    coalesce((select jsonb_object_agg(c.key, c.value) from jsonb_each(p.contact) c where p.share ->> c.key = 'public'), '{}'::jsonb)
  from public.profiles p where p.epk_slug is not null and p.epk_slug = p_slug;
$$;

-- Files shared 'public' on a public page. The server signs these URLs; the storage bucket stays private.
create or replace function public.public_profile_files(p_slug text)
returns table (storage_path text, kind text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.storage_path, a.kind, a.name
  from public.profiles p join public.attachments a on a.profile_id = p.id
  where p.epk_slug is not null and p.epk_slug = p_slug and p.share ->> ('file:' || a.id::text) = 'public'
  order by a.created_at;
$$;

-- What a person shares with their bands. Until bands exist (#40) only the caller gets anything back;
-- #40 will widen this to "shares a band with the caller" and add per-band overrides.
create or replace function public.band_member_profile(p_user uuid)
returns table (display_name text, bio text, instruments text[], contact jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name,
    case when p.share ->> 'bio' in ('bands', 'public') then p.bio end,
    case when p.share ->> 'instruments' in ('bands', 'public') then p.instruments else '{}' end,
    coalesce((select jsonb_object_agg(c.key, c.value) from jsonb_each(p.contact) c where p.share ->> c.key in ('bands', 'public')), '{}'::jsonb)
  from public.profiles p
  where p.id = p_user and p_user = auth.uid();
$$;

revoke all on function public.my_profile() from public, anon;
revoke all on function public.public_profile(text) from public;
revoke all on function public.public_profile_files(text) from public;
revoke all on function public.band_member_profile(uuid) from public, anon;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.public_profile(text), public.public_profile_files(text) to anon, authenticated;
grant execute on function public.band_member_profile(uuid) to authenticated;

-- ---------------------------------------------------------------- promo files
alter table public.attachments drop constraint if exists attachments_one_parent;
alter table public.attachments add constraint attachments_one_parent
  check ((note_id is not null)::int + (lick_id is not null)::int + (resource_id is not null)::int + (profile_id is not null)::int = 1);

-- user/<uid>/profile/<file>: only the owner reads, writes and deletes (public files go through signed URLs made on the server).
create or replace function public.is_profile_path(p_path text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_path ~ '^user/[0-9a-f-]{36}/profile/[^/]+$' and split_part(p_path, '/', 2) = auth.uid()::text;
$$;

create or replace function public.can_read_attachment_path(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n public.notes := public.attachment_path_note(p_path);
  l public.licks := public.attachment_path_lick(p_path);
  r public.resources := public.attachment_path_resource(p_path);
begin
  if auth.uid() is null then return false; end if;
  if public.is_profile_path(p_path) then return true; end if;
  if r.id is not null then return r.owner = auth.uid(); end if;
  if l.id is not null then return public.lick_visible(l.id); end if;
  if n.id is null then return false; end if;
  if n.setlist_id is not null then return public.setlist_readable(n.setlist_id); end if;
  return n.author = auth.uid();
end;
$$;

create or replace function public.can_write_attachment_path(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n public.notes := public.attachment_path_note(p_path);
  l public.licks := public.attachment_path_lick(p_path);
  r public.resources := public.attachment_path_resource(p_path);
begin
  if auth.uid() is null then return false; end if;
  if public.is_profile_path(p_path) then return true; end if;
  if r.id is not null then return r.owner = auth.uid(); end if;
  if l.id is not null then return l.owner = auth.uid(); end if;
  if n.id is null then return false; end if;
  if n.setlist_id is not null then return public.setlist_role(n.setlist_id) is not null; end if;
  return n.author = auth.uid();
end;
$$;
revoke all on function public.is_profile_path(text) from public, anon;
grant execute on function public.is_profile_path(text) to authenticated;

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using (
    (note_id is not null and exists (select 1 from public.notes n where n.id = note_id))
    or (lick_id is not null and public.lick_visible(lick_id))
    or (resource_id is not null and exists (select 1 from public.resources r where r.id = resource_id and r.owner = auth.uid()))
    or profile_id = auth.uid()
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_write_attachment_path(storage_path)
    and (
      (note_id is not null and lick_id is null and resource_id is null and profile_id is null and split_part(storage_path, '/', 3) = note_id::text)
      or (lick_id is not null and note_id is null and resource_id is null and profile_id is null and split_part(storage_path, '/', 4) = lick_id::text
          and public.lick_owner(lick_id) = auth.uid())
      or (resource_id is not null and note_id is null and lick_id is null and profile_id is null and split_part(storage_path, '/', 4) = resource_id::text
          and exists (select 1 from public.resources r where r.id = resource_id and r.owner = auth.uid()))
      or (profile_id is not null and note_id is null and lick_id is null and resource_id is null and profile_id = auth.uid()
          and public.is_profile_path(storage_path))
    )
  );
-- attachments_delete (uploader, or setlist owner for notes) already covers profile files: the uploader owns them.
