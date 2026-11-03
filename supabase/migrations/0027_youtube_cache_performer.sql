-- youtube_cache keys can now end in "|norm(performer)" (norm(title)|norm(composer)|norm(performer)); no performer = the old key.
-- Widen the length check to fit. Safe to run more than once.
alter table public.youtube_cache drop constraint if exists youtube_cache_key_check;
do $$ begin
  alter table public.youtube_cache add constraint youtube_cache_key_check check (char_length(key) between 1 and 500);
exception when duplicate_object then null;
end $$;
