-- Attachments on notes (R6) and "use as chart" for a tune (R3.4). Safe to run more than once.
--
-- Files live in the private Storage bucket `attachments`, at
--   setlist/<setlist_id>/<note_id>/<uuid>-<safe-filename>   (notes on a setlist or one of its tunes)
--   user/<user_id>/<note_id>/<uuid>-<safe-filename>         (personal song notes)
-- Access is derived from that path: whoever can read / write the parent note can read / upload the file.
-- No size limit beyond Supabase's own defaults (R6.5).

insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
on conflict (id) do update set public = false;

-- ---------------------------------------------------------------- path helpers
-- The note a path points at, if the path is well-formed: <home>/<home_id>/<note_id>/<file>
create or replace function public.attachment_path_note(p_path text)
returns public.notes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m text[] := regexp_match(p_path, '^(setlist|user)/([0-9a-f-]{36})/([0-9a-f-]{36})/[^/]+$');
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
  if m[1] = 'user' and n.setlist_id is null and n.author::text = m[2] then return n; end if;
  return null;
end;
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
begin
  if auth.uid() is null or n.id is null then return false; end if;
  if n.setlist_id is not null then return public.setlist_readable(n.setlist_id); end if;
  return n.author = auth.uid();
end;
$$;

-- Any member of the setlist (viewers too, R4.3), or the author of a personal note.
create or replace function public.can_write_attachment_path(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n public.notes := public.attachment_path_note(p_path);
begin
  if auth.uid() is null or n.id is null then return false; end if;
  if n.setlist_id is not null then return public.setlist_role(n.setlist_id) is not null; end if;
  return n.author = auth.uid();
end;
$$;

revoke all on function public.attachment_path_note(text) from public, anon, authenticated;
revoke all on function public.can_read_attachment_path(text) from public, anon;
revoke all on function public.can_write_attachment_path(text) from public, anon;
grant execute on function public.can_read_attachment_path(text) to authenticated;
grant execute on function public.can_write_attachment_path(text) to authenticated;

-- ---------------------------------------------------------------- storage policies
drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.can_read_attachment_path(name));

drop policy if exists attachments_insert on storage.objects;
create policy attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_write_attachment_path(name));

-- The uploader, or the setlist owner.
drop policy if exists attachments_delete on storage.objects;
create policy attachments_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (
      owner_id = auth.uid()::text
      or exists (
        select 1 from public.notes n
        where n.id = (public.attachment_path_note(name)).id
          and n.setlist_id is not null and public.setlist_role(n.setlist_id) = 'owner'
      )
    )
  );

-- ---------------------------------------------------------------- attachments table
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references public.notes (id) on delete cascade,
  lick_id uuid,  -- for the lick library; no foreign key until that table exists
  storage_path text not null unique,
  kind text not null check (kind in ('pdf', 'image', 'audio')),
  name text not null check (char_length(name) between 1 and 300),
  mime text not null,
  size bigint not null default 0,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists attachments_note_idx on public.attachments (note_id);

alter table public.attachments enable row level security;

-- Mirrors the parent note: if you can see the note you can see its files.
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using (note_id is not null and exists (select 1 from public.notes n where n.id = note_id));

-- Any member who can add notes can attach; the path must match the note's home so the storage policies line up.
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    created_by = auth.uid()
    and note_id is not null
    and public.can_write_attachment_path(storage_path)
    and (public.attachment_path_note(storage_path)).id = note_id
  );

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.notes n
      where n.id = note_id and n.setlist_id is not null and public.setlist_role(n.setlist_id) = 'owner'
    )
  );

revoke all on public.attachments from anon, public;
grant select, insert, delete on public.attachments to authenticated;

-- ---------------------------------------------------------------- "use as chart" (R3.4)
-- Each person picks, per tune, which PDF/image to show in their chart view instead of the iReal chart.
create table if not exists public.chart_choices (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  setlist_item_id uuid not null references public.setlist_items (id) on delete cascade,
  attachment_id uuid not null references public.attachments (id) on delete cascade,
  primary key (user_id, setlist_item_id)
);

alter table public.chart_choices enable row level security;

drop policy if exists chart_choices_all on public.chart_choices;
create policy chart_choices_all on public.chart_choices for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.attachments a where a.id = attachment_id)  -- must be able to see the file
    and exists (select 1 from public.setlist_items i where i.id = setlist_item_id)
  );

revoke all on public.chart_choices from anon, public;
grant select, insert, update, delete on public.chart_choices to authenticated;
