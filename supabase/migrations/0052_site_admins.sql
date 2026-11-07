-- Site admins: no daily Niu AI limit, and their use doesn't count toward the site-wide one. Safe to run more than once.
-- Nobody can read or change this list through the app; add people with the service role or a migration.

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
revoke all on public.site_admins from public, anon, authenticated;

-- Dan, on live (by id so no email goes in this public repo; other projects have no such user).
insert into public.site_admins (user_id)
  select id from auth.users where id = '3eecd902-0d29-489e-a3e8-3492e8028567'
  on conflict do nothing;

-- As 0021, except a site admin gets null ("no limit") and nothing is recorded.
create or replace function public.ai_claim()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim record;
  mine int;
  site int;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if exists (select 1 from public.site_admins where user_id = auth.uid()) then return null; end if;
  select * into lim from public.ai_limits();
  -- one claim at a time across the site, so the counts can't be raced
  perform pg_advisory_xact_lock(hashtext('niu-ai-claim'));
  select count(*) into mine from public.ai_usage where user_id = auth.uid() and created_at > now() - interval '24 hours';
  if mine >= lim.per_user then raise exception 'user_limit' using errcode = 'P0001'; end if;
  select count(*) into site from public.ai_usage where created_at > now() - interval '24 hours';
  if site >= lim.site then raise exception 'site_limit' using errcode = 'P0001'; end if;
  insert into public.ai_usage (user_id) values (auth.uid());
  return lim.per_user - mine - 1;
end;
$$;

-- How many drafts the caller has left today; null means no limit, and the page then shows no count.
create or replace function public.ai_remaining()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (select 1 from public.site_admins where user_id = auth.uid()) then null else
    greatest(0, (select per_user from public.ai_limits())
      - (select count(*)::int from public.ai_usage where user_id = auth.uid() and created_at > now() - interval '24 hours')) end;
$$;

revoke all on function public.ai_claim() from public, anon;
revoke all on function public.ai_remaining() from public, anon;
grant execute on function public.ai_claim(), public.ai_remaining() to authenticated;
