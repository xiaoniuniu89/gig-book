-- Closed beta: nothing is readable without signing in, and sharing by visibility is switched off.
-- Safe to run more than once.

revoke select on public.setlists, public.setlist_items from anon;

drop policy if exists setlists_select on public.setlists;
create policy setlists_select on public.setlists for select to authenticated
  using (owner = auth.uid() or public.setlist_role(id) is not null);

drop policy if exists setlist_items_select on public.setlist_items;
create policy setlist_items_select on public.setlist_items for select to authenticated
  using (public.setlist_readable(setlist_id));

-- Readable only by the owner and members; visibility is ignored.
create or replace function public.setlist_readable(p_setlist uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.setlist_role(p_setlist) is not null;
$$;

-- The column stays for now (sharing will come back), but everything is private.
alter table public.setlists alter column visibility set default 'private';
update public.setlists set visibility = 'private' where visibility <> 'private';
