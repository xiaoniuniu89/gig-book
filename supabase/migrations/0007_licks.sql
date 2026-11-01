-- Lick library (R8.1-R8.3). Safe to run more than once.
--
-- A lick is yours (owner-only to edit). It can be linked to a tune of a setlist, to a setlist, or to a song in
-- your own notes (song_key, see 0004). A lick is readable by its owner and by members of any setlist it is
-- linked into; edits show everywhere it's linked. Files live at  user/<owner>/licks/<lick_id>/<uuid>-<name>
-- in the private `attachments` bucket (0005) and follow the lick's visibility.

-- ---------------------------------------------------------------- licks
create table if not exists public.licks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 10000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists licks_owner_idx on public.licks (owner, created_at desc);

create or replace function public.licks_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.owner is distinct from old.owner then
    raise exception 'A lick can''t change owner.' using errcode = '22023';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists licks_update_guard on public.licks;
create trigger licks_update_guard before update on public.licks
  for each row execute function public.licks_before_update();

-- ---------------------------------------------------------------- lick_links
-- One home, like notes: a tune in a setlist (setlist_id + setlist_item_id), a setlist (setlist_id), or a song in
-- the linker's own notes (song_key; only the linker sees it).
create table if not exists public.lick_links (
  id uuid primary key default gen_random_uuid(),
  lick_id uuid not null references public.licks (id) on delete cascade,
  setlist_id uuid references public.setlists (id) on delete cascade,
  setlist_item_id uuid references public.setlist_items (id) on delete cascade,
  song_key text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint lick_links_one_home check (
    (setlist_id is not null and song_key is null)
    or (setlist_id is null and setlist_item_id is null and song_key is not null)
  )
);
create index if not exists lick_links_lick_idx on public.lick_links (lick_id);
create index if not exists lick_links_setlist_idx on public.lick_links (setlist_id, setlist_item_id);
create index if not exists lick_links_song_idx on public.lick_links (created_by, song_key) where song_key is not null;
-- a lick is linked once per home
create unique index if not exists lick_links_item_uq on public.lick_links (lick_id, setlist_item_id) where setlist_item_id is not null;
create unique index if not exists lick_links_setlist_uq on public.lick_links (lick_id, setlist_id) where setlist_id is not null and setlist_item_id is null;
create unique index if not exists lick_links_song_uq on public.lick_links (lick_id, created_by, song_key) where song_key is not null;

create or replace function public.lick_links_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.setlist_item_id is not null and not exists (
    select 1 from public.setlist_items i where i.id = new.setlist_item_id and i.setlist_id = new.setlist_id
  ) then
    raise exception 'That tune isn''t in that setlist.' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists lick_links_insert_guard on public.lick_links;
create trigger lick_links_insert_guard before insert on public.lick_links
  for each row execute function public.lick_links_before_insert();

-- ---------------------------------------------------------------- visibility helpers
-- Security definer so licks and lick_links policies don't recurse into each other.
create or replace function public.lick_owner(p_lick uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select owner from public.licks where id = p_lick $$;

create or replace function public.lick_visible(p_lick uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.licks l where l.id = p_lick and l.owner = auth.uid())
    or exists (
      select 1 from public.lick_links k
      where k.lick_id = p_lick and k.setlist_id is not null and public.setlist_readable(k.setlist_id)
    )
  )
$$;

revoke all on function public.lick_owner(uuid) from public, anon;
revoke all on function public.lick_visible(uuid) from public, anon;
grant execute on function public.lick_owner(uuid) to authenticated;
grant execute on function public.lick_visible(uuid) to authenticated;

-- ---------------------------------------------------------------- row-level security
alter table public.licks enable row level security;

drop policy if exists licks_select on public.licks;
create policy licks_select on public.licks for select to authenticated
  using (public.lick_visible(id));

drop policy if exists licks_insert on public.licks;
create policy licks_insert on public.licks for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists licks_update on public.licks;
create policy licks_update on public.licks for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists licks_delete on public.licks;
create policy licks_delete on public.licks for delete to authenticated
  using (owner = auth.uid());

revoke all on public.licks from anon, public;
grant select, insert, update, delete on public.licks to authenticated;

alter table public.lick_links enable row level security;

-- Setlist links: any member of the setlist. Song links: the person who made them.
drop policy if exists lick_links_select on public.lick_links;
create policy lick_links_select on public.lick_links for select to authenticated
  using (case when setlist_id is not null then public.setlist_readable(setlist_id) else created_by = auth.uid() end);

-- You can only link your own licks, and into a setlist you're a member of (viewers included, like notes).
drop policy if exists lick_links_insert on public.lick_links;
create policy lick_links_insert on public.lick_links for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.lick_owner(lick_id) = auth.uid()
    and (setlist_id is null or public.setlist_role(setlist_id) is not null)
  );

-- Unlinking: the linker, or the setlist owner.
drop policy if exists lick_links_delete on public.lick_links;
create policy lick_links_delete on public.lick_links for delete to authenticated
  using (created_by = auth.uid() or (setlist_id is not null and public.setlist_role(setlist_id) = 'owner'));

revoke all on public.lick_links from anon, public;
grant select, insert, delete on public.lick_links to authenticated;

-- ---------------------------------------------------------------- attachments: note_id or lick_id
do $$ begin
  alter table public.attachments
    add constraint attachments_lick_fk foreign key (lick_id) references public.licks (id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.attachments
    add constraint attachments_one_parent check ((note_id is null) <> (lick_id is null));
exception when duplicate_object then null; end $$;
create index if not exists attachments_lick_idx on public.attachments (lick_id);

-- The lick a path points at: user/<owner>/licks/<lick_id>/<file>
create or replace function public.attachment_path_lick(p_path text)
returns public.licks
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m text[] := regexp_match(p_path, '^user/([0-9a-f-]{36})/licks/([0-9a-f-]{36})/[^/]+$');
  l public.licks;
begin
  if m is null then return null; end if;
  begin
    select * into l from public.licks where id = m[2]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  if not found or l.owner::text <> m[1] then return null; end if;
  return l;
end;
$$;
revoke all on function public.attachment_path_lick(text) from public, anon, authenticated;

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
begin
  if auth.uid() is null then return false; end if;
  if l.id is not null then return public.lick_visible(l.id); end if;
  if n.id is null then return false; end if;
  if n.setlist_id is not null then return public.setlist_readable(n.setlist_id); end if;
  return n.author = auth.uid();
end;
$$;

-- Lick files: only the lick's owner uploads.
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
begin
  if auth.uid() is null then return false; end if;
  if l.id is not null then return l.owner = auth.uid(); end if;
  if n.id is null then return false; end if;
  if n.setlist_id is not null then return public.setlist_role(n.setlist_id) is not null; end if;
  return n.author = auth.uid();
end;
$$;

-- ---------------------------------------------------------------- attachments table policies
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using (
    (note_id is not null and exists (select 1 from public.notes n where n.id = note_id))
    or (lick_id is not null and public.lick_visible(lick_id))
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_write_attachment_path(storage_path)
    and (
      (note_id is not null and lick_id is null and split_part(storage_path, '/', 3) = note_id::text)
      or (lick_id is not null and note_id is null and split_part(storage_path, '/', 4) = lick_id::text
          and public.lick_owner(lick_id) = auth.uid())
    )
  );

-- Notes: the uploader or the setlist owner. Licks: the lick's owner (the uploader).
drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.notes n
      where n.id = note_id and n.setlist_id is not null and public.setlist_role(n.setlist_id) = 'owner'
    )
  );
