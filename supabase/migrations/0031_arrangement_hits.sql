-- Arrangements carry hits and the feel per section, like a setlist tune (R3.6, R13). Same shape and limits as 0029.
-- Safe to run more than once.
alter table public.arrangements add column if not exists hits jsonb not null default '[]'::jsonb;
alter table public.arrangements add column if not exists feels jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.arrangements add constraint arrangements_hits_shape check (
    jsonb_typeof(hits) = 'array' and jsonb_array_length(hits) <= 300 and pg_column_size(hits) <= 40000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.arrangements add constraint arrangements_feels_shape check (
    jsonb_typeof(feels) = 'object' and pg_column_size(feels) <= 2000);
exception when duplicate_object then null; end $$;
