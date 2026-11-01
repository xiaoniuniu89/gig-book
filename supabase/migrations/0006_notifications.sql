-- In-app notifications (R7.1, R4.5). Safe to run more than once.
--
-- Rows are created only by the triggers below (security definer); clients can read their own and mark them read.
--   added_to_setlist  payload {setlist_id, setlist_name}                         -> the new member
--   note_on_setlist   payload {setlist_id, setlist_name, item_id?, note_id}      -> owner + other members
--   reply_to_note     payload {setlist_id, setlist_name, item_id?, note_id, parent_id} -> the parent note's author
-- Never for the actor themselves, and never for personal (song) notes.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('added_to_setlist', 'note_on_setlist', 'reply_to_note')),
  payload jsonb not null default '{}'::jsonb,
  actor uuid references auth.users (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No inserts or deletes from clients; the only column a client may change is read_at.
revoke all on public.notifications from anon, public, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------- added to a setlist
create or replace function public.notify_member_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from auth.uid() then
    insert into public.notifications (user_id, kind, payload, actor)
    select new.user_id, 'added_to_setlist',
           jsonb_build_object('setlist_id', s.id, 'setlist_name', s.name), auth.uid()
    from public.setlists s where s.id = new.setlist_id;
  end if;
  return new;
end;
$$;

drop trigger if exists setlist_members_notify on public.setlist_members;
create trigger setlist_members_notify after insert on public.setlist_members
  for each row execute function public.notify_member_added();

-- ---------------------------------------------------------------- notes and replies
create or replace function public.notify_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_owner uuid;
  v_parent uuid;
  v_payload jsonb;
begin
  if new.setlist_id is null then return new; end if;  -- personal notes never notify
  select s.name, s.owner into v_name, v_owner from public.setlists s where s.id = new.setlist_id;
  if not found then return new; end if;
  v_payload := jsonb_build_object('setlist_id', new.setlist_id, 'setlist_name', v_name, 'note_id', new.id);
  if new.setlist_item_id is not null then
    v_payload := v_payload || jsonb_build_object('item_id', new.setlist_item_id);
  end if;

  if new.parent_id is null then
    insert into public.notifications (user_id, kind, payload, actor)
    select u, 'note_on_setlist', v_payload, new.author
    from (
      select v_owner as u
      union
      select m.user_id from public.setlist_members m where m.setlist_id = new.setlist_id
    ) r
    where r.u is distinct from new.author;
  else
    select n.author into v_parent from public.notes n where n.id = new.parent_id;
    -- only if the parent's author can still see the setlist
    if v_parent is not null and v_parent is distinct from new.author
       and (v_parent = v_owner or exists (
         select 1 from public.setlist_members m where m.setlist_id = new.setlist_id and m.user_id = v_parent
       )) then
      insert into public.notifications (user_id, kind, payload, actor)
      values (v_parent, 'reply_to_note', v_payload || jsonb_build_object('parent_id', new.parent_id), new.author);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notes_notify on public.notes;
create trigger notes_notify after insert on public.notes
  for each row execute function public.notify_note();
