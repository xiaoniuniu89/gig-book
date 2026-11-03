-- Charts on a tune (R3.4, replaces "use as chart" on note files): a named PDF / image / MusicXML chart, with an
-- optional recording, shown as a tab next to the iReal chart. Safe to run more than once.
--
--   * personal: setlist_id null. Only the owner sees it, on that song (song_key, see songKey() in lib/songs.ts)
--     everywhere: the library and every setlist with the song.
--   * shared: setlist_id set. Everyone who can read that setlist sees it on that song in that setlist.
--
-- Files live in their own private bucket `charts`, at <owner>/<chart_id>/<uuid>-<safe-filename>, so none of the
-- `attachments` rules (attachments_one_parent, can_read/write_attachment_path) change.
-- chart_choices (0005) is no longer used by the app; it stays for now.

insert into storage.buckets (id, name, public, file_size_limit) values ('charts', 'charts', false, 20 * 1024 * 1024)
on conflict (id) do update set public = false, file_size_limit = 20 * 1024 * 1024;

create table if not exists public.charts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_key text not null check (char_length(song_key) between 1 and 400),
  setlist_id uuid references public.setlists (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  file_path text not null unique,
  file_kind text not null check (file_kind in ('pdf', 'image', 'musicxml')),
  file_name text not null check (char_length(file_name) between 1 and 300),
  file_mime text not null check (char_length(file_mime) <= 200),
  file_size bigint not null default 0,
  audio_path text unique,
  audio_name text check (char_length(audio_name) <= 300),
  audio_mime text check (char_length(audio_mime) <= 200),
  audio_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists charts_owner_song_idx on public.charts (owner, song_key);
create index if not exists charts_setlist_song_idx on public.charts (setlist_id, song_key);

-- Files must sit in the owner's folder for this chart, so a row can never point at someone else's file.
do $$ begin
  alter table public.charts add constraint charts_file_in_folder check (
    split_part(file_path, '/', 1) = owner::text and split_part(file_path, '/', 2) = id::text
    and (audio_path is null or (split_part(audio_path, '/', 1) = owner::text and split_part(audio_path, '/', 2) = id::text))
  );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.charts add constraint charts_audio_whole check ((audio_path is null) = (audio_name is null) and (audio_path is null) = (audio_mime is null));
exception when duplicate_object then null; end $$;

alter table public.charts enable row level security;

drop policy if exists charts_select on public.charts;
create policy charts_select on public.charts for select to authenticated
  using (owner = auth.uid() or (setlist_id is not null and public.setlist_readable(setlist_id)));

-- Anyone in a setlist (viewers too, like notes) can share a chart with it.
drop policy if exists charts_insert on public.charts;
create policy charts_insert on public.charts for insert to authenticated
  with check (owner = auth.uid() and (setlist_id is null or public.setlist_role(setlist_id) is not null));

drop policy if exists charts_update on public.charts;
create policy charts_update on public.charts for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and (setlist_id is null or public.setlist_role(setlist_id) is not null));

-- The owner, or the setlist's owner for a chart shared with their setlist.
drop policy if exists charts_delete on public.charts;
create policy charts_delete on public.charts for delete to authenticated
  using (owner = auth.uid() or (setlist_id is not null and public.setlist_role(setlist_id) = 'owner'));

revoke all on public.charts from anon, public;
grant select, insert, delete on public.charts to authenticated;
grant update (name, setlist_id, audio_path, audio_name, audio_mime, audio_size, updated_at) on public.charts to authenticated;

-- ---------------------------------------------------------------- storage
-- Read: your own folder, or a file of a chart you can see.
create or replace function public.can_read_chart_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    split_part(p_path, '/', 1) = auth.uid()::text
    or exists (
      select 1 from public.charts c
      where (c.file_path = p_path or c.audio_path = p_path)
        and c.setlist_id is not null and public.setlist_readable(c.setlist_id)
    )
  );
$$;

-- Delete: your own folder, or the files of a chart shared with a setlist you own.
create or replace function public.can_delete_chart_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    split_part(p_path, '/', 1) = auth.uid()::text
    or exists (
      select 1 from public.charts c
      where (c.file_path = p_path or c.audio_path = p_path)
        and c.setlist_id is not null and public.setlist_role(c.setlist_id) = 'owner'
    )
  );
$$;

revoke all on function public.can_read_chart_path(text) from public, anon;
revoke all on function public.can_delete_chart_path(text) from public, anon;
grant execute on function public.can_read_chart_path(text), public.can_delete_chart_path(text) to authenticated;

drop policy if exists charts_read on storage.objects;
create policy charts_read on storage.objects for select to authenticated
  using (bucket_id = 'charts' and public.can_read_chart_path(name));

-- Upload only into your own folder.
drop policy if exists charts_insert on storage.objects;
create policy charts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'charts' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists charts_delete on storage.objects;
create policy charts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'charts' and public.can_delete_chart_path(name));
