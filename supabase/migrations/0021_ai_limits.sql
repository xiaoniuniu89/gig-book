-- Niu AI limits (R9.2). Safe to run more than once.
--
-- Before: the API route counted your ai_usage rows, then inserted one. Two problems:
--   * many requests at once all counted before any of them inserted, so the daily limit could be beaten;
--   * anyone could insert ai_usage rows directly, which would fill a site-wide cap for everyone.
-- Now one security-definer function claims a draft: it checks your daily limit and the site-wide daily limit and
-- records the draft in one step, one claim at a time. Plain inserts are gone, so the only way in is a claim within limits.

drop policy if exists ai_usage_insert on public.ai_usage;
revoke insert, update, delete on public.ai_usage from authenticated, anon;

-- The limits live here, not in the request, so nobody can raise their own.
create or replace function public.ai_limits()
returns table (per_user int, site int)
language sql
immutable
set search_path = ''
as $$ select 10, 200 $$;

-- Claim one draft for the caller. Returns how many they have left today; raises 'user_limit' or 'site_limit' when full.
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

-- How many drafts the caller has left today (for the page).
create or replace function public.ai_remaining()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, (select per_user from public.ai_limits())
    - (select count(*)::int from public.ai_usage where user_id = auth.uid() and created_at > now() - interval '24 hours'));
$$;

revoke all on function public.ai_limits() from public, anon;
revoke all on function public.ai_claim() from public, anon;
revoke all on function public.ai_remaining() from public, anon;
grant execute on function public.ai_limits(), public.ai_claim(), public.ai_remaining() to authenticated;
