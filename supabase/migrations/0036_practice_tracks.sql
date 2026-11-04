-- Transcribe tool (/tools/transcribe): your own uploaded recordings to slow down and loop. Owner only, at most 3
-- each. Safe to run more than once.
--
-- Files live in their own private bucket `practice`, at <owner>/<track_id>/<uuid>-<safe-filename>, so no shared
-- `attachments` or `charts` rule changes. The row is made first and the upload must match a row of yours, so the
-- cap of 3 holds for files too.

insert into storage.buckets (id, name, public, file_size_limit) values ('practice', 'practice', false, 25 * 1024 * 1024)
on conflict (id) do update set public = false, file_size_limit = 25 * 1024 * 1024;

create table if not exists public.practice_tracks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300),
  storage_path text not null unique check (char_length(storage_path) between 1 and 600),
  mime text not null check (mime like 'audio/%' or mime like 'video/%'),
  size bigint not null check (size between 0 and 25 * 1024 * 1024),
  created_at timestamptz not null default now()
);
create index if not exists practice_tracks_owner_idx on public.practice_tracks (owner, created_at);

alter table public.practice_tracks enable row level security;
revoke all on public.practice_tracks from public, anon;
grant select, insert, delete on public.practice_tracks to authenticated;

drop policy if exists practice_tracks_select on public.practice_tracks;
create policy practice_tracks_select on public.practice_tracks for select to authenticated using (owner = auth.uid());
drop policy if exists practice_tracks_insert on public.practice_tracks;
create policy practice_tracks_insert on public.practice_tracks for insert to authenticated
  with check (owner = auth.uid() and split_part(storage_path, '/', 1) = auth.uid()::text and split_part(storage_path, '/', 2) = id::text);
drop policy if exists practice_tracks_delete on public.practice_tracks;
create policy practice_tracks_delete on public.practice_tracks for delete to authenticated using (owner = auth.uid());

-- at most 3 each (locked per owner so two uploads at once can't both slip in)
create or replace function public.practice_tracks_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('practice_tracks:' || new.owner::text));
  if (select count(*) from public.practice_tracks where owner = new.owner) >= 3 then
    raise exception 'You can keep 3 recordings. Delete one first.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.practice_tracks_cap() from public, anon, authenticated;
drop trigger if exists practice_tracks_cap on public.practice_tracks;
create trigger practice_tracks_cap before insert on public.practice_tracks for each row execute function public.practice_tracks_cap();

-- Storage: read and delete in your own folder; upload only to a path one of your rows names.
drop policy if exists practice_read on storage.objects;
create policy practice_read on storage.objects for select to authenticated
  using (bucket_id = 'practice' and split_part(name, '/', 1) = auth.uid()::text);
drop policy if exists practice_insert on storage.objects;
create policy practice_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'practice' and split_part(name, '/', 1) = auth.uid()::text
    and exists (select 1 from public.practice_tracks t where t.storage_path = objects.name and t.owner = auth.uid()));
drop policy if exists practice_delete on storage.objects;
create policy practice_delete on storage.objects for delete to authenticated
  using (bucket_id = 'practice' and split_part(name, '/', 1) = auth.uid()::text);
