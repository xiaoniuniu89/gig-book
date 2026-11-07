-- An original song can carry up to 10 recordings. Safe to run more than once.
-- Each gets a row here; the files stay where they are in the `original-recordings` bucket, at <owner>/<song>/<uuid>-<name>.
-- Whoever can see the song can play them; only the writer adds or removes them. No edits: remove and upload again.
-- The old recording_* columns on original_songs are emptied and unused; drop them in a later migration, once this is live.

create table if not exists public.original_recordings (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.original_songs (id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null unique check (char_length(path) between 1 and 600),
  name text not null check (char_length(name) between 1 and 300),
  mime text not null check (char_length(mime) between 1 and 200),
  size bigint not null check (size between 0 and 25 * 1024 * 1024),
  created_at timestamptz not null default now()
);
create index if not exists original_recordings_song_idx on public.original_recordings (song_id, created_at);

-- Move what's there, before the cap trigger exists so nobody's daily count changes.
drop trigger if exists original_recordings_cap on public.original_recordings;
insert into public.original_recordings (song_id, owner, path, name, mime, size)
  select id, owner, recording_path, coalesce(recording_name, 'recording'), coalesce(recording_mime, 'audio/mpeg'), coalesce(recording_size, 0)
  from public.original_songs where recording_path is not null
  on conflict (path) do nothing;
update public.original_songs set recording_path = null, recording_name = null, recording_mime = null, recording_size = null
  where recording_path is not null;

alter table public.original_recordings enable row level security;
revoke all on public.original_recordings from public, anon;
grant select, insert, delete on public.original_recordings to authenticated;

-- The lookup runs as you, so the song's own policy decides who sees it.
drop policy if exists original_recordings_select on public.original_recordings;
create policy original_recordings_select on public.original_recordings for select to authenticated
  using (exists (select 1 from public.original_songs o where o.id = song_id));
drop policy if exists original_recordings_insert on public.original_recordings;
create policy original_recordings_insert on public.original_recordings for insert to authenticated
  with check (owner = auth.uid()
    and exists (select 1 from public.original_songs o where o.id = song_id and o.owner = auth.uid())
    and split_part(path, '/', 1) = auth.uid()::text and split_part(path, '/', 2) = song_id::text);
drop policy if exists original_recordings_delete on public.original_recordings;
create policy original_recordings_delete on public.original_recordings for delete to authenticated
  using (owner = auth.uid());

-- 10 on a song, and each one counts toward the same daily uploads as songs and lead sheets.
create or replace function public.original_recordings_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('originals:' || new.owner::text));
  if (select count(*) from public.original_recordings where song_id = new.song_id) >= 10 then
    raise exception 'That song already has 10 recordings. Remove one first.' using errcode = 'P0001';
  end if;
  delete from public.original_upload_log where owner = new.owner and at < now() - interval '2 days';
  if (select count(*) from public.original_upload_log where owner = new.owner and at > now() - interval '24 hours') >= 20 then
    raise exception 'That''s 20 new songs or lead sheets today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  insert into public.original_upload_log (owner) values (new.owner);
  return new;
end $$;
revoke all on function public.original_recordings_cap() from public, anon, authenticated;
create trigger original_recordings_cap before insert on public.original_recordings
  for each row execute function public.original_recordings_cap();

-- Storage now follows the new rows. Delete stays as it was: only under your own folder.
drop policy if exists original_recordings_read on storage.objects;
create policy original_recordings_read on storage.objects for select to authenticated
  using (bucket_id = 'original-recordings' and exists (select 1 from public.original_recordings r where r.path = objects.name));
drop policy if exists original_recordings_insert on storage.objects;
create policy original_recordings_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'original-recordings' and split_part(name, '/', 1) = auth.uid()::text
    and exists (select 1 from public.original_recordings r where r.path = objects.name and r.owner = auth.uid()));

notify pgrst, 'reload schema';
