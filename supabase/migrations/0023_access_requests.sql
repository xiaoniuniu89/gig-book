-- Closed beta: "Request access" on the sign-in page. Signed-out visitors can only call request_access();
-- Dan reads the table in the Supabase table editor.
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  instrument text,
  note text,
  created_at timestamptz not null default now()
);
do $$ begin
  alter table public.access_requests add constraint access_requests_email_key unique (email);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table public.access_requests add constraint access_requests_email_lower check (email = lower(email));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.access_requests add constraint access_requests_name_len check (char_length(name) between 1 and 80);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.access_requests add constraint access_requests_instrument_len check (char_length(instrument) <= 60);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.access_requests add constraint access_requests_note_len check (char_length(note) <= 500);
exception when duplicate_object then null; end $$;

alter table public.access_requests enable row level security;
revoke all on public.access_requests from public, anon, authenticated;

create or replace function public.request_access(p_email text, p_name text, p_instrument text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  n text := btrim(coalesce(p_name, ''));
  i text := nullif(btrim(coalesce(p_instrument, '')), '');
  t text := nullif(btrim(coalesce(p_note, '')), '');
  recent int;
begin
  if char_length(e) > 254 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode = '22023'; end if;
  if char_length(n) not between 1 and 80 then raise exception 'bad_name' using errcode = '22023'; end if;
  if char_length(i) > 60 then raise exception 'bad_instrument' using errcode = '22023'; end if;
  if char_length(t) > 500 then raise exception 'bad_note' using errcode = '22023'; end if;
  -- one request at a time across the site, so the cap can't be raced
  perform pg_advisory_xact_lock(hashtext('niu-access-request'));
  -- a repeat email looks the same as a new one (nobody learns who has asked)
  if exists (select 1 from public.access_requests where email = e) then return; end if;
  select count(*) into recent from public.access_requests where created_at > now() - interval '24 hours';
  if recent >= 50 then raise exception 'site_limit' using errcode = 'P0001'; end if;
  insert into public.access_requests (email, name, instrument, note) values (e, n, i, t) on conflict (email) do nothing;
end;
$$;

revoke all on function public.request_access(text, text, text, text) from public;
grant execute on function public.request_access(text, text, text, text) to anon, authenticated;
