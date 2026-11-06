-- Gigs (R15): making a gig failed for everyone but the service role. The insert returns the new row, and the select
-- policy asked gig_can_read(), which looks the gig up again and can't see a row this same statement is inserting.
-- The creator now passes on the row's own column first. Safe to run more than once.
drop policy if exists gigs_select on public.gigs;
create policy gigs_select on public.gigs for select to authenticated using (created_by = auth.uid() or public.gig_can_read(id));
