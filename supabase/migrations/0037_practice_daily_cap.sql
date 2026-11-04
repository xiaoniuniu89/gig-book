-- Transcribe uploads (0036): besides keeping 3 at a time, at most 10 uploads in any 24 hours, so delete-and-reupload
-- can't be used to push lots of files through. Safe to run more than once.
-- The log is only touched by the trigger below (security definer); nobody can read or change it directly.

create table if not exists public.practice_upload_log (
  owner uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists practice_upload_log_owner_idx on public.practice_upload_log (owner, at);
alter table public.practice_upload_log enable row level security;
revoke all on public.practice_upload_log from public, anon, authenticated;

create or replace function public.practice_tracks_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('practice_tracks:' || new.owner::text));
  if (select count(*) from public.practice_tracks where owner = new.owner) >= 3 then
    raise exception 'You can keep 3 recordings. Delete one first.' using errcode = 'P0001';
  end if;
  delete from public.practice_upload_log where owner = new.owner and at < now() - interval '2 days';
  if (select count(*) from public.practice_upload_log where owner = new.owner and at > now() - interval '24 hours') >= 10 then
    raise exception 'That''s 10 uploads today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  insert into public.practice_upload_log (owner) values (new.owner);
  return new;
end $$;
revoke all on function public.practice_tracks_cap() from public, anon, authenticated;
