-- Formatted bios (R11): a bio is now limited HTML (p, br, strong, em, h3, ul, ol, li, a), so it needs more room
-- than the 5,000 characters of plain text. The app counts the visible text against 5,000; the column allows 20,000
-- for the tags. Safe to run more than once.
alter table public.profiles drop constraint if exists profiles_bio_len;
do $$ begin
  alter table public.profiles add constraint profiles_bio_len check (bio is null or char_length(bio) <= 20000);
exception when duplicate_object then null; end $$;

alter table public.bands drop constraint if exists bands_bio_check;
do $$ begin
  alter table public.bands add constraint bands_bio_len check (bio is null or char_length(bio) <= 20000);
exception when duplicate_object then null; end $$;
