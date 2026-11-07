-- Recordings on a setlist's tune, so a bandmate can add their take to a song they don't own. Safe to run more than once.
-- Kept to that setlist, by song key, so they survive reordering and don't appear on the song elsewhere.
-- Anyone who can see the setlist can play them; anyone who can edit it can add them, 10 on a tune.
-- The uploader or the setlist's owner can remove one. Files live at <uploader>/<setlist>/<uuid>-<name>.

insert into storage.buckets (id, name, public, file_size_limit) values ('setlist-recordings', 'setlist-recordings', false, 25 * 1024 * 1024)
on conflict (id) do update set public = false, file_size_limit = 25 * 1024 * 1024;

create table if not exists public.setlist_recordings (
  id uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references public.setlists (id) on delete cascade,
  song_key text not null check (char_length(song_key) between 1 and 300),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null unique check (char_length(path) between 1 and 600),
  name text not null check (char_length(name) between 1 and 300),
  mime text not null check (char_length(mime) between 1 and 200),
  size bigint not null check (size between 0 and 25 * 1024 * 1024),
  created_at timestamptz not null default now()
);
create index if not exists setlist_recordings_tune_idx on public.setlist_recordings (setlist_id, song_key, created_at);

alter table public.setlist_recordings enable row level security;
revoke all on public.setlist_recordings from public, anon;
grant select, insert, delete on public.setlist_recordings to authenticated;

drop policy if exists setlist_recordings_select on public.setlist_recordings;
create policy setlist_recordings_select on public.setlist_recordings for select to authenticated
  using (public.setlist_readable(setlist_id));
drop policy if exists setlist_recordings_insert on public.setlist_recordings;
create policy setlist_recordings_insert on public.setlist_recordings for insert to authenticated
  with check (owner = auth.uid() and public.setlist_role(setlist_id) in ('owner', 'editor')
    and split_part(path, '/', 1) = auth.uid()::text and split_part(path, '/', 2) = setlist_id::text);
drop policy if exists setlist_recordings_delete on public.setlist_recordings;
create policy setlist_recordings_delete on public.setlist_recordings for delete to authenticated
  using (owner = auth.uid() or public.setlist_role(setlist_id) = 'owner');

-- 10 on a tune, and the same daily uploads as originals.
create or replace function public.setlist_recordings_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('originals:' || new.owner::text));
  if (select count(*) from public.setlist_recordings where setlist_id = new.setlist_id and song_key = new.song_key) >= 10 then
    raise exception 'That tune already has 10 recordings here. Remove one first.' using errcode = 'P0001';
  end if;
  delete from public.original_upload_log where owner = new.owner and at < now() - interval '2 days';
  if (select count(*) from public.original_upload_log where owner = new.owner and at > now() - interval '24 hours') >= 20 then
    raise exception 'That''s 20 uploads today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  insert into public.original_upload_log (owner) values (new.owner);
  return new;
end $$;
drop trigger if exists setlist_recordings_cap on public.setlist_recordings;
create trigger setlist_recordings_cap before insert on public.setlist_recordings
  for each row execute function public.setlist_recordings_cap();

-- The bell, for people who opted in to updates (0050).
create or replace function public.setlist_recording_updates() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.updates_for_setlist(new.setlist_id, 'file', new.owner);
  return null;
end $$;
drop trigger if exists setlist_recordings_updates on public.setlist_recordings;
create trigger setlist_recordings_updates after insert on public.setlist_recordings
  for each row execute function public.setlist_recording_updates();
revoke all on function public.setlist_recordings_cap(), public.setlist_recording_updates() from public, anon, authenticated;

-- Storage: read follows the row (the lookup runs as you); upload only to a path a row of yours names;
-- delete your own, and the setlist's owner can delete any while its row is still there.
drop policy if exists setlist_recordings_read on storage.objects;
create policy setlist_recordings_read on storage.objects for select to authenticated
  using (bucket_id = 'setlist-recordings' and exists (select 1 from public.setlist_recordings r where r.path = objects.name));
drop policy if exists setlist_recordings_insert on storage.objects;
create policy setlist_recordings_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'setlist-recordings' and split_part(name, '/', 1) = auth.uid()::text
    and exists (select 1 from public.setlist_recordings r where r.path = objects.name and r.owner = auth.uid()));
drop policy if exists setlist_recordings_delete on storage.objects;
create policy setlist_recordings_delete on storage.objects for delete to authenticated
  using (bucket_id = 'setlist-recordings' and (split_part(name, '/', 1) = auth.uid()::text
    or exists (select 1 from public.setlist_recordings r where r.path = objects.name and public.setlist_role(r.setlist_id) = 'owner')));

notify pgrst, 'reload schema';
