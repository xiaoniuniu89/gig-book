-- Recent collaborators (R: share with people you've worked with). No requests: the list comes from shared history.
-- band_members and setlist_members lose rows when someone leaves, so a small history table keeps who worked with whom.
-- Pairs are written by triggers (and backfilled once); nothing is ever listed from it directly: only recent_collaborators().

create table if not exists public.collaborations (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  last_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists collaborations_b_idx on public.collaborations (user_b);

alter table public.collaborations enable row level security;
-- No policies and no grants: only the security-definer functions below touch it.
revoke all on public.collaborations from anon, public, authenticated;

create or replace function public.collab_touch(p_x uuid, p_y uuid, p_at timestamptz default now())
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.collaborations (user_a, user_b, last_at)
  select least(p_x, p_y), greatest(p_x, p_y), p_at where p_x <> p_y
  on conflict (user_a, user_b) do update set last_at = greatest(public.collaborations.last_at, excluded.last_at);
$$;
revoke all on function public.collab_touch(uuid, uuid, timestamptz) from anon, public, authenticated;

create or replace function public.collab_band_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.collab_touch(new.user_id, m.user_id)
  from public.band_members m where m.band_id = new.band_id and m.user_id <> new.user_id;
  return new;
end;
$$;
drop trigger if exists band_members_collab on public.band_members;
create trigger band_members_collab after insert on public.band_members
  for each row execute function public.collab_band_member();

create or replace function public.collab_setlist_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.collab_touch(new.user_id, s.owner) from public.setlists s where s.id = new.setlist_id;
  return new;
end;
$$;
drop trigger if exists setlist_members_collab on public.setlist_members;
create trigger setlist_members_collab after insert on public.setlist_members
  for each row execute function public.collab_setlist_member();

-- Backfill from what exists today.
insert into public.collaborations (user_a, user_b, last_at)
select least(x.user_id, y.user_id), greatest(x.user_id, y.user_id), max(greatest(x.joined_at, y.joined_at))
from public.band_members x join public.band_members y on y.band_id = x.band_id and y.user_id <> x.user_id
group by 1, 2
on conflict (user_a, user_b) do update set last_at = greatest(public.collaborations.last_at, excluded.last_at);

insert into public.collaborations (user_a, user_b, last_at)
select least(m.user_id, s.owner), greatest(m.user_id, s.owner), max(m.created_at)
from public.setlist_members m join public.setlists s on s.id = m.setlist_id
where m.user_id <> s.owner
group by 1, 2
on conflict (user_a, user_b) do update set last_at = greatest(public.collaborations.last_at, excluded.last_at);

-- The caller's recent collaborators: a name and the time of the last thing you did together. Never anyone else.
create or replace function public.recent_collaborators()
returns table (user_id uuid, display_name text, last_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, coalesce(p.display_name, 'Member'), c.last_at
  from public.collaborations c
  cross join lateral (select case when c.user_a = auth.uid() then c.user_b else c.user_a end as id) o
  left join public.profiles p on p.id = o.id
  where auth.uid() in (c.user_a, c.user_b)
  order by c.last_at desc
  limit 50;
$$;
revoke all on function public.recent_collaborators() from anon, public;
grant execute on function public.recent_collaborators() to authenticated;

-- Add a recent collaborator to a setlist with one tap (same rules as add_setlist_member, but by id, and only for people in your history).
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
  if not exists (select 1 from public.recent_collaborators() c where c.user_id = p_user) then
    raise exception 'No Gig Book account for that person' using errcode = 'P0002';
  end if;
  insert into public.setlist_members (setlist_id, user_id, role)
  values (p_setlist, p_user, p_role)
  on conflict (setlist_id, user_id) do update set role = excluded.role;
end;
$$;
revoke all on function public.add_setlist_collaborator(uuid, uuid, text) from anon, public;
grant execute on function public.add_setlist_collaborator(uuid, uuid, text) to authenticated;
