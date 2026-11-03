-- A setlist can have any number of sets, not just two (up to 9; the app offers 6). Safe to run more than once.
alter table public.setlist_items drop constraint if exists setlist_items_set_no_check;
do $$ begin
  alter table public.setlist_items add constraint setlist_items_set_no_check check (set_no between 1 and 9);
exception when duplicate_object then null; end $$;
