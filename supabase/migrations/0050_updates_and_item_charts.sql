-- Opt-in updates on gigs and bands (bell only, no email) and iReal charts made for a setlist's copy of a tune. Safe to run more than once.
--
-- update_subscriptions: a row with a gig is that gig; with a band is that band and its gigs; with neither is everything you're on.
-- Off by default. Direct notifications (added to something, band notes, replies) are unchanged.
-- Repeats are folded: while you have an unread update of the same kind on the same thing from the last hour, no new one is made.
-- Nothing here redefines setlist_role or the attachment rules. notify_note stays as it was; these are extra triggers.

create table if not exists public.update_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  gig_id uuid references public.gigs (id) on delete cascade,
  band_id uuid references public.bands (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (gig_id is null or band_id is null)
);
create unique index if not exists update_subs_all_uq on public.update_subscriptions (user_id) where gig_id is null and band_id is null;
create unique index if not exists update_subs_gig_uq on public.update_subscriptions (user_id, gig_id) where gig_id is not null;
create unique index if not exists update_subs_band_uq on public.update_subscriptions (user_id, band_id) where band_id is not null;

alter table public.update_subscriptions enable row level security;
drop policy if exists update_subs_select on public.update_subscriptions;
create policy update_subs_select on public.update_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists update_subs_insert on public.update_subscriptions;
create policy update_subs_insert on public.update_subscriptions for insert to authenticated
  with check (user_id = auth.uid()
    and (gig_id is null or public.gig_can_read(gig_id))
    and (band_id is null or exists (select 1 from public.band_members m where m.band_id = update_subscriptions.band_id and m.user_id = auth.uid())));
drop policy if exists update_subs_delete on public.update_subscriptions;
create policy update_subs_delete on public.update_subscriptions for delete to authenticated using (user_id = auth.uid());
revoke all on public.update_subscriptions from anon, public;
grant select, insert, delete on public.update_subscriptions to authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('added_to_setlist', 'note_on_setlist', 'reply_to_note', 'added_to_band', 'note_in_band', 'added_to_gig', 'gig_update', 'band_update'));

-- ---------------------------------------------------------------- who hears about what
create or replace function public.updates_for_gig(p_gig uuid, p_what text, p_actor uuid, p_skip uuid[] default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, payload, actor)
  select a.u, 'gig_update', jsonb_build_object('gig_id', g.id, 'gig_title', g.title, 'what', p_what), p_actor
  from public.gigs g
  cross join lateral (
    select g.created_by as u
    union select l.user_id from public.gig_lineup l where l.gig_id = g.id and l.user_id is not null
    union select m.user_id from public.band_members m where m.band_id = g.band_id
  ) a
  where g.id = p_gig and a.u is distinct from p_actor and not (a.u = any (p_skip))
    and exists (select 1 from public.update_subscriptions s where s.user_id = a.u
                and (s.gig_id = g.id or s.band_id = g.band_id or (s.gig_id is null and s.band_id is null)))
    and not exists (select 1 from public.notifications n where n.user_id = a.u and n.kind = 'gig_update' and n.read_at is null
                    and n.created_at > now() - interval '1 hour' and n.payload->>'gig_id' = g.id::text and n.payload->>'what' = p_what);
$$;

create or replace function public.updates_for_band(p_band uuid, p_what text, p_actor uuid, p_skip uuid[] default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, payload, actor)
  select m.user_id, 'band_update', jsonb_build_object('band_id', b.id, 'band_name', b.name, 'what', p_what), p_actor
  from public.bands b join public.band_members m on m.band_id = b.id
  where b.id = p_band and m.user_id is distinct from p_actor and not (m.user_id = any (p_skip))
    and exists (select 1 from public.update_subscriptions s where s.user_id = m.user_id
                and (s.band_id = b.id or (s.gig_id is null and s.band_id is null)))
    and not exists (select 1 from public.notifications n where n.user_id = m.user_id and n.kind = 'band_update' and n.read_at is null
                    and n.created_at > now() - interval '1 hour' and n.payload->>'band_id' = b.id::text and n.payload->>'what' = p_what);
$$;

-- A setlist's news goes to its gigs. Its band hears directly only if none of those gigs is the band's own, which would tell them already.
create or replace function public.updates_for_setlist(p_setlist uuid, p_what text, p_actor uuid, p_skip uuid[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare v_gig uuid; v_band uuid;
begin
  for v_gig in select gs.gig_id from public.gig_setlists gs where gs.setlist_id = p_setlist loop
    perform public.updates_for_gig(v_gig, p_what, p_actor, p_skip);
  end loop;
  select s.band_id into v_band from public.setlists s where s.id = p_setlist;
  if v_band is not null and not exists (select 1 from public.gig_setlists gs join public.gigs g on g.id = gs.gig_id
                                        where gs.setlist_id = p_setlist and g.band_id = v_band) then
    perform public.updates_for_band(v_band, p_what, p_actor, p_skip);
  end if;
end;
$$;

-- ---------------------------------------------------------------- the events
create or replace function public.gig_details_changed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.title, old.gig_date, old.start_time, old.venue, old.address, old.schedule, old.notes)
     is distinct from (new.title, new.gig_date, new.start_time, new.venue, new.address, new.schedule, new.notes) then
    perform public.updates_for_gig(new.id, 'details', auth.uid());
  end if;
  return null;
end;
$$;
drop trigger if exists gigs_updates on public.gigs;
create trigger gigs_updates after update on public.gigs for each row execute function public.gig_details_changed();

create or replace function public.gig_setlist_added() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.updates_for_gig(new.gig_id, 'setlist', auth.uid());
  return null;
end;
$$;
drop trigger if exists gig_setlists_updates on public.gig_setlists;
create trigger gig_setlists_updates after insert on public.gig_setlists for each row execute function public.gig_setlist_added();

create or replace function public.band_setlist_added() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.band_id is not null then perform public.updates_for_band(new.band_id, 'setlist', auth.uid()); end if;
  return null;
end;
$$;
drop trigger if exists setlists_band_updates on public.setlists;
create trigger setlists_band_updates after insert on public.setlists for each row execute function public.band_setlist_added();

-- A new note on a setlist. Its owner and direct members already get note_on_setlist; band notes already reach the whole band.
create or replace function public.note_updates() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_skip uuid[];
begin
  if new.setlist_id is not null and new.parent_id is null then
    select array_agg(u) into v_skip from (
      select s.owner as u from public.setlists s where s.id = new.setlist_id
      union select m.user_id from public.setlist_members m where m.setlist_id = new.setlist_id
    ) r;
    perform public.updates_for_setlist(new.setlist_id, 'note', new.author, coalesce(v_skip, '{}'));
  end if;
  return null;
end;
$$;
drop trigger if exists notes_updates on public.notes;
create trigger notes_updates after insert on public.notes for each row execute function public.note_updates();

-- A file on a note: nothing told anyone about these before.
create or replace function public.attachment_updates() returns trigger language plpgsql security definer set search_path = '' as $$
declare n public.notes;
begin
  if new.note_id is null then return null; end if;
  select * into n from public.notes where id = new.note_id;
  if n.band_id is not null then perform public.updates_for_band(n.band_id, 'file', new.created_by);
  elsif n.setlist_id is not null then perform public.updates_for_setlist(n.setlist_id, 'file', new.created_by);
  end if;
  return null;
end;
$$;
drop trigger if exists attachments_updates on public.attachments;
create trigger attachments_updates after insert on public.attachments for each row execute function public.attachment_updates();

create or replace function public.chart_updates() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.setlist_id is not null then perform public.updates_for_setlist(new.setlist_id, 'chart', new.owner); end if;
  return null;
end;
$$;
drop trigger if exists charts_updates on public.charts;
create trigger charts_updates after insert on public.charts for each row execute function public.chart_updates();

revoke all on function public.updates_for_gig(uuid, text, uuid, uuid[]), public.updates_for_band(uuid, text, uuid, uuid[]), public.updates_for_setlist(uuid, text, uuid, uuid[]),
  public.gig_details_changed(), public.gig_setlist_added(), public.band_setlist_added(), public.note_updates(), public.attachment_updates(), public.chart_updates()
  from public, anon, authenticated;

-- ---------------------------------------------------------------- iReal charts on a setlist's copy of a tune
-- Anyone who can edit the setlist, and by default anyone who can read a gig it's on. The gig's editors can turn that off.
alter table public.gigs add column if not exists lineup_can_chart boolean not null default true;
grant update (lineup_can_chart) on public.gigs to authenticated;

create or replace function public.can_chart_setlist(p_setlist uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.setlist_role(p_setlist) in ('owner', 'editor')
    or exists (select 1 from public.gig_setlists gs join public.gigs g on g.id = gs.gig_id
               where gs.setlist_id = p_setlist and g.lineup_can_chart and public.gig_can_read(g.id))
  );
$$;

-- Only the chart changes: the title and composer have to stay, so the tune keeps its notes, licks and charts.
create or replace function public.set_item_chart(p_setlist uuid, p_item uuid, p_raw text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if not public.can_chart_setlist(p_setlist) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select i.song into v_old from public.setlist_items i where i.id = p_item and i.setlist_id = p_setlist;
  if v_old is null then raise exception 'no_such_tune'; end if;
  if char_length(p_raw) > 20000 or split_part(p_raw, '=', 1) <> split_part(v_old, '=', 1) or split_part(p_raw, '=', 2) <> split_part(v_old, '=', 2) then
    raise exception 'not_the_same_tune';
  end if;
  update public.setlist_items set song = p_raw where id = p_item;
  perform public.updates_for_setlist(p_setlist, 'chart', auth.uid());
end;
$$;
revoke all on function public.can_chart_setlist(uuid), public.set_item_chart(uuid, uuid, text) from public, anon;
grant execute on function public.can_chart_setlist(uuid), public.set_item_chart(uuid, uuid, text) to authenticated;
