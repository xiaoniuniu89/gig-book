-- Lick progression (R8.4). Safe to run more than once.
--
-- A lick can store the chords it sits over ("Dm7 G7 | Cmaj7") and the key they're written in, so it can be
-- exported to iReal Pro or practised in the chart view. Existing licks keep null. Same RLS as the rest of
-- the licks table (0007): readable by the owner and by members of setlists it's linked into; only the owner edits.

alter table public.licks add column if not exists progression text;
alter table public.licks add column if not exists prog_key text;

do $$ begin
  alter table public.licks add constraint licks_progression_len check (char_length(progression) <= 400);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.licks add constraint licks_prog_key_chk
    check (prog_key is null or prog_key in ('C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'));
exception when duplicate_object then null; end $$;
