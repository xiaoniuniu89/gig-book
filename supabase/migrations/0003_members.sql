-- Setlist members: add by email and list. (Role changes, removal and leaving use the table + its RLS policies.)
-- Safe to run more than once.

-- Owner adds an existing user by email (or changes their role). Never reveals anything about the user.
create or replace function public.add_setlist_member(p_setlist uuid, p_email text, p_role text default 'viewer')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if auth.uid() is null or public.setlist_role(p_setlist) is distinct from 'owner' then
    raise exception 'Only the owner can add members.' using errcode = '42501';
  end if;
  if p_role not in ('viewer', 'editor') then
    raise exception 'Role must be viewer or editor.' using errcode = '22023';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    raise exception 'No Gig Book account for that email' using errcode = 'P0002';
  end if;
  if v_user = auth.uid() then
    raise exception 'You already own this setlist.' using errcode = '22023';
  end if;
  insert into public.setlist_members (setlist_id, user_id, role)
  values (p_setlist, v_user, p_role)
  on conflict (setlist_id, user_id) do update set role = excluded.role;
  -- TODO(R4.5): create an "added to setlist" notification for v_user once notifications exist.
  return v_user;
end;
$$;

-- Members of a setlist. The owner sees emails; other members see display names only.
create or replace function public.setlist_member_list(p_setlist uuid)
returns table (user_id uuid, display_name text, email text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.setlist_role(p_setlist);
begin
  if v_role is null then
    raise exception 'You can''t see this setlist.' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.display_name,
           case when v_role = 'owner' then u.email::text end,
           m.role
    from public.setlist_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.setlist_id = p_setlist
    order by m.created_at;
end;
$$;

revoke execute on function public.add_setlist_member(uuid, text, text), public.setlist_member_list(uuid) from anon, public;
grant execute on function public.add_setlist_member(uuid, text, text), public.setlist_member_list(uuid) to authenticated;
