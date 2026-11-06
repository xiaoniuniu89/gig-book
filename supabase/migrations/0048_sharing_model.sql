-- One sharing model: Private / Bands I'm in / Public for setlists and transcriptions. Safe to run more than once.
--
-- Setlists keep two settings: visibility (private | bands | public) and band_id (the one band that works on it).
-- Readers through visibility see only the setlist row and its items. Nothing else changes for them.
--
-- Who uses what (read across 0001-0047 before this was written; none of these is changed here):
--   setlist_role()  (0040: owner > setlist_members > band member > gig lineup) is used by the update/delete/insert rules of
--     setlists (0001), setlist_items (0001), setlist_members (0001), replace_setlist_items (0001), add/remove member (0003,
--     0018, 0039), notes (0004), attachments (0005, 0007, 0011, 0012, 0013), licks (0007), charts (0022), hits (0029) and
--     gig_setlists (0040).
--   setlist_readable() (0002: setlist_role is not null) is used by the SELECT rules of notes (0004, 0013), attachments
--     (0005, 0007, 0011, 0012, 0013, 0040), licks (0007) and charts (0022), plus setlist_items_select.
-- The issue asked to widen setlist_readable(), but that would show a bands/public reader every note, file, lick and
-- chart. So setlist_readable() stays exactly as in 0002, and a new setlist_visible() (readable + visibility) is used only
-- by setlists_select and setlist_items_select.

do $$ begin
  alter table public.setlists alter column visibility drop default;
  alter table public.setlists alter column visibility type text using visibility::text;
  alter table public.setlists alter column visibility set default 'private';
exception when others then null; end $$;

update public.setlists set visibility = 'private' where visibility not in ('private', 'bands', 'public');

do $$ begin
  alter table public.setlists drop constraint if exists setlists_visibility_check;
  alter table public.setlists add constraint setlists_visibility_check check (visibility in ('private', 'bands', 'public'));
exception when duplicate_object then null; end $$;

-- you and p_user share a band (0047 defines it; repeated so this file stands alone)
create or replace function public.shares_band(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.band_members a join public.band_members b on b.band_id = a.band_id
    where a.user_id = p_user and b.user_id = auth.uid()
  );
$$;
revoke all on function public.shares_band(uuid) from public, anon;
grant execute on function public.shares_band(uuid) to authenticated;

-- may you see the setlist and its tunes (and nothing else)
create or replace function public.setlist_visible(p_setlist uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.setlist_role(p_setlist) is not null
    or exists (
      select 1 from public.setlists s
      where s.id = p_setlist
        and (s.visibility = 'public' or (s.visibility = 'bands' and public.shares_band(s.owner)))
    )
  );
$$;
revoke all on function public.setlist_visible(uuid) from public, anon;
grant execute on function public.setlist_visible(uuid) to authenticated;

drop policy if exists setlists_select on public.setlists;
create policy setlists_select on public.setlists for select to authenticated
  using (owner = auth.uid() or public.setlist_visible(id));

drop policy if exists setlist_items_select on public.setlist_items;
create policy setlist_items_select on public.setlist_items for select to authenticated
  using (public.setlist_visible(setlist_id));

-- ---------------------------------------------------------------- transcriptions
do $$ begin
  alter table public.transcriptions drop constraint if exists transcriptions_visibility_check;
  alter table public.transcriptions add constraint transcriptions_visibility_check check (visibility in ('private', 'bands', 'public'));
exception when duplicate_object then null; end $$;

-- The storage read rule (0038) looks the row up as you, so it follows this rule too.
drop policy if exists transcriptions_select on public.transcriptions;
create policy transcriptions_select on public.transcriptions for select to authenticated
  using (owner = auth.uid() or visibility = 'public'
    or (visibility = 'bands' and public.shares_band(owner))
    or public.transcription_shared_with_me(id));
