-- Pick people by name (R4.6). Search only the people you already play with, never every user.
-- The circle: bandmates, people on setlists you own or are on, and your recent collaborators (0018).
-- Safe to run more than once.

create or replace function public.people_circle()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select x.id from (
    select case when c.user_a = auth.uid() then c.user_b else c.user_a end as id
      from public.collaborations c where auth.uid() in (c.user_a, c.user_b)
    union
    select m2.user_id from public.band_members m1
      join public.band_members m2 on m2.band_id = m1.band_id where m1.user_id = auth.uid()
    union
    select s.owner from public.setlist_members m
      join public.setlists s on s.id = m.setlist_id where m.user_id = auth.uid()
    union
    select m.user_id from public.setlists s
      join public.setlist_members m on m.setlist_id = s.id where s.owner = auth.uid()
    union
    select m2.user_id from public.setlist_members m1
      join public.setlist_members m2 on m2.setlist_id = m1.setlist_id where m1.user_id = auth.uid()
  ) x
  where auth.uid() is not null and x.id <> auth.uid();
$$;
revoke all on function public.people_circle() from anon, public, authenticated;

-- Up to 10 people from the circle whose name contains q (case-insensitive). Instruments only where they share them with bands or the public.
create or replace function public.search_people(q text)
returns table (user_id uuid, display_name text, instruments text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t text := trim(coalesce(q, ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if char_length(t) < 2 then return; end if;
  return query
    select p.id, coalesce(p.display_name, 'Member'),
           case when p.share ->> 'instruments' in ('bands', 'public') then p.instruments else '{}'::text[] end
    from public.profiles p
    where p.id in (select public.people_circle())
      and p.display_name ilike '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by (lower(p.display_name) like lower(t) || '%') desc, p.display_name
    limit 10;
end;
$$;
revoke all on function public.search_people(text) from anon, public;
grant execute on function public.search_people(text) to authenticated;

-- One-tap add now accepts anyone in the circle (was: recent collaborators only). Same rules otherwise as in 0018.
create or replace function public.add_setlist_collaborator(p_setlist uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.setlist_role(p_setlist) is distinct from 'owner' then
    raise exception 'Only the owner can add members.' using errcode = '42501';
  end if;
  if p_role not in ('viewer', 'editor') then
    raise exception 'Role must be viewer or editor.' using errcode = '22023';
  end if;
  if p_user = auth.uid() then
    raise exception 'You already own this setlist.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.people_circle() c where c = p_user) then
    raise exception 'No Gig Book account for that person' using errcode = 'P0002';
  end if;
  insert into public.setlist_members (setlist_id, user_id, role)
  values (p_setlist, p_user, p_role)
  on conflict (setlist_id, user_id) do update set role = excluded.role;
end;
$$;
revoke all on function public.add_setlist_collaborator(uuid, uuid, text) from anon, public;
grant execute on function public.add_setlist_collaborator(uuid, uuid, text) to authenticated;
