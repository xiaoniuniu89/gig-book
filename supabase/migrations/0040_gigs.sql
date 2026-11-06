-- Gigs (R15). Safe to run more than once.
--
-- A gig has a creator and, optionally, a band. The creator and that band's admins edit it; people on its lineup and
-- the band's members read it. Setlists are *linked* to gigs (gig_setlists), never copied; reading a gig lets you read
-- its setlists as a viewer (setlist_role below). Lineup contacts come only from gig_lineup_list(), which shows them to
-- people on the gig and honours each person's My bands / Public share settings (R11.4). Guest phone and email are not
-- readable through the table at all.
--
-- setlist_role: latest definition was 0013 (owner > direct member > band member). This adds one last case: a setlist on
-- a gig you can read is a 'viewer'. attachment read rule: latest was 0013; this keeps every case and adds one for
-- press photos on a gig you can read.

-- ---------------------------------------------------------------- tables
create table if not exists public.gigs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  band_id uuid references public.bands (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  gig_date date not null,
  start_time text check (start_time is null or char_length(start_time) <= 30),
  venue text not null default '' check (char_length(venue) <= 200),
  address text not null default '' check (char_length(address) <= 400),
  schedule text not null default '' check (char_length(schedule) <= 5000),
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gigs_band_idx on public.gigs (band_id) where band_id is not null;
create index if not exists gigs_creator_idx on public.gigs (created_by);
create index if not exists gigs_date_idx on public.gigs (gig_date);

create table if not exists public.gig_setlists (
  gig_id uuid not null references public.gigs (id) on delete cascade,
  setlist_id uuid not null references public.setlists (id) on delete cascade,
  position int not null default 0,
  primary key (gig_id, setlist_id)
);
create index if not exists gig_setlists_setlist_idx on public.gig_setlists (setlist_id);

create table if not exists public.gig_lineup (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  guest_name text check (guest_name is null or char_length(guest_name) between 1 and 100),
  guest_phone text not null default '' check (char_length(guest_phone) <= 60),
  guest_email text not null default '' check (char_length(guest_email) <= 200),
  plays text not null default '' check (char_length(plays) <= 100),
  created_at timestamptz not null default now(),
  check ((user_id is not null and guest_name is null) or (user_id is null and guest_name is not null))
);
create unique index if not exists gig_lineup_user_key on public.gig_lineup (gig_id, user_id) where user_id is not null;
create index if not exists gig_lineup_user_idx on public.gig_lineup (user_id) where user_id is not null;

-- ---------------------------------------------------------------- who is on a gig
-- Creator, someone on the lineup, or a member of the gig's band.
create or replace function public.gig_can_read(p_gig uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.gigs g
    where g.id = p_gig
      and (g.created_by = auth.uid()
           or exists (select 1 from public.gig_lineup l where l.gig_id = g.id and l.user_id = auth.uid())
           or (g.band_id is not null and exists (select 1 from public.band_members m where m.band_id = g.band_id and m.user_id = auth.uid())))
  );
$$;

-- The creator, or an admin of the gig's band.
create or replace function public.gig_can_edit(p_gig uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.gigs g
    where g.id = p_gig
      and (g.created_by = auth.uid()
           or (g.band_id is not null and exists (
                select 1 from public.band_members m where m.band_id = g.band_id and m.user_id = auth.uid() and m.role = 'admin')))
  );
$$;

-- "On the gig": creator, lineup or editor. Only these see contacts (band members who aren't playing don't).
create or replace function public.gig_on(p_gig uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.gig_can_edit(p_gig)
    or exists (select 1 from public.gig_lineup l where l.gig_id = p_gig and l.user_id = auth.uid())
  );
$$;

revoke all on function public.gig_can_read(uuid), public.gig_can_edit(uuid), public.gig_on(uuid) from public, anon;
grant execute on function public.gig_can_read(uuid), public.gig_can_edit(uuid), public.gig_on(uuid) to authenticated;

-- ---------------------------------------------------------------- setlist_role knows about gigs
-- owner > direct setlist_members row > band member ('editor' with edit_setlists, else 'viewer') > on a gig you can read ('viewer').
create or replace function public.setlist_role(p_setlist uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.owner = auth.uid() then 'owner'
    else coalesce(
      (select m.role from public.setlist_members m where m.setlist_id = s.id and m.user_id = auth.uid()),
      (select case when public.band_perm(s.band_id, 'edit_setlists') then 'editor' else 'viewer' end
       from public.band_members bm where bm.band_id = s.band_id and bm.user_id = auth.uid()),
      (select 'viewer' from public.gig_setlists gs where gs.setlist_id = s.id and public.gig_can_read(gs.gig_id) limit 1)
    )
  end
  from public.setlists s
  where s.id = p_setlist;
$$;

-- ---------------------------------------------------------------- row level security
alter table public.gigs enable row level security;
alter table public.gig_setlists enable row level security;
alter table public.gig_lineup enable row level security;

drop policy if exists gigs_select on public.gigs;
create policy gigs_select on public.gigs for select to authenticated using (public.gig_can_read(id));
drop policy if exists gigs_insert on public.gigs;
create policy gigs_insert on public.gigs for insert to authenticated
  with check (created_by = auth.uid() and (band_id is null or public.band_role(band_id) is not null));
drop policy if exists gigs_update on public.gigs;
create policy gigs_update on public.gigs for update to authenticated
  using (public.gig_can_edit(id))
  with check (band_id is null or public.band_role(band_id) is not null);
drop policy if exists gigs_delete on public.gigs;
create policy gigs_delete on public.gigs for delete to authenticated using (public.gig_can_edit(id));

-- Only setlists you own or can edit may be put on a gig: a gig never widens who reads a setlist you only view.
drop policy if exists gig_setlists_select on public.gig_setlists;
create policy gig_setlists_select on public.gig_setlists for select to authenticated using (public.gig_can_read(gig_id));
drop policy if exists gig_setlists_insert on public.gig_setlists;
create policy gig_setlists_insert on public.gig_setlists for insert to authenticated
  with check (public.gig_can_edit(gig_id) and public.setlist_role(setlist_id) in ('owner', 'editor'));
drop policy if exists gig_setlists_update on public.gig_setlists;
create policy gig_setlists_update on public.gig_setlists for update to authenticated
  using (public.gig_can_edit(gig_id))
  with check (public.gig_can_edit(gig_id) and public.setlist_role(setlist_id) in ('owner', 'editor'));
drop policy if exists gig_setlists_delete on public.gig_setlists;
create policy gig_setlists_delete on public.gig_setlists for delete to authenticated using (public.gig_can_edit(gig_id));

drop policy if exists gig_lineup_select on public.gig_lineup;
create policy gig_lineup_select on public.gig_lineup for select to authenticated using (public.gig_can_read(gig_id));
drop policy if exists gig_lineup_insert on public.gig_lineup;
create policy gig_lineup_insert on public.gig_lineup for insert to authenticated with check (public.gig_can_edit(gig_id));
drop policy if exists gig_lineup_update on public.gig_lineup;
create policy gig_lineup_update on public.gig_lineup for update to authenticated
  using (public.gig_can_edit(gig_id)) with check (public.gig_can_edit(gig_id));
drop policy if exists gig_lineup_delete on public.gig_lineup;
create policy gig_lineup_delete on public.gig_lineup for delete to authenticated
  using (public.gig_can_edit(gig_id) or user_id = auth.uid());

revoke all on public.gigs, public.gig_setlists, public.gig_lineup from anon, public;
-- Creator and gig_id are fixed once made. Guest phone and email are never selectable here: use gig_lineup_list().
revoke all on public.gigs, public.gig_setlists, public.gig_lineup from authenticated;
grant select, insert, delete on public.gigs to authenticated;
grant update (band_id, title, gig_date, start_time, venue, address, schedule, notes, updated_at) on public.gigs to authenticated;
grant select, insert, update, delete on public.gig_setlists to authenticated;
grant select (id, gig_id, user_id, guest_name, plays, created_at) on public.gig_lineup to authenticated;
grant insert, delete on public.gig_lineup to authenticated;
grant update (guest_name, guest_phone, guest_email, plays) on public.gig_lineup to authenticated;

create or replace function public.gigs_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists gigs_touch on public.gigs;
create trigger gigs_touch before update on public.gigs for each row execute function public.gigs_touch();

-- ---------------------------------------------------------------- the lineup with contacts
-- Everyone who can read the gig sees names and what they play. Contacts only if you're on the gig (creator, lineup,
-- band admin): a person's own fields follow their My bands / Public share settings; a guest's phone and email are
-- shown to the lineup only.
create or replace function public.gig_lineup_list(p_gig uuid)
returns table (id uuid, user_id uuid, name text, plays text, contact jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.user_id, coalesce(p.display_name, l.guest_name, 'Guest'), l.plays,
    case
      when not public.gig_on(p_gig) then '{}'::jsonb
      when l.user_id is null then jsonb_strip_nulls(jsonb_build_object('phone', nullif(l.guest_phone, ''), 'email', nullif(l.guest_email, '')))
      else coalesce((
        select jsonb_object_agg(c.key, c.value)
        from jsonb_each_text(p.contact) c
        where c.value <> '' and coalesce(p.share ->> c.key, 'private') in ('bands', 'public')
      ), '{}'::jsonb)
    end
  from public.gig_lineup l
  left join public.profiles p on p.id = l.user_id
  where l.gig_id = p_gig and public.gig_can_read(p_gig)
  order by l.created_at, l.id;
$$;

-- A guest's own details, for whoever edits the gig (to fill the edit form).
create or replace function public.gig_guest_details(p_gig uuid)
returns table (id uuid, phone text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.guest_phone, l.guest_email
  from public.gig_lineup l
  where l.gig_id = p_gig and l.user_id is null and public.gig_can_edit(p_gig);
$$;

-- ---------------------------------------------------------------- photos for the poster
-- The band's press kit images and the images lineup members share with My bands or Public (R10.8, R11.3, R11.4).
create or replace function public.gig_photos(p_gig uuid)
returns table (id uuid, source text, owner_name text, storage_path text, name text, mime text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, 'band', b.name, a.storage_path, a.name, a.mime
  from public.gigs g
  join public.bands b on b.id = g.band_id
  join public.attachments a on a.band_id = g.band_id and a.kind = 'image'
  where g.id = p_gig and public.gig_can_read(p_gig)
  union all
  select a.id, 'member', coalesce(p.display_name, 'Member'), a.storage_path, a.name, a.mime
  from public.gig_lineup l
  join public.profiles p on p.id = l.user_id
  join public.attachments a on a.profile_id = p.id and a.kind = 'image'
  where l.gig_id = p_gig and public.gig_can_read(p_gig)
    and coalesce(p.share ->> ('file:' || a.id::text), 'private') in ('bands', 'public');
$$;

-- Can the caller read this press-kit or profile file because of a gig? (storage read rule below)
create or replace function public.gig_file_readable(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.attachments a
      join public.gigs g on g.band_id = a.band_id
      where a.storage_path = p_path and a.kind = 'image' and public.gig_can_read(g.id)
    )
    or exists (
      select 1 from public.attachments a
      join public.profiles p on p.id = a.profile_id
      join public.gig_lineup l on l.user_id = p.id
      where a.storage_path = p_path and a.kind = 'image'
        and coalesce(p.share ->> ('file:' || a.id::text), 'private') in ('bands', 'public')
        and public.gig_can_read(l.gig_id)
    )
  );
$$;

revoke all on function public.gig_lineup_list(uuid), public.gig_guest_details(uuid), public.gig_photos(uuid), public.gig_file_readable(text) from public, anon;
grant execute on function public.gig_lineup_list(uuid), public.gig_guest_details(uuid), public.gig_photos(uuid), public.gig_file_readable(text) to authenticated;

-- Same as 0013, plus: press photos on a gig you can read.
create or replace function public.can_read_attachment_path(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n public.notes := public.attachment_path_note(p_path);
  l public.licks := public.attachment_path_lick(p_path);
  r public.resources := public.attachment_path_resource(p_path);
  k uuid := public.attachment_path_band_kit(p_path);
begin
  if auth.uid() is null then return false; end if;
  if public.is_profile_path(p_path) then return true; end if;
  if k is not null then return public.band_role(k) is not null or public.gig_file_readable(p_path); end if;
  if p_path ~ '^user/[0-9a-f-]{36}/profile/[^/]+$' then return public.gig_file_readable(p_path); end if;
  if r.id is not null then return r.owner = auth.uid(); end if;
  if l.id is not null then return public.lick_visible(l.id); end if;
  if n.id is null then return false; end if;
  if n.setlist_id is not null then return public.setlist_readable(n.setlist_id); end if;
  if n.band_id is not null then return public.band_role(n.band_id) is not null; end if;
  return n.author = auth.uid();
end;
$$;

-- ---------------------------------------------------------------- notification: added to a gig lineup
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('added_to_setlist', 'note_on_setlist', 'reply_to_note', 'added_to_band', 'note_in_band', 'added_to_gig'));

create or replace function public.notify_gig_lineup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and new.user_id is distinct from auth.uid() then
    insert into public.notifications (user_id, kind, payload, actor)
    select new.user_id, 'added_to_gig', jsonb_build_object('gig_id', g.id, 'gig_title', g.title), auth.uid()
    from public.gigs g where g.id = new.gig_id;
  end if;
  return new;
end;
$$;

drop trigger if exists gig_lineup_notify on public.gig_lineup;
create trigger gig_lineup_notify after insert on public.gig_lineup
  for each row execute function public.notify_gig_lineup();
