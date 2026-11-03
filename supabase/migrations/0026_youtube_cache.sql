-- The automatic YouTube pick for a song, found once and shared (a search costs 100 of the day's 10,000 quota units).
-- key is norm(title)|norm(composer). Any signed-in user can read and add; nobody can change or delete (the service role can). Safe to run more than once.
create table if not exists public.youtube_cache (
  key text primary key check (char_length(key) between 1 and 300),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null default '' check (char_length(title) <= 300),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.youtube_cache enable row level security;
revoke all on public.youtube_cache from public, anon;
grant select, insert on public.youtube_cache to authenticated;

drop policy if exists youtube_cache_select on public.youtube_cache;
create policy youtube_cache_select on public.youtube_cache for select to authenticated using (true);
drop policy if exists youtube_cache_insert on public.youtube_cache;
create policy youtube_cache_insert on public.youtube_cache for insert to authenticated with check (created_by = auth.uid());
