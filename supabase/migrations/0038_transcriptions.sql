-- Transcriptions (R14): written-out solos and parts (PDF, photo or MusicXML) that players upload and share.
-- Private (owner + people they share it with) or public (anyone signed in). Safe to run more than once.
--
-- Files live in their own private bucket `transcriptions`, at <owner>/<id>/<uuid>-<safe-filename>, so no shared
-- `attachments` or `charts` rule changes. The row is made first and the upload must match a row of yours, so the
-- daily cap holds for files too.

insert into storage.buckets (id, name, public, file_size_limit) values ('transcriptions', 'transcriptions', false, 20 * 1024 * 1024)
on conflict (id) do update set public = false, file_size_limit = 20 * 1024 * 1024;

create table if not exists public.transcriptions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  song_key text check (song_key is null or char_length(song_key) between 1 and 300),
  tune_title text not null default '' check (char_length(tune_title) <= 200),
  tune_composer text not null default '' check (char_length(tune_composer) <= 200),
  instrument text not null default '' check (char_length(instrument) <= 60),
  player text not null default '' check (char_length(player) <= 120),
  recording text not null default '' check (char_length(recording) <= 200),
  youtube text check (youtube is null or youtube ~ '^[A-Za-z0-9_-]{11}$'),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  file_path text not null unique check (char_length(file_path) between 1 and 600),
  file_kind text not null check (file_kind in ('pdf', 'image', 'musicxml')),
  file_name text not null check (char_length(file_name) between 1 and 300),
  file_mime text not null check (char_length(file_mime) between 1 and 200),
  file_size bigint not null check (file_size between 0 and 20 * 1024 * 1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transcriptions_owner_idx on public.transcriptions (owner, created_at);
create index if not exists transcriptions_song_idx on public.transcriptions (song_key) where song_key is not null;
create index if not exists transcriptions_public_idx on public.transcriptions (title) where visibility = 'public';

create table if not exists public.transcription_shares (
  transcription_id uuid not null references public.transcriptions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (transcription_id, user_id)
);
create index if not exists transcription_shares_user_idx on public.transcription_shares (user_id);

-- The two tables' rules look at each other, so each check goes through a security-definer helper (no policy loop).
create or replace function public.transcription_owned(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.transcriptions t where t.id = p_id and t.owner = auth.uid());
$$;
create or replace function public.transcription_shared_with_me(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.transcription_shares s where s.transcription_id = p_id and s.user_id = auth.uid());
$$;
revoke all on function public.transcription_owned(uuid), public.transcription_shared_with_me(uuid) from public, anon;
grant execute on function public.transcription_owned(uuid), public.transcription_shared_with_me(uuid) to authenticated;

alter table public.transcriptions enable row level security;
alter table public.transcription_shares enable row level security;
revoke all on public.transcriptions, public.transcription_shares from public, anon;
grant select, insert, update, delete on public.transcriptions to authenticated;
grant select, delete on public.transcription_shares to authenticated; -- adding goes through add_transcription_share()

drop policy if exists transcriptions_select on public.transcriptions;
create policy transcriptions_select on public.transcriptions for select to authenticated
  using (owner = auth.uid() or visibility = 'public' or public.transcription_shared_with_me(id));
drop policy if exists transcriptions_insert on public.transcriptions;
create policy transcriptions_insert on public.transcriptions for insert to authenticated
  with check (owner = auth.uid() and split_part(file_path, '/', 1) = auth.uid()::text and split_part(file_path, '/', 2) = id::text);
drop policy if exists transcriptions_update on public.transcriptions;
create policy transcriptions_update on public.transcriptions for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and split_part(file_path, '/', 1) = auth.uid()::text and split_part(file_path, '/', 2) = id::text);
drop policy if exists transcriptions_delete on public.transcriptions;
create policy transcriptions_delete on public.transcriptions for delete to authenticated using (owner = auth.uid());

-- shares: the owner sees and removes them; a shared person sees and removes their own row
drop policy if exists transcription_shares_select on public.transcription_shares;
create policy transcription_shares_select on public.transcription_shares for select to authenticated
  using (user_id = auth.uid() or public.transcription_owned(transcription_id));
drop policy if exists transcription_shares_delete on public.transcription_shares;
create policy transcription_shares_delete on public.transcription_shares for delete to authenticated
  using (user_id = auth.uid() or public.transcription_owned(transcription_id));

-- Owner adds someone by email. Same errors as add_setlist_member (P0002 = no account for that email).
create or replace function public.add_transcription_share(p_id uuid, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if auth.uid() is null or not public.transcription_owned(p_id) then
    raise exception 'Only the owner can share this.' using errcode = '42501';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    raise exception 'No Niu Real Book account for that email' using errcode = 'P0002';
  end if;
  if v_user = auth.uid() then
    raise exception 'You already own this.' using errcode = '22023';
  end if;
  insert into public.transcription_shares (transcription_id, user_id) values (p_id, v_user) on conflict do nothing;
  return v_user;
end $$;

-- Who it's shared with. Owner only (they see emails).
create or replace function public.transcription_share_list(p_id uuid)
returns table (user_id uuid, display_name text, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.transcription_owned(p_id) then
    raise exception 'Only the owner can see who it is shared with.' using errcode = '42501';
  end if;
  return query
    select s.user_id, p.display_name, u.email::text
    from public.transcription_shares s
    join auth.users u on u.id = s.user_id
    left join public.profiles p on p.id = s.user_id
    where s.transcription_id = p_id
    order by s.created_at;
end $$;
revoke all on function public.add_transcription_share(uuid, text), public.transcription_share_list(uuid) from public, anon;
grant execute on function public.add_transcription_share(uuid, text), public.transcription_share_list(uuid) to authenticated;

-- At most 20 uploads in any 24 hours, so delete-and-reupload can't push lots of files through. The log is only touched by
-- the trigger (security definer); nobody can read or change it directly. Locked per owner so two uploads at once can't both slip in.
create table if not exists public.transcription_upload_log (
  owner uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists transcription_upload_log_owner_idx on public.transcription_upload_log (owner, at);
alter table public.transcription_upload_log enable row level security;
revoke all on public.transcription_upload_log from public, anon, authenticated;

create or replace function public.transcriptions_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('transcriptions:' || new.owner::text));
  delete from public.transcription_upload_log where owner = new.owner and at < now() - interval '2 days';
  if (select count(*) from public.transcription_upload_log where owner = new.owner and at > now() - interval '24 hours') >= 20 then
    raise exception 'That''s 20 transcriptions today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  insert into public.transcription_upload_log (owner) values (new.owner);
  return new;
end $$;
revoke all on function public.transcriptions_cap() from public, anon, authenticated;
drop trigger if exists transcriptions_cap on public.transcriptions;
create trigger transcriptions_cap before insert on public.transcriptions for each row execute function public.transcriptions_cap();

-- Storage: read follows the row's rules (the lookup runs as you, so the table's policy decides); upload only to a path one
-- of your rows names, in your own folder; delete in your own folder.
drop policy if exists transcriptions_read on storage.objects;
create policy transcriptions_read on storage.objects for select to authenticated
  using (bucket_id = 'transcriptions' and exists (select 1 from public.transcriptions t where t.file_path = objects.name));
drop policy if exists transcriptions_insert on storage.objects;
create policy transcriptions_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'transcriptions' and split_part(name, '/', 1) = auth.uid()::text
    and exists (select 1 from public.transcriptions t where t.file_path = objects.name and t.owner = auth.uid()));
drop policy if exists transcriptions_delete on storage.objects;
create policy transcriptions_delete on storage.objects for delete to authenticated
  using (bucket_id = 'transcriptions' and split_part(name, '/', 1) = auth.uid()::text);
