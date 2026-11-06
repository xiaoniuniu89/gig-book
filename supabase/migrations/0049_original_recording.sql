-- An original song can carry one recording (audio, 25 MB) the writer uploads, since there's none on Spotify or YouTube to find.
-- It lives in its own private bucket `original-recordings`, at <owner>/<id>/<uuid>-<name>; whoever can see the song can play it.
-- Like the lead sheet, the row names the path first and the upload must match a row of yours, so the daily cap holds.

insert into storage.buckets (id, name, public, file_size_limit) values ('original-recordings', 'original-recordings', false, 25 * 1024 * 1024)
on conflict (id) do update set public = false, file_size_limit = 25 * 1024 * 1024;

alter table public.original_songs add column if not exists recording_path text unique
  check (recording_path is null or char_length(recording_path) between 1 and 600);
alter table public.original_songs add column if not exists recording_name text
  check (recording_name is null or char_length(recording_name) between 1 and 300);
alter table public.original_songs add column if not exists recording_mime text
  check (recording_mime is null or char_length(recording_mime) between 1 and 200);
alter table public.original_songs add column if not exists recording_size bigint
  check (recording_size is null or recording_size between 0 and 25 * 1024 * 1024);
do $$ begin
  alter table public.original_songs add constraint original_songs_rec_chk
    check ((recording_path is null) = (recording_name is null and recording_mime is null and recording_size is null));
exception when duplicate_object then null; end $$;

-- insert and update keep every earlier rule (0041) and add the same path rule for the recording
drop policy if exists original_songs_insert on public.original_songs;
create policy original_songs_insert on public.original_songs for insert to authenticated
  with check (owner = auth.uid()
    and (band_id is null or public.band_role(band_id) is not null)
    and (lead_sheet_path is null or (split_part(lead_sheet_path, '/', 1) = auth.uid()::text and split_part(lead_sheet_path, '/', 2) = id::text))
    and (recording_path is null or (split_part(recording_path, '/', 1) = auth.uid()::text and split_part(recording_path, '/', 2) = id::text)));
drop policy if exists original_songs_update on public.original_songs;
create policy original_songs_update on public.original_songs for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid()
    and (band_id is null or public.band_role(band_id) is not null)
    and (lead_sheet_path is null or (split_part(lead_sheet_path, '/', 1) = auth.uid()::text and split_part(lead_sheet_path, '/', 2) = id::text))
    and (recording_path is null or (split_part(recording_path, '/', 1) = auth.uid()::text and split_part(recording_path, '/', 2) = id::text)));

-- the daily cap now counts a new recording too
create or replace function public.original_songs_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- an update counts only when it puts a new file in (removing one is free)
  if tg_op = 'UPDATE'
    and (new.lead_sheet_path is null or new.lead_sheet_path is not distinct from old.lead_sheet_path)
    and (new.recording_path is null or new.recording_path is not distinct from old.recording_path) then return new; end if;
  perform pg_advisory_xact_lock(hashtext('originals:' || new.owner::text));
  delete from public.original_upload_log where owner = new.owner and at < now() - interval '2 days';
  if (select count(*) from public.original_upload_log where owner = new.owner and at > now() - interval '24 hours') >= 20 then
    raise exception 'That''s 20 new songs or lead sheets today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  insert into public.original_upload_log (owner) values (new.owner);
  return new;
end $$;
revoke all on function public.original_songs_cap() from public, anon, authenticated;

-- Storage: read follows the row's rules (the lookup runs as you, so the table's policy decides); upload only to a path one of
-- your rows names; delete only under your own folder.
drop policy if exists original_recordings_read on storage.objects;
create policy original_recordings_read on storage.objects for select to authenticated
  using (bucket_id = 'original-recordings' and exists (select 1 from public.original_songs o where o.recording_path = objects.name));
drop policy if exists original_recordings_insert on storage.objects;
create policy original_recordings_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'original-recordings' and split_part(name, '/', 1) = auth.uid()::text
    and exists (select 1 from public.original_songs o where o.recording_path = objects.name and o.owner = auth.uid()));
drop policy if exists original_recordings_delete on storage.objects;
create policy original_recordings_delete on storage.objects for delete to authenticated
  using (bucket_id = 'original-recordings' and split_part(name, '/', 1) = auth.uid()::text);
