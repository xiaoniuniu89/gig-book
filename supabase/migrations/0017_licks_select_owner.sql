-- Fix INSERT ... RETURNING on licks: a STABLE helper (lick_visible) runs against the pre-insert snapshot,
-- so licks_select must check `owner = auth.uid()` directly on the row first (like setlists_select). Safe to run more than once.

drop policy if exists licks_select on public.licks;
create policy licks_select on public.licks for select to authenticated
  using (owner = auth.uid() or public.lick_visible(id));
