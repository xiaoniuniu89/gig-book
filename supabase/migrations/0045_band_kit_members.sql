-- Band press kit (R10.8): "Include the musicians". A band's PDF and public page can add a section per member, with
-- only what that member has shared as Public (bio, instruments, contact fields), so nothing reaches an agent or venue
-- that the member hasn't made public. Members with nothing public are left out. Safe to run more than once.

alter table public.bands add column if not exists kit_members boolean not null default false;
grant update (kit_members) on public.bands to authenticated;

-- One row per member with something public. Internal: callers below check who may ask.
create or replace function public.band_public_members(p_band uuid)
returns table (user_id uuid, name text, plays text[], bio text, instruments text[], contact jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select m.user_id, p.display_name, m.plays,
      case when p.share ->> 'bio' = 'public' then p.bio end as bio,
      case when p.share ->> 'instruments' = 'public' then p.instruments else '{}' end as instruments,
      coalesce((select jsonb_object_agg(c.key, c.value) from jsonb_each(p.contact) c where p.share ->> c.key = 'public'), '{}'::jsonb) as contact
    from public.band_members m join public.profiles p on p.id = m.user_id
    where m.band_id = p_band
    order by m.joined_at
  ) x
  where coalesce(x.bio, '') <> '' or cardinality(x.instruments) > 0 or x.contact <> '{}'::jsonb;
$$;
revoke all on function public.band_public_members(uuid) from public, anon, authenticated;

-- For the band's own members (the PDF a member downloads).
create or replace function public.band_kit_members(p_band uuid)
returns table (user_id uuid, name text, plays text[], bio text, instruments text[], contact jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.band_public_members(p_band) where public.band_role(p_band) is not null;
$$;
revoke all on function public.band_kit_members(uuid) from public, anon;
grant execute on function public.band_kit_members(uuid) to authenticated;

-- For the public band page: only when the page is on and the band ticked Include the musicians.
create or replace function public.public_band_members(p_slug text)
returns table (user_id uuid, name text, plays text[], bio text, instruments text[], contact jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select bm.* from public.bands b, public.band_public_members(b.id) bm
  where b.epk_slug is not null and b.epk_slug = p_slug and b.kit_members;
$$;
revoke all on function public.public_band_members(text) from public;
grant execute on function public.public_band_members(text) to anon, authenticated;
