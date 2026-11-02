-- Feedback from testers. Safe to run more than once.
--
-- Every message is kept here (so nothing is lost if GitHub or the AI is down) and counts toward a daily limit.
-- The server turns it into a GitHub issue; issue_url is filled in when that worked. You read and add only your own.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  page text check (char_length(page) <= 500),
  triage text check (triage in ('issue', 'needs_dan', 'ignore', 'untriaged')),
  issue_url text check (char_length(issue_url) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback for select to authenticated
  using (user_id = auth.uid());

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated
  with check (user_id = auth.uid());
