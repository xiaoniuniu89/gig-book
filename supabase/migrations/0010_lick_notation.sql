-- Lick notation. Safe to run more than once.
--
-- A lick can store the line itself in ABC notation, drawn as sheet music on the lick page and played back.
-- Same RLS as the rest of the licks table (0007). Existing licks keep null.

alter table public.licks add column if not exists notation text;

do $$ begin
  alter table public.licks add constraint licks_notation_len check (char_length(notation) <= 20000);
exception when duplicate_object then null; end $$;
