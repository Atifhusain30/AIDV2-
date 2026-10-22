-- B8: drivers are offered requests near where they are now. driver_profiles.current_lat/lng already
-- hold the driver's last reported position; this records when, so a stale position is ignored.
-- Written by the API only; no new client grants (least-privilege grants from 20261021230000 stay).

alter table public.driver_profiles
  add column if not exists current_location_at timestamptz;

-- Request lists filter open bookings by a lat/lng box around the driver.
create index if not exists bookings_searching_location_idx
  on public.bookings (location_lat, location_lng) where status = 'searching' and driver_id is null;
