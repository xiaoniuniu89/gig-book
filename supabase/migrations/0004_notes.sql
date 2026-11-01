-- Notes and replies (R5), and stable setlist item ids (notes point at items). Safe to run more than once.
--
-- A note has exactly one home:
--   * a tune in a setlist:  setlist_item_id set, and setlist_id = that item's setlist
--   * a setlist (general):  setlist_id only
--   * personal, per song:   song_key only (visible to the author alone, on every setlist and library chart with that song)
-- Replies (one level) copy their parent's home and have no tag.
--
-- song_key = norm(title) || '|' || norm(composer), computed in the app (lib/songs.ts, songKey()):
--   title/composer come from the iReal string (title = first field minus a trailing number; composer = second
--   field with its words reversed), and norm(s) = lowercase; drop (...) and [...]; drop " - ..." suffixes;
--   drop a leading "the " or trailing ", the"; every run of non a-z0-9 becomes one space; trim.
-- The database never recomputes it; it only stores it.

-- ---------------------------------------------------------------- stable item ids
-- Upsert by id instead of delete-and-reinsert, so setlist_items.id survives saves, reorders and key changes.
-- Items without an id get a new one; rows missing from p_items are deleted. One transaction; same role check.
-- The setlist_items.note column is no longer written (notes replace it); it stays until a later cleanup.
create or replace function public.replace_setlist_items(p_setlist_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(public.setlist_role(p_setlist_id), '') not in ('owner', 'editor') then
    raise exception 'You can''t edit this setlist.' using errcode = '42501';
  end if;
  delete from public.setlist_items i
  where i.setlist_id = p_setlist_id
    and i.id not in (
      select x.id from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(id uuid) where x.id is not null
    );
  insert into public.setlist_items (id, setlist_id, position, set_no, song, shift, versions)
  select coalesce(x.id, gen_random_uuid()), p_setlist_id, x.position, coalesce(x.set_no, 1), x.song, x.shift,
         coalesce(x.versions, '[]'::jsonb)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as x(id uuid, position integer, set_no smallint, song text, shift smallint, versions jsonb)
  on conflict (id) do update
    set position = excluded.position, set_no = excluded.set_no, song = excluded.song,
        shift = excluded.shift, versions = excluded.versions
    where public.setlist_items.setlist_id = excluded.setlist_id;
  update public.setlists set updated_at = now() where id = p_setlist_id;
end;
$$;

-- ---------------------------------------------------------------- notes
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  setlist_id uuid references public.setlists (id) on delete cascade,
  setlist_item_id uuid references public.setlist_items (id) on delete cascade,
  song_key text,
  parent_id uuid references public.notes (id) on delete cascade,
  tag text check (tag is null or tag in ('intro', 'ending', 'arrangement', 'solo', 'form', 'practice', 'general')),
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_one_home check (
    (setlist_id is not null and song_key is null)   -- setlist_item_id may be set or null
    or (setlist_id is null and setlist_item_id is null and song_key is not null)
  )
);
create index if not exists notes_setlist_idx on public.notes (setlist_id, setlist_item_id);
create index if not exists notes_personal_idx on public.notes (author, song_key) where song_key is not null;
create index if not exists notes_parent_idx on public.notes (parent_id);

-- Before insert: replies take their parent's home (and have no tag); the item must belong to the setlist.
create or replace function public.notes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.notes;
begin
  if new.parent_id is not null then
    select * into p from public.notes where id = new.parent_id;
    if not found then
      raise exception 'That note doesn''t exist.' using errcode = 'P0002';
    end if;
    if p.parent_id is not null then
      raise exception 'Replies can''t be nested.' using errcode = '22023';
    end if;
    -- a personal note can only be replied to by its author (nobody else can see it)
    if p.setlist_id is null and p.author is distinct from new.author then
      raise exception 'You can''t see that note.' using errcode = '42501';
    end if;
    new.setlist_id := p.setlist_id;
    new.setlist_item_id := p.setlist_item_id;
    new.song_key := p.song_key;
    new.tag := null;
  end if;
  if new.setlist_item_id is not null and not exists (
    select 1 from public.setlist_items i where i.id = new.setlist_item_id and i.setlist_id = new.setlist_id
  ) then
    raise exception 'That tune isn''t in that setlist.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists notes_insert_guard on public.notes;
create trigger notes_insert_guard before insert on public.notes
  for each row execute function public.notes_before_insert();

-- Before update: only the text and tag can change; replies stay untagged.
create or replace function public.notes_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.author is distinct from old.author or new.setlist_id is distinct from old.setlist_id
     or new.setlist_item_id is distinct from old.setlist_item_id or new.song_key is distinct from old.song_key
     or new.parent_id is distinct from old.parent_id then
    raise exception 'A note can''t be moved.' using errcode = '22023';
  end if;
  if new.parent_id is not null then new.tag := null; end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_update_guard on public.notes;
create trigger notes_update_guard before update on public.notes
  for each row execute function public.notes_before_update();

-- ---------------------------------------------------------------- row-level security
alter table public.notes enable row level security;

drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes for select to authenticated
  using (case when setlist_id is not null then public.setlist_readable(setlist_id) else author = auth.uid() end);

drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes for insert to authenticated
  with check (
    author = auth.uid()
    and (setlist_id is null or public.setlist_role(setlist_id) is not null)  -- any member, viewers included
  );

drop policy if exists notes_update on public.notes;
create policy notes_update on public.notes for update to authenticated
  using (author = auth.uid() and (setlist_id is null or public.setlist_role(setlist_id) is not null))
  with check (author = auth.uid());

drop policy if exists notes_delete on public.notes;
create policy notes_delete on public.notes for delete to authenticated
  using (author = auth.uid() or (setlist_id is not null and public.setlist_role(setlist_id) = 'owner'));

revoke all on public.notes from anon, public;
grant select, insert, update, delete on public.notes to authenticated;

-- ---------------------------------------------------------------- migrate the old per-tune text notes (R5.7)
-- Author = the setlist owner, tag 'general'. Skips notes that were already migrated.
insert into public.notes (author, setlist_id, setlist_item_id, tag, body, created_at)
select s.owner, i.setlist_id, i.id, 'general', left(trim(i.note), 10000), i.created_at
from public.setlist_items i
join public.setlists s on s.id = i.setlist_id
where i.note is not null and trim(i.note) <> ''
  and not exists (
    select 1 from public.notes n
    where n.setlist_item_id = i.id and n.parent_id is null and n.tag = 'general' and n.author = s.owner
      and n.body = left(trim(i.note), 10000)
  );
