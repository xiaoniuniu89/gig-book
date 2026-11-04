-- Email notifications (R7.2). Safe to run more than once.
-- emailed_at marks a notification whose email has been claimed by /api/email/notify, so a retried webhook never sends twice.
-- Clients cannot change it (0006 grants update on read_at only).
alter table public.notifications add column if not exists emailed_at timestamptz;
