-- Original songs: a third way to share, "bands" = everyone who is in any band with the writer (now and bands joined later).
-- Older rows shared with one band ("band" + band_id) keep working as they were.

do $$ begin
  alter table public.original_songs drop constraint if exists original_songs_visibility_check;
  alter table public.original_songs add constraint original_songs_visibility_check
    check (visibility in ('private', 'band', 'bands', 'public'));
exception when duplicate_object then null; end $$;

-- you and p_user are in at least one band together
create or replace function public.shares_band(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.band_members a join public.band_members b on b.band_id = a.band_id
    where a.user_id = p_user and b.user_id = auth.uid()
  );
$$;
revoke all on function public.shares_band(uuid) from public, anon;
grant execute on function public.shares_band(uuid) to authenticated;

drop policy if exists original_songs_select on public.original_songs;
create policy original_songs_select on public.original_songs for select to authenticated
  using (owner = auth.uid() or visibility = 'public'
    or (visibility = 'band' and public.band_role(band_id) is not null)
    or (visibility = 'bands' and public.shares_band(owner)));
