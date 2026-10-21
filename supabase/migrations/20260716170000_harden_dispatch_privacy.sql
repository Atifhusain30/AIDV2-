begin;

-- Available jobs are served by the authenticated API, which returns only an
-- approximate pickup area. Direct Supabase reads are limited to participants
-- so verified drivers cannot bypass that response shaping and scrape exact
-- customer locations, notes, or drop-off details before accepting a job.
drop policy if exists bookings_driver_select on public.bookings;
create policy bookings_driver_select on public.bookings
  for select to authenticated
  using (driver_id = auth.uid());

commit;
