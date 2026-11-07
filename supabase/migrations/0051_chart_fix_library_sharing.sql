-- Two things. Safe to run more than once.
-- 1. can_chart_setlist returned null (not false) for someone with no role on the setlist, and `if not null` let
--    set_item_chart through. It now always says true or false, and set_item_chart refuses anything but true.
-- 2. Library playlists can be shared, with the same Who can see it as setlists. Private stays the default. The app only
--    lists your own (listLibrary filters on owner); others open a shared one by its link and can copy it.

create or replace function public.can_chart_setlist(p_setlist uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    coalesce(public.setlist_role(p_setlist) in ('owner', 'editor'), false)
    or exists (select 1 from public.gig_setlists gs join public.gigs g on g.id = gs.gig_id
               where gs.setlist_id = p_setlist and g.lineup_can_chart and public.gig_can_read(g.id))
  );
$$;

create or replace function public.set_item_chart(p_setlist uuid, p_item uuid, p_raw text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if public.can_chart_setlist(p_setlist) is not true then raise exception 'not_allowed' using errcode = '42501'; end if;
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

alter table public.library_playlists add column if not exists visibility text not null default 'private';
do $$ begin
  alter table public.library_playlists drop constraint if exists library_playlists_visibility_check;
  alter table public.library_playlists add constraint library_playlists_visibility_check check (visibility in ('private', 'bands', 'public'));
exception when duplicate_object then null; end $$;

drop policy if exists library_select on public.library_playlists;
create policy library_select on public.library_playlists for select to authenticated
  using (owner = auth.uid() or visibility = 'public' or (visibility = 'bands' and public.shares_band(owner)));
