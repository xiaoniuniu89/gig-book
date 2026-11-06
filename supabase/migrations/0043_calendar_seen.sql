-- Calendar feed (R17): remember when Google, Apple or another calendar app last fetched your feed, so Account >
-- Connections can say "Connected" instead of always offering Add. Written only by the .ics route (service role).
-- Resetting the link clears them. Safe to run more than once.

alter table public.calendar_feeds add column if not exists google_seen_at timestamptz;
alter table public.calendar_feeds add column if not exists apple_seen_at timestamptz;
alter table public.calendar_feeds add column if not exists other_seen_at timestamptz;

create or replace function public.calendar_feed_token(p_reset boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t text;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if not p_reset then
    select f.token into t from public.calendar_feeds f where f.owner = me;
    if t is not null then return t; end if;
  end if;
  t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.calendar_feeds (owner, token) values (me, t)
  on conflict (owner) do update set token = excluded.token, created_at = now(),
    google_seen_at = null, apple_seen_at = null, other_seen_at = null;
  return t;
end;
$$;
revoke all on function public.calendar_feed_token(boolean) from public, anon;
grant execute on function public.calendar_feed_token(boolean) to authenticated;
