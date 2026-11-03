-- First-run tour (#49): remember that the person has finished or skipped it. Safe to run more than once.
-- my_profile() gains tour_seen (the return type changes, so it is dropped and recreated; every other column is kept).

alter table public.profiles add column if not exists tour_seen boolean not null default false;

-- 0012 granted update on (display_name, bio, instruments, contact, share, epk_slug, updated_at); keep all of those.
revoke update on public.profiles from authenticated;
grant update (display_name, bio, instruments, contact, share, epk_slug, updated_at, tour_seen) on public.profiles to authenticated;

drop function if exists public.my_profile();
create function public.my_profile()
returns table (display_name text, bio text, instruments text[], contact jsonb, share jsonb, epk_slug text, tour_seen boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, p.bio, p.instruments, p.contact, p.share, p.epk_slug, p.tour_seen
  from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
