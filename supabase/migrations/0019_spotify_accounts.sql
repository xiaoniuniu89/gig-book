-- Spotify accounts for making playlists from a setlist (#45). Safe to run more than once.
--
-- One row per user: their Spotify refresh token, encrypted by the server (AES-GCM, key from the Spotify app secret),
-- so even the owner's browser only ever sees ciphertext, and the token is useless without the app secret anyway.
-- No plain table access at all: only the signed-in owner, through the functions below.

create table if not exists public.spotify_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null check (char_length(token) <= 4000),
  updated_at timestamptz not null default now()
);
alter table public.spotify_accounts enable row level security;
revoke all on public.spotify_accounts from public, anon, authenticated;

-- Save (or replace) your token.
create or replace function public.spotify_save(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.spotify_accounts (user_id, token) values (auth.uid(), p_token)
  on conflict (user_id) do update set token = excluded.token, updated_at = now();
$$;

-- Your token (encrypted), or null when you haven't connected Spotify.
create or replace function public.spotify_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select token from public.spotify_accounts where user_id = auth.uid();
$$;

create or replace function public.spotify_connected()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.spotify_accounts where user_id = auth.uid());
$$;

create or replace function public.spotify_disconnect()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.spotify_accounts where user_id = auth.uid();
$$;

do $$
declare f text;
begin
  foreach f in array array['spotify_save(text)', 'spotify_token()', 'spotify_connected()', 'spotify_disconnect()'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;
