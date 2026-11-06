-- Original songs (R16): tunes you write yourself, stored as an iReal song string so the chart, transpose, band, setlists,
-- arrangements and iReal export all work unchanged. Private (default), one of your bands, or public (anyone signed in).
-- Safe to run more than once.
--
-- The optional lead sheet (PDF or photo, 10 MB) lives in its own private bucket `leadsheets`, at <owner>/<id>/<uuid>-<name>.
-- Like transcriptions, the row names the path first and the upload must match a row of yours, so the daily cap holds.

insert into storage.buckets (id, name, public, file_size_limit) values ('leadsheets', 'leadsheets', false, 10 * 1024 * 1024)
on conflict (id) do update set public = false, file_size_limit = 10 * 1024 * 1024;

create table if not exists public.original_songs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- the iReal song string: title=composer=?=style=key=transpose=music=comp=tempo=repeats
  raw text not null check (char_length(raw) between 10 and 40000),
  -- copied from raw by a trigger, so search and lists never need to decode the music
  title text not null default '' check (char_length(title) <= 200),
  composer text not null default '' check (char_length(composer) <= 200),
  visibility text not null default 'private' check (visibility in ('private', 'band', 'public')),
  band_id uuid references public.bands (id) on delete set null,
  lead_sheet_path text unique check (lead_sheet_path is null or char_length(lead_sheet_path) between 1 and 600),
  lead_sheet_kind text check (lead_sheet_kind is null or lead_sheet_kind in ('pdf', 'image')),
  lead_sheet_name text check (lead_sheet_name is null or char_length(lead_sheet_name) between 1 and 300),
  lead_sheet_mime text check (lead_sheet_mime is null or char_length(lead_sheet_mime) between 1 and 200),
  lead_sheet_size bigint check (lead_sheet_size is null or lead_sheet_size between 0 and 10 * 1024 * 1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- "band" needs a band; the other two have none (a band that is deleted turns the song private, see the trigger)
do $$ begin
  alter table public.original_songs add constraint original_songs_band_chk
    check ((visibility = 'band') = (band_id is not null));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.original_songs add constraint original_songs_sheet_chk
    check ((lead_sheet_path is null) = (lead_sheet_kind is null and lead_sheet_name is null and lead_sheet_mime is null and lead_sheet_size is null));
exception when duplicate_object then null; end $$;
create index if not exists original_songs_owner_idx on public.original_songs (owner, created_at);
create index if not exists original_songs_band_idx on public.original_songs (band_id) where band_id is not null;
create index if not exists original_songs_public_idx on public.original_songs (title) where visibility = 'public';

alter table public.original_songs enable row level security;
revoke all on public.original_songs from public, anon;
grant select, insert, update, delete on public.original_songs to authenticated;

drop policy if exists original_songs_select on public.original_songs;
create policy original_songs_select on public.original_songs for select to authenticated
  using (owner = auth.uid() or visibility = 'public' or (visibility = 'band' and public.band_role(band_id) is not null));
drop policy if exists original_songs_insert on public.original_songs;
create policy original_songs_insert on public.original_songs for insert to authenticated
  with check (owner = auth.uid()
    and (band_id is null or public.band_role(band_id) is not null)
    and (lead_sheet_path is null or (split_part(lead_sheet_path, '/', 1) = auth.uid()::text and split_part(lead_sheet_path, '/', 2) = id::text)));
drop policy if exists original_songs_update on public.original_songs;
create policy original_songs_update on public.original_songs for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid()
    and (band_id is null or public.band_role(band_id) is not null)
    and (lead_sheet_path is null or (split_part(lead_sheet_path, '/', 1) = auth.uid()::text and split_part(lead_sheet_path, '/', 2) = id::text)));
drop policy if exists original_songs_delete on public.original_songs;
create policy original_songs_delete on public.original_songs for delete to authenticated using (owner = auth.uid());

-- Title and composer come from the song string; the owner can't change who made it; a deleted band makes the song private.
create or replace function public.original_songs_before() returns trigger
language plpgsql set search_path = '' as $$
declare f text[];
begin
  f := string_to_array(new.raw, '=');
  new.title := left(coalesce(f[1], ''), 200);
  new.composer := left(coalesce(f[2], ''), 200);
  if tg_op = 'UPDATE' then
    new.owner := old.owner;
    new.created_at := old.created_at;
  end if;
  if new.visibility = 'band' and new.band_id is null then new.visibility := 'private'; end if;
  return new;
end $$;
drop trigger if exists original_songs_before on public.original_songs;
create trigger original_songs_before before insert or update on public.original_songs for each row execute function public.original_songs_before();

-- At most 20 new songs or lead sheets in any 24 hours (a new row, or a changed lead sheet), so delete-and-reupload can't push
-- lots of files through. The log is only touched by the trigger; nobody can read or change it directly.
create table if not exists public.original_upload_log (
  owner uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists original_upload_log_owner_idx on public.original_upload_log (owner, at);
alter table public.original_upload_log enable row level security;
revoke all on public.original_upload_log from public, anon, authenticated;

create or replace function public.original_songs_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.lead_sheet_path is not distinct from old.lead_sheet_path then return new; end if;
  perform pg_advisory_xact_lock(hashtext('originals:' || new.owner::text));
  delete from public.original_upload_log where owner = new.owner and at < now() - interval '2 days';
  if (select count(*) from public.original_upload_log where owner = new.owner and at > now() - interval '24 hours') >= 20 then
    raise exception 'That''s 20 new songs or lead sheets today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  insert into public.original_upload_log (owner) values (new.owner);
  return new;
end $$;
revoke all on function public.original_songs_cap() from public, anon, authenticated;
drop trigger if exists original_songs_cap on public.original_songs;
create trigger original_songs_cap before insert or update on public.original_songs for each row execute function public.original_songs_cap();

-- Storage: read follows the row's rules (the lookup runs as you, so the table's policy decides); upload only to a path one of
-- your rows names, in your own folder; delete in your own folder.
drop policy if exists leadsheets_read on storage.objects;
create policy leadsheets_read on storage.objects for select to authenticated
  using (bucket_id = 'leadsheets' and exists (select 1 from public.original_songs o where o.lead_sheet_path = objects.name));
drop policy if exists leadsheets_insert on storage.objects;
create policy leadsheets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'leadsheets' and split_part(name, '/', 1) = auth.uid()::text
    and exists (select 1 from public.original_songs o where o.lead_sheet_path = objects.name and o.owner = auth.uid()));
drop policy if exists leadsheets_delete on storage.objects;
create policy leadsheets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'leadsheets' and split_part(name, '/', 1) = auth.uid()::text);
