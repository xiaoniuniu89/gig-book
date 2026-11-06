-- Calendar feed (R17). Safe to run more than once.
--
-- Each account has at most one private feed token. The .ics route (service role, server side) looks a token up and
-- answers only for its owner. Tokens are random and long; resetting makes a new one so the old link stops working.

create table if not exists public.calendar_feeds (
  owner uuid primary key references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;

drop policy if exists calendar_feeds_select on public.calendar_feeds;
create policy calendar_feeds_select on public.calendar_feeds for select to authenticated using (owner = auth.uid());

-- No direct writes: the function below is the only way to make or change a token.
revoke all on public.calendar_feeds from anon, authenticated, public;
grant select on public.calendar_feeds to authenticated;

-- Makes your token, or (p_reset) replaces it. Returns the token.
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
  on conflict (owner) do update set token = excluded.token, created_at = now();
  return t;
end;
$$;
revoke all on function public.calendar_feed_token(boolean) from public, anon;
grant execute on function public.calendar_feed_token(boolean) to authenticated;

-- The gigs a token's owner can read, from today minus 30 days on. Server only (service role): it takes the token, not
-- auth.uid(). No contact details are ever selected. Returns nothing for an unknown token.
create or replace function public.calendar_feed_gigs(p_token text)
returns table (id uuid, title text, gig_date date, start_time text, venue text, address text,
               updated_at timestamptz, setlists text[], lineup text[])
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.title, g.gig_date, g.start_time, g.venue, g.address, g.updated_at,
    coalesce((select array_agg(s.name order by gs.position) from public.gig_setlists gs
              join public.setlists s on s.id = gs.setlist_id where gs.gig_id = g.id), '{}'),
    coalesce((select array_agg(coalesce(p.display_name, l.guest_name, 'Guest') || case when l.plays <> '' then ' (' || l.plays || ')' else '' end
                               order by l.created_at, l.id)
              from public.gig_lineup l left join public.profiles p on p.id = l.user_id where l.gig_id = g.id), '{}')
  from public.calendar_feeds f
  join public.gigs g on g.gig_date >= current_date - 30
  where f.token = p_token
    and (g.created_by = f.owner
         or exists (select 1 from public.gig_lineup l where l.gig_id = g.id and l.user_id = f.owner)
         or (g.band_id is not null and exists (select 1 from public.band_members m where m.band_id = g.band_id and m.user_id = f.owner)))
  order by g.gig_date, g.id;
$$;
revoke all on function public.calendar_feed_gigs(text) from public, anon, authenticated;
grant execute on function public.calendar_feed_gigs(text) to service_role;
