-- Bands (R10): members, band setlists, permissions, band notes, band press kit. Safe to run more than once.
--
-- A band has admins (several allowed) and members. Permissions are four booleans:
--   notes (post band notes and notes/replies on band setlists), edit_setlists (change tunes/order/keys of band setlists),
--   add_setlists (share your own setlists with the band), invite (invite people). Admins have all of them.
-- band_members.perms is null = the band's default_perms; otherwise it overrides the defaults key by key.
-- A setlist stays owned by its creator and is *shared with* a band (setlists.band_id).
-- band_members.share: null = this person hasn't confirmed what the band sees of their profile yet (the app asks on
-- their first visit); otherwise {field: true|false} overrides their account-wide "My bands" choice (R11.4) per field.
--
-- Files: band notes use  band/<band_id>/<note_id>/<file>;  the press kit uses  band/<band_id>/kit/<file>.
--
-- NOTE: 0012 replaced attachments_one_parent / attachments_select and the storage path helpers without the
-- resource_id cases from 0011. This migration restores them (resource files are owner-only again) alongside the band cases.

-- ---------------------------------------------------------------- tables
create table if not exists public.bands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  default_perms jsonb not null default '{"notes": true, "edit_setlists": false, "add_setlists": false, "invite": false}'::jsonb,
  bio text check (bio is null or char_length(bio) <= 5000),
  contact jsonb not null default '{}'::jsonb check (jsonb_typeof(contact) = 'object'),
  epk_slug text check (epk_slug is null or epk_slug ~ '^[a-z0-9-]{3,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists bands_epk_slug_key on public.bands (epk_slug) where epk_slug is not null;

create table if not exists public.band_members (
  band_id uuid not null references public.bands (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  plays text[] not null default '{}',
  perms jsonb,
  share jsonb,
  joined_at timestamptz not null default now(),
  primary key (band_id, user_id)
);
create index if not exists band_members_user_idx on public.band_members (user_id);

create table if not exists public.band_invites (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.bands (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '14 days',
  revoked boolean not null default false
);
create index if not exists band_invites_band_idx on public.band_invites (band_id);

alter table public.setlists add column if not exists band_id uuid references public.bands (id) on delete set null;
create index if not exists setlists_band_idx on public.setlists (band_id) where band_id is not null;

alter table public.notes add column if not exists band_id uuid references public.bands (id) on delete cascade;
create index if not exists notes_band_idx on public.notes (band_id) where band_id is not null;
alter table public.notes drop constraint if exists notes_one_home;
alter table public.notes add constraint notes_one_home check (
  (setlist_id is not null and song_key is null and band_id is null)    -- setlist_item_id may be set or null
  or (setlist_id is null and setlist_item_id is null and song_key is not null and band_id is null)
  or (band_id is not null and setlist_id is null and setlist_item_id is null and song_key is null)
);

alter table public.attachments add column if not exists band_id uuid references public.bands (id) on delete cascade;
create index if not exists attachments_band_idx on public.attachments (band_id);
alter table public.attachments drop constraint if exists attachments_one_parent;
alter table public.attachments add constraint attachments_one_parent check (
  (note_id is not null)::int + (lick_id is not null)::int + (profile_id is not null)::int
  + (resource_id is not null)::int + (band_id is not null)::int = 1
);

-- ---------------------------------------------------------------- helpers
-- 'admin', 'member' or null: your role in a band. SECURITY DEFINER so policies can call it without recursing.
create or replace function public.band_role(p_band uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.band_members m where m.band_id = p_band and m.user_id = auth.uid();
$$;

-- Does p_user hold p_perm in the band? Admins hold all; otherwise the member's own setting, else the band default.
create or replace function public.band_perm_of(p_band uuid, p_user uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select m.role = 'admin'
           or coalesce((m.perms ->> p_perm)::boolean, (b.default_perms ->> p_perm)::boolean, false)
    from public.band_members m join public.bands b on b.id = m.band_id
    where m.band_id = p_band and m.user_id = p_user
  ), false);
$$;

create or replace function public.band_perm(p_band uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.band_perm_of(p_band, auth.uid(), p_perm);
$$;

-- Cleaners: keep only known keys / real booleans / short strings.
create or replace function public.band_clean_perms(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'object' then
    nullif((select coalesce(jsonb_object_agg(k, p -> k), '{}'::jsonb)
            from unnest(array['notes', 'edit_setlists', 'add_setlists', 'invite']) k
            where jsonb_typeof(p -> k) = 'boolean'), '{}'::jsonb)
  end;
$$;

create or replace function public.band_clean_plays(p text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(
    select s.t from (
      select left(trim(x), 40) as t, min(o) as o
      from unnest(coalesce(p, '{}'::text[])) with ordinality as u(x, o)
      where trim(x) <> '' group by 1
    ) s order by s.o limit 10
  ), '{}'::text[]);
$$;

-- Does a member's view of a field show? Their per-band override wins, else their account-wide My bands / Public.
create or replace function public.band_shows(p_account jsonb, p_over jsonb, p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((p_over ->> p_key)::boolean, coalesce(p_account ->> p_key, 'private') in ('bands', 'public'));
$$;

-- Can the caller post a note on this setlist? Owner and direct members always; band members need the band's `notes` permission.
create or replace function public.setlist_note_ok(p_setlist uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.setlists s
    where s.id = p_setlist
      and (s.owner = auth.uid()
           or exists (select 1 from public.setlist_members m where m.setlist_id = s.id and m.user_id = auth.uid())
           or (s.band_id is not null and public.band_perm(s.band_id, 'notes')))
  );
$$;

-- ---------------------------------------------------------------- setlist_role knows about bands
-- owner > direct setlist_members row > band member ('editor' with edit_setlists, else 'viewer').
create or replace function public.setlist_role(p_setlist uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.owner = auth.uid() then 'owner'
    else coalesce(
      (select m.role from public.setlist_members m where m.setlist_id = s.id and m.user_id = auth.uid()),
      (select case when public.band_perm(s.band_id, 'edit_setlists') then 'editor' else 'viewer' end
       from public.band_members bm where bm.band_id = s.band_id and bm.user_id = auth.uid())
    )
  end
  from public.setlists s
  where s.id = p_setlist;
$$;

-- Only the owner can put a setlist in or out of a band, and only into a band where they may add setlists.
-- band_* functions below set gigbook.band_sync while they clear band_id (someone left or was removed).
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
  if new.band_id is distinct from old.band_id and coalesce(current_setting('gigbook.band_sync', true), '') <> 'on' then
    if auth.uid() is distinct from old.owner then
      raise exception 'Only the owner can share this setlist with a band.';
    end if;
    if new.band_id is not null and not public.band_perm(new.band_id, 'add_setlists') then
      raise exception 'You can''t add setlists to that band.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- one public address across people and bands
create or replace function public.epk_slug_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.epk_slug is null then return new; end if;
  if (tg_table_name = 'bands' and exists (select 1 from public.profiles p where p.epk_slug = new.epk_slug))
     or (tg_table_name = 'profiles' and exists (select 1 from public.bands b where b.epk_slug = new.epk_slug)) then
    raise exception 'That page address is taken.' using errcode = '23505';
  end if;
  return new;
end;
$$;
drop trigger if exists bands_slug_guard on public.bands;
create trigger bands_slug_guard before insert or update of epk_slug on public.bands
  for each row execute function public.epk_slug_guard();
drop trigger if exists profiles_slug_guard on public.profiles;
create trigger profiles_slug_guard before insert or update of epk_slug on public.profiles
  for each row execute function public.epk_slug_guard();

-- Bands: default permissions always have all four keys; touch updated_at.
create or replace function public.bands_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.default_perms := '{"notes": true, "edit_setlists": false, "add_setlists": false, "invite": false}'::jsonb
                       || coalesce(public.band_clean_perms(new.default_perms), '{}'::jsonb);
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists bands_write on public.bands;
create trigger bands_write before insert or update on public.bands
  for each row execute function public.bands_before_write();

-- ---------------------------------------------------------------- row-level security
alter table public.bands enable row level security;
alter table public.band_members enable row level security;
alter table public.band_invites enable row level security;

-- Bands: members read; admins edit the details. Created and deleted through create_band / band_delete.
drop policy if exists bands_select on public.bands;
create policy bands_select on public.bands for select to authenticated using (public.band_role(id) is not null);
drop policy if exists bands_update on public.bands;
create policy bands_update on public.bands for update to authenticated
  using (public.band_role(id) = 'admin') with check (public.band_role(id) = 'admin');

-- Members read the member list (not `share`); all changes go through the functions below.
drop policy if exists band_members_select on public.band_members;
create policy band_members_select on public.band_members for select to authenticated using (public.band_role(band_id) is not null);

-- band_invites: no direct access at all.

revoke all on public.bands, public.band_members, public.band_invites from anon, public, authenticated;
grant select on public.bands to authenticated;
grant update (name, default_perms, bio, contact, epk_slug) on public.bands to authenticated;
grant select (band_id, user_id, role, plays, perms, joined_at) on public.band_members to authenticated;

-- ---------------------------------------------------------------- notes: band home
create or replace function public.notes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.notes;
begin
  if new.parent_id is not null then
    select * into p from public.notes where id = new.parent_id;
    if not found then
      raise exception 'That note doesn''t exist.' using errcode = 'P0002';
    end if;
    if p.parent_id is not null then
      raise exception 'Replies can''t be nested.' using errcode = '22023';
    end if;
    -- a personal note can only be replied to by its author (nobody else can see it)
    if p.setlist_id is null and p.band_id is null and p.author is distinct from new.author then
      raise exception 'You can''t see that note.' using errcode = '42501';
    end if;
    new.setlist_id := p.setlist_id;
    new.setlist_item_id := p.setlist_item_id;
    new.song_key := p.song_key;
    new.band_id := p.band_id;
    new.tag := null;
  end if;
  if new.setlist_item_id is not null and not exists (
    select 1 from public.setlist_items i where i.id = new.setlist_item_id and i.setlist_id = new.setlist_id
  ) then
    raise exception 'That tune isn''t in that setlist.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.notes_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.author is distinct from old.author or new.setlist_id is distinct from old.setlist_id
     or new.setlist_item_id is distinct from old.setlist_item_id or new.song_key is distinct from old.song_key
     or new.band_id is distinct from old.band_id or new.parent_id is distinct from old.parent_id then
    raise exception 'A note can''t be moved.' using errcode = '22023';
  end if;
  if new.parent_id is not null then new.tag := null; end if;
  new.updated_at = now();
  return new;
end;
$$;

drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes for select to authenticated
  using (case when setlist_id is not null then public.setlist_readable(setlist_id)
              when band_id is not null then public.band_role(band_id) is not null
              else author = auth.uid() end);

drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes for insert to authenticated
  with check (
    author = auth.uid()
    and case when setlist_id is not null then public.setlist_note_ok(setlist_id)  -- any member (viewers too), band members with `notes`
             when band_id is not null then public.band_perm(band_id, 'notes')
             else true end
  );

drop policy if exists notes_update on public.notes;
create policy notes_update on public.notes for update to authenticated
  using (author = auth.uid()
         and case when setlist_id is not null then public.setlist_note_ok(setlist_id)
                  when band_id is not null then public.band_perm(band_id, 'notes')
                  else true end)
  with check (author = auth.uid());

drop policy if exists notes_delete on public.notes;
create policy notes_delete on public.notes for delete to authenticated
  using (author = auth.uid()
         or (setlist_id is not null and public.setlist_role(setlist_id) = 'owner')
         or (band_id is not null and public.band_role(band_id) = 'admin'));

-- ---------------------------------------------------------------- notifications: band kinds
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('added_to_setlist', 'note_on_setlist', 'reply_to_note', 'added_to_band', 'note_in_band'));

--   added_to_band  payload {band_id, band_name}                  -> the person added
--   note_in_band   payload {band_id, band_name, note_id}         -> the other members (replies: the parent's author)
create or replace function public.notify_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_owner uuid;
  v_parent uuid;
  v_payload jsonb;
begin
  if new.band_id is not null then
    select b.name into v_name from public.bands b where b.id = new.band_id;
    v_payload := jsonb_build_object('band_id', new.band_id, 'band_name', v_name, 'note_id', new.id);
    if new.parent_id is null then
      insert into public.notifications (user_id, kind, payload, actor)
      select m.user_id, 'note_in_band', v_payload, new.author
      from public.band_members m where m.band_id = new.band_id and m.user_id <> new.author;
    else
      select n.author into v_parent from public.notes n where n.id = new.parent_id;
      if v_parent is not null and v_parent <> new.author
         and exists (select 1 from public.band_members m where m.band_id = new.band_id and m.user_id = v_parent) then
        insert into public.notifications (user_id, kind, payload, actor) values (v_parent, 'note_in_band', v_payload, new.author);
      end if;
    end if;
    return new;
  end if;
  if new.setlist_id is null then return new; end if;  -- personal notes never notify
  select s.name, s.owner into v_name, v_owner from public.setlists s where s.id = new.setlist_id;
  if not found then return new; end if;
  v_payload := jsonb_build_object('setlist_id', new.setlist_id, 'setlist_name', v_name, 'note_id', new.id);
  if new.setlist_item_id is not null then
    v_payload := v_payload || jsonb_build_object('item_id', new.setlist_item_id);
  end if;

  if new.parent_id is null then
    insert into public.notifications (user_id, kind, payload, actor)
    select u, 'note_on_setlist', v_payload, new.author
    from (
      select v_owner as u
      union
      select m.user_id from public.setlist_members m where m.setlist_id = new.setlist_id
    ) r
    where r.u is distinct from new.author;
  else
    select n.author into v_parent from public.notes n where n.id = new.parent_id;
    -- only if the parent's author can still see the setlist
    if v_parent is not null and v_parent is distinct from new.author
       and (v_parent = v_owner or exists (
         select 1 from public.setlist_members m where m.setlist_id = new.setlist_id and m.user_id = v_parent
       )) then
      insert into public.notifications (user_id, kind, payload, actor)
      values (v_parent, 'reply_to_note', v_payload || jsonb_build_object('parent_id', new.parent_id), new.author);
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- files: band notes and the press kit
-- The note a path points at: <home>/<home_id>/<note_id>/<file>, home = setlist | user | band.
create or replace function public.attachment_path_note(p_path text)
returns public.notes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m text[] := regexp_match(p_path, '^(setlist|user|band)/([0-9a-f-]{36})/([0-9a-f-]{36})/[^/]+$');
  n public.notes;
begin
  if m is null then return null; end if;
  begin
    select * into n from public.notes where id = m[3]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  if not found then return null; end if;
  if m[1] = 'setlist' and n.setlist_id::text = m[2] then return n; end if;
  if m[1] = 'band' and n.band_id::text = m[2] then return n; end if;
  if m[1] = 'user' and n.setlist_id is null and n.band_id is null and n.author::text = m[2] then return n; end if;
  return null;
end;
$$;

-- The band a press-kit path points at: band/<band_id>/kit/<file>. Null if malformed or the band doesn't exist.
create or replace function public.attachment_path_band_kit(p_path text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m text[] := regexp_match(p_path, '^band/([0-9a-f-]{36})/kit/[^/]+$');
  v uuid;
begin
  if m is null then return null; end if;
  begin
    select b.id into v from public.bands b where b.id = m[1]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return v;
end;
$$;
revoke all on function public.attachment_path_band_kit(text) from public, anon, authenticated;

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
  k uuid := public.attachment_path_band_kit(p_path);
begin
  if auth.uid() is null then return false; end if;
  if public.is_profile_path(p_path) then return true; end if;
  if k is not null then return public.band_role(k) is not null; end if;
  if r.id is not null then return r.owner = auth.uid(); end if;
  if l.id is not null then return public.lick_visible(l.id); end if;
  if n.id is null then return false; end if;
  if n.setlist_id is not null then return public.setlist_readable(n.setlist_id); end if;
  if n.band_id is not null then return public.band_role(n.band_id) is not null; end if;
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
  k uuid := public.attachment_path_band_kit(p_path);
begin
  if auth.uid() is null then return false; end if;
  if public.is_profile_path(p_path) then return true; end if;
  if k is not null then return public.band_role(k) = 'admin'; end if;
  if r.id is not null then return r.owner = auth.uid(); end if;
  if l.id is not null then return l.owner = auth.uid(); end if;
  if n.id is null then return false; end if;
  if n.setlist_id is not null then return public.setlist_note_ok(n.setlist_id); end if;
  if n.band_id is not null then return public.band_perm(n.band_id, 'notes'); end if;
  return n.author = auth.uid();
end;
$$;

-- The uploader, the setlist owner (setlist notes), or a band admin (band notes and press kit files).
create or replace function public.can_delete_attachment_path(p_path text, p_owner text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n public.notes;
  k uuid;
begin
  if auth.uid() is null then return false; end if;
  if p_owner = auth.uid()::text then return true; end if;
  k := public.attachment_path_band_kit(p_path);
  if k is not null then return public.band_role(k) = 'admin'; end if;
  n := public.attachment_path_note(p_path);
  if n.id is null then return false; end if;
  if n.setlist_id is not null then return public.setlist_role(n.setlist_id) = 'owner'; end if;
  return n.band_id is not null and public.band_role(n.band_id) = 'admin';
end;
$$;

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using (
    (note_id is not null and exists (select 1 from public.notes n where n.id = note_id))
    or (lick_id is not null and public.lick_visible(lick_id))
    or profile_id = auth.uid()
    or (resource_id is not null and exists (select 1 from public.resources r where r.id = resource_id and r.owner = auth.uid()))
    or (band_id is not null and public.band_role(band_id) is not null)
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_write_attachment_path(storage_path)
    and (
      (note_id is not null and lick_id is null and profile_id is null and resource_id is null and band_id is null
        and split_part(storage_path, '/', 3) = note_id::text)
      or (lick_id is not null and note_id is null and profile_id is null and resource_id is null and band_id is null
          and split_part(storage_path, '/', 4) = lick_id::text and public.lick_owner(lick_id) = auth.uid())
      or (profile_id is not null and note_id is null and lick_id is null and resource_id is null and band_id is null
          and profile_id = auth.uid() and public.is_profile_path(storage_path))
      or (resource_id is not null and note_id is null and lick_id is null and profile_id is null and band_id is null
          and split_part(storage_path, '/', 4) = resource_id::text
          and exists (select 1 from public.resources r where r.id = resource_id and r.owner = auth.uid()))
      or (band_id is not null and note_id is null and lick_id is null and profile_id is null and resource_id is null
          and split_part(storage_path, '/', 2) = band_id::text and split_part(storage_path, '/', 3) = 'kit'
          and public.band_role(band_id) = 'admin')
    )
  );

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.notes n
      where n.id = note_id
        and ((n.setlist_id is not null and public.setlist_role(n.setlist_id) = 'owner')
             or (n.band_id is not null and public.band_role(n.band_id) = 'admin'))
    )
    or (band_id is not null and public.band_role(band_id) = 'admin')
  );

-- ---------------------------------------------------------------- RPCs
-- Create a band; you become its admin. Your own profile choices apply until you change them (share = {}).
create or replace function public.create_band(p_name text, p_default_perms jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 200 then
    raise exception 'A band needs a name.' using errcode = '22023';
  end if;
  insert into public.bands (name, created_by, default_perms)
  values (trim(p_name), auth.uid(), coalesce(p_default_perms, '{}'::jsonb))
  returning id into v_id;
  insert into public.band_members (band_id, user_id, role, share) values (v_id, auth.uid(), 'admin', '{}'::jsonb);
  return v_id;
end;
$$;

-- People you can invite: an exact email, or part of a display name. Needs `invite`. Up to 10, not already in the band.
-- Instruments come back only if the person shares them with bands.
create or replace function public.band_search_users(p_band uuid, p_q text)
returns table (user_id uuid, display_name text, instruments text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := trim(coalesce(p_q, ''));
begin
  if not public.band_perm(p_band, 'invite') then
    raise exception 'You can''t invite people to this band.' using errcode = '42501';
  end if;
  if char_length(q) < 2 then return; end if;
  return query
    select p.id, coalesce(p.display_name, 'Member'),
           case when p.share ->> 'instruments' in ('bands', 'public') then p.instruments else '{}'::text[] end
    from public.profiles p join auth.users u on u.id = p.id
    where (lower(u.email) = lower(q)
           or p.display_name ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      and not exists (select 1 from public.band_members m where m.band_id = p_band and m.user_id = p.id)
    order by p.display_name
    limit 10;
end;
$$;

-- Add an existing account as a member (they confirm what the band sees on their first visit).
create or replace function public.band_add_member(p_band uuid, p_user uuid, p_plays text[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if not public.band_perm(p_band, 'invite') then
    raise exception 'You can''t invite people to this band.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'No Gig Book account for that person' using errcode = 'P0002';
  end if;
  insert into public.band_members (band_id, user_id, role, plays)
  values (p_band, p_user, 'member', public.band_clean_plays(p_plays))
  on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 and p_user <> auth.uid() then
    insert into public.notifications (user_id, kind, payload, actor)
    select p_user, 'added_to_band', jsonb_build_object('band_id', b.id, 'band_name', b.name), auth.uid()
    from public.bands b where b.id = p_band;
  end if;
end;
$$;

-- An invite link: a token that works for 14 days, for signed-in accounts only.
create or replace function public.band_create_invite(p_band uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.band_perm(p_band, 'invite') then
    raise exception 'You can''t invite people to this band.' using errcode = '42501';
  end if;
  insert into public.band_invites (band_id, created_by) values (p_band, auth.uid()) returning token into v_token;
  return v_token;
end;
$$;

-- Admins switch off every open invite link.
create or replace function public.band_revoke_invites(p_band uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.band_role(p_band) is distinct from 'admin' then
    raise exception 'Only admins can do that.' using errcode = '42501';
  end if;
  update public.band_invites set revoked = true where band_id = p_band and not revoked;
end;
$$;

-- Which band a token is for (to show "Join <band>?"). A link works while it isn't revoked or expired and its creator may still invite.
create or replace function public.band_invite_info(p_token text)
returns table (band_id uuid, band_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.name
  from public.band_invites i join public.bands b on b.id = i.band_id
  where auth.uid() is not null and i.token = p_token and not i.revoked and i.expires_at > now()
    and public.band_perm_of(i.band_id, i.created_by, 'invite');
$$;

create or replace function public.band_accept_invite(p_token text, p_plays text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_band uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select i.band_id into v_band
  from public.band_invites i
  where i.token = p_token and not i.revoked and i.expires_at > now()
    and public.band_perm_of(i.band_id, i.created_by, 'invite');
  if v_band is null then
    raise exception 'This invite link has expired or was switched off.' using errcode = 'P0002';
  end if;
  insert into public.band_members (band_id, user_id, role, plays)
  values (v_band, auth.uid(), 'member', public.band_clean_plays(p_plays))
  on conflict do nothing;
  return v_band;
end;
$$;

-- Admins: change someone's role and per-person permissions (null = the band's defaults). Never leaves a band without an admin.
create or replace function public.band_set_member(p_band uuid, p_user uuid, p_role text, p_perms jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur text;
begin
  if public.band_role(p_band) is distinct from 'admin' then
    raise exception 'Only admins can do that.' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member.' using errcode = '22023';
  end if;
  perform 1 from public.bands b where b.id = p_band for update;  -- serialise admin changes
  select m.role into v_cur from public.band_members m where m.band_id = p_band and m.user_id = p_user;
  if v_cur is null then raise exception 'They''re not in this band.' using errcode = 'P0002'; end if;
  if v_cur = 'admin' and p_role <> 'admin'
     and (select count(*) from public.band_members m where m.band_id = p_band and m.role = 'admin') <= 1 then
    raise exception 'A band needs at least one admin.' using errcode = '22023';
  end if;
  update public.band_members set role = p_role, perms = public.band_clean_perms(p_perms)
  where band_id = p_band and user_id = p_user;
end;
$$;

-- Take a person out of the band; their setlists leave it too.
create or replace function public.band_remove_member(p_band uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.band_role(p_band) is distinct from 'admin' then
    raise exception 'Only admins can do that.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then raise exception 'Use Leave band to leave.' using errcode = '22023'; end if;
  perform set_config('gigbook.band_sync', 'on', true);
  update public.setlists set band_id = null where owner = p_user and band_id = p_band;
  delete from public.band_members where band_id = p_band and user_id = p_user;
end;
$$;

create or replace function public.band_leave(p_band uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.band_role(p_band) is null then return; end if;
  perform 1 from public.bands b where b.id = p_band for update;
  if public.band_role(p_band) = 'admin'
     and not exists (select 1 from public.band_members m where m.band_id = p_band and m.role = 'admin' and m.user_id <> auth.uid()) then
    raise exception 'You''re the only admin. Make someone else an admin first, or delete the band.' using errcode = '22023';
  end if;
  perform set_config('gigbook.band_sync', 'on', true);
  update public.setlists set band_id = null where owner = auth.uid() and band_id = p_band;
  delete from public.band_members where band_id = p_band and user_id = auth.uid();
end;
$$;

create or replace function public.band_delete(p_band uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.band_role(p_band) is distinct from 'admin' then
    raise exception 'Only admins can do that.' using errcode = '42501';
  end if;
  perform set_config('gigbook.band_sync', 'on', true);
  delete from public.bands where id = p_band;  -- members, invites, band notes and files rows go too; setlists stay with their owners
end;
$$;

-- What you play in this band.
create or replace function public.band_set_plays(p_band uuid, p_plays text[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.band_members set plays = public.band_clean_plays(p_plays) where band_id = p_band and user_id = auth.uid();
$$;

-- What this band sees of your profile: {field: true|false}. Fields not listed follow your account-wide My bands choice.
create or replace function public.band_set_share(p_band uuid, p_share jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.band_members
  set share = coalesce((
    select jsonb_object_agg(e.key, e.value)
    from (select * from jsonb_each(case when jsonb_typeof(p_share) = 'object' then p_share else '{}'::jsonb end) limit 60) e
    where jsonb_typeof(e.value) = 'boolean' and char_length(e.key) <= 60
  ), '{}'::jsonb)
  where band_id = p_band and user_id = auth.uid();
$$;

-- Your own per-band choices; null = you haven't confirmed them yet.
create or replace function public.band_my_share(p_band uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select m.share from public.band_members m where m.band_id = p_band and m.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------- reading people
-- What a person shares with a band: only when the caller and the person are in a band together (that band, if given).
-- Each field follows the person's per-band choice, else their account-wide My bands / Public choice (R11.4).
drop function if exists public.band_member_profile(uuid);
create or replace function public.band_member_profile(p_user uuid, p_band uuid default null)
returns table (display_name text, bio text, instruments text[], contact jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with seen as (
    select m.share
    from public.band_members m
    join public.band_members me on me.band_id = m.band_id and me.user_id = auth.uid()
    where m.user_id = p_user and (p_band is null or m.band_id = p_band)
  )
  select p.display_name,
    case when exists (select 1 from seen s where public.band_shows(p.share, s.share, 'bio')) then p.bio end,
    case when exists (select 1 from seen s where public.band_shows(p.share, s.share, 'instruments')) then p.instruments else '{}'::text[] end,
    coalesce((
      select jsonb_object_agg(c.key, c.value)
      from jsonb_each_text(p.contact) c
      where c.value <> '' and exists (select 1 from seen s where public.band_shows(p.share, s.share, c.key))
    ), '{}'::jsonb)
  from public.profiles p
  where p.id = p_user and exists (select 1 from seen);
$$;

-- The members of a band with the profile bits each one shares with it.
create or replace function public.band_member_list(p_band uuid)
returns table (user_id uuid, display_name text, role text, plays text[], perms jsonb, joined_at timestamptz,
               bio text, instruments text[], contact jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, coalesce(p.display_name, 'Member'), m.role, m.plays, m.perms, m.joined_at,
         bp.bio, coalesce(bp.instruments, '{}'::text[]), coalesce(bp.contact, '{}'::jsonb)
  from public.band_members m
  join public.profiles p on p.id = m.user_id
  left join lateral public.band_member_profile(m.user_id, p_band) bp on true
  where m.band_id = p_band and public.band_role(p_band) is not null
  order by m.joined_at;
$$;

-- ---------------------------------------------------------------- public band page (same /epk/<slug> as people)
create or replace function public.public_band(p_slug text)
returns table (name text, bio text, contact jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select b.name, b.bio, b.contact from public.bands b where b.epk_slug is not null and b.epk_slug = p_slug;
$$;

create or replace function public.public_band_files(p_slug text)
returns table (storage_path text, kind text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.storage_path, a.kind, a.name
  from public.bands b join public.attachments a on a.band_id = b.id
  where b.epk_slug is not null and b.epk_slug = p_slug
  order by a.created_at;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on function
  public.band_role(uuid), public.band_perm_of(uuid, uuid, text), public.band_perm(uuid, text),
  public.setlist_note_ok(uuid), public.create_band(text, jsonb), public.band_search_users(uuid, text),
  public.band_add_member(uuid, uuid, text[]), public.band_create_invite(uuid), public.band_revoke_invites(uuid),
  public.band_invite_info(text), public.band_accept_invite(text, text[]), public.band_set_member(uuid, uuid, text, jsonb),
  public.band_remove_member(uuid, uuid), public.band_leave(uuid), public.band_delete(uuid),
  public.band_set_plays(uuid, text[]), public.band_set_share(uuid, jsonb), public.band_my_share(uuid),
  public.band_member_profile(uuid, uuid), public.band_member_list(uuid)
  from public, anon;
-- (band_perm_of is only for the definer functions above; signed-in users can't probe other people's permissions with it)
grant execute on function
  public.band_role(uuid), public.band_perm(uuid, text),
  public.setlist_note_ok(uuid), public.create_band(text, jsonb), public.band_search_users(uuid, text),
  public.band_add_member(uuid, uuid, text[]), public.band_create_invite(uuid), public.band_revoke_invites(uuid),
  public.band_invite_info(text), public.band_accept_invite(text, text[]), public.band_set_member(uuid, uuid, text, jsonb),
  public.band_remove_member(uuid, uuid), public.band_leave(uuid), public.band_delete(uuid),
  public.band_set_plays(uuid, text[]), public.band_set_share(uuid, jsonb), public.band_my_share(uuid),
  public.band_member_profile(uuid, uuid), public.band_member_list(uuid)
  to authenticated;
revoke execute on function public.public_band(text), public.public_band_files(text) from public;
grant execute on function public.public_band(text), public.public_band_files(text) to anon, authenticated;

-- ---------------------------------------------------------------- RLS reasoning (who can do what)
-- admin            all four permissions; edits band details, roles, per-person perms, press kit; removes members;
--                  deletes any band note or kit file; deletes the band. Can't leave/demote if last admin.
-- member, edit_setlists on : setlist_role = 'editor' on band setlists -> existing setlist/item policies and
--                  replace_setlist_items allow edits; setlist owner/visibility/band_id still guarded by guard_setlist_update.
-- member, edit_setlists off: 'viewer' -> read only. Reading follows setlist_readable / setlist_role.
-- member without notes: can read band notes but notes_insert / notes_update / can_write_attachment_path say no.
-- non-member       : band_role is null -> can't select the band, members, band notes, kit files or band setlists
--                  (unless the setlist is shared with them directly); band_*(uuid) functions raise or return nothing.
-- removed member   : band_members row gone, so everything above applies at once; their setlists' band_id is cleared
--                  in the same transaction, so those setlists leave the band.
