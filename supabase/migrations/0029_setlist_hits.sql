-- Rhythmic hits and the drummer view (R3.6): hits, stops and fermatas, and the feel per section, live on the setlist
-- item (like its key). Everyone who can read the setlist sees them; only those who can change the items edit them,
-- because replace_setlist_items already checks setlist_role (owner/editor, and band members with edit_setlists).
-- Safe to run more than once.
alter table public.setlist_items add column if not exists hits jsonb not null default '[]'::jsonb;
alter table public.setlist_items add column if not exists feels jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.setlist_items add constraint setlist_items_hits_shape check (
    jsonb_typeof(hits) = 'array' and jsonb_array_length(hits) <= 300 and pg_column_size(hits) <= 40000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.setlist_items add constraint setlist_items_feels_shape check (
    jsonb_typeof(feels) = 'object' and pg_column_size(feels) <= 2000);
exception when duplicate_object then null; end $$;

-- Same function as 0004 (role check, upsert by id, delete the rest) with the two new columns.
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
  insert into public.setlist_items (id, setlist_id, position, set_no, song, shift, versions, hits, feels)
  select coalesce(x.id, gen_random_uuid()), p_setlist_id, x.position, coalesce(x.set_no, 1), x.song, x.shift,
         coalesce(x.versions, '[]'::jsonb), coalesce(x.hits, '[]'::jsonb), coalesce(x.feels, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as x(id uuid, position integer, set_no smallint, song text, shift smallint, versions jsonb, hits jsonb, feels jsonb)
  on conflict (id) do update
    set position = excluded.position, set_no = excluded.set_no, song = excluded.song,
        shift = excluded.shift, versions = excluded.versions, hits = excluded.hits, feels = excluded.feels
    where public.setlist_items.setlist_id = excluded.setlist_id;
  update public.setlists set updated_at = now() where id = p_setlist_id;
end;
$$;

grant execute on function public.replace_setlist_items(uuid, jsonb) to authenticated;
revoke execute on function public.replace_setlist_items(uuid, jsonb) from anon, public;
