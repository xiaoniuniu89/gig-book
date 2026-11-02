-- Resources (R12): bookmarks and books/PDFs, private to their owner. Safe to run more than once.
--
-- A resource is a link or a file. It can be pinned to a song (song_key, see 0004) in the owner's own view only.
-- Files live at  user/<owner>/resources/<resource_id>/<uuid>-<name>  in the private `attachments` bucket (0005).

-- ---------------------------------------------------------------- resources
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('link', 'file')),
  title text not null check (char_length(title) between 1 and 200),
  url text check (char_length(url) <= 2000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  note text not null default '' check (char_length(note) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_link_has_url check (kind <> 'link' or url is not null)
);
create index if not exists resources_owner_idx on public.resources (owner, created_at desc);

create or replace function public.resources_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.owner is distinct from old.owner then
    raise exception 'A resource can''t change owner.' using errcode = '22023';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists resources_update_guard on public.resources;
create trigger resources_update_guard before update on public.resources
  for each row execute function public.resources_before_update();

-- ---------------------------------------------------------------- resource_links
create table if not exists public.resource_links (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  song_key text not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (resource_id, song_key, created_by)
);
create index if not exists resource_links_song_idx on public.resource_links (created_by, song_key);

-- ---------------------------------------------------------------- row-level security (owner only)
alter table public.resources enable row level security;

drop policy if exists resources_all on public.resources;
create policy resources_all on public.resources for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

revoke all on public.resources from anon, public;
grant select, insert, update, delete on public.resources to authenticated;

alter table public.resource_links enable row level security;

drop policy if exists resource_links_all on public.resource_links;
create policy resource_links_all on public.resource_links for all to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.resources r where r.id = resource_id and r.owner = auth.uid())
  );

revoke all on public.resource_links from anon, public;
grant select, insert, delete on public.resource_links to authenticated;

-- ---------------------------------------------------------------- attachments: note, lick or resource
alter table public.attachments add column if not exists resource_id uuid references public.resources (id) on delete cascade;
create index if not exists attachments_resource_idx on public.attachments (resource_id);

alter table public.attachments drop constraint if exists attachments_one_parent;
alter table public.attachments add constraint attachments_one_parent check (
  (note_id is not null)::int + (lick_id is not null)::int + (resource_id is not null)::int = 1
);

-- The resource a path points at: user/<owner>/resources/<resource_id>/<file>
create or replace function public.attachment_path_resource(p_path text)
returns public.resources
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m text[] := regexp_match(p_path, '^user/([0-9a-f-]{36})/resources/([0-9a-f-]{36})/[^/]+$');
  r public.resources;
begin
  if m is null then return null; end if;
  begin
    select * into r from public.resources where id = m[2]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  if not found or r.owner::text <> m[1] then return null; end if;
  return r;
end;
$$;
revoke all on function public.attachment_path_resource(text) from public, anon, authenticated;

-- Storage access: resource files are readable and writable by their owner only.
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
  if r.id is not null then return r.owner = auth.uid(); end if;
  if l.id is not null then return l.owner = auth.uid(); end if;
  if n.id is null then return false; end if;
  if n.setlist_id is not null then return public.setlist_role(n.setlist_id) is not null; end if;
  return n.author = auth.uid();
end;
$$;
-- (can_delete_attachment_path from 0005 already lets the uploader delete, which covers the owner's resource files.)

-- ---------------------------------------------------------------- attachments table policies
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using (
    (note_id is not null and exists (select 1 from public.notes n where n.id = note_id))
    or (lick_id is not null and public.lick_visible(lick_id))
    or (resource_id is not null and exists (select 1 from public.resources r where r.id = resource_id and r.owner = auth.uid()))
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_write_attachment_path(storage_path)
    and (
      (note_id is not null and lick_id is null and resource_id is null and split_part(storage_path, '/', 3) = note_id::text)
      or (lick_id is not null and note_id is null and resource_id is null and split_part(storage_path, '/', 4) = lick_id::text
          and public.lick_owner(lick_id) = auth.uid())
      or (resource_id is not null and note_id is null and lick_id is null and split_part(storage_path, '/', 4) = resource_id::text
          and exists (select 1 from public.resources r where r.id = resource_id and r.owner = auth.uid()))
    )
  );
-- attachments_delete (0007) is "the uploader, or the setlist owner for notes": the uploader is the resource owner.
