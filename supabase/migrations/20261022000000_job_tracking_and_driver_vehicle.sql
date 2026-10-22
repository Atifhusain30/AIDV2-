-- Step 3: live job tracking and the driver's service vehicle.
-- Clients use the API for these. The existing table-level SELECT for `authenticated` (row-limited
-- by RLS to the user's own driver_profiles row / own bookings) also covers the new columns, which
-- is harmless; no write grants are added (least-privilege grants from 20261021230000 stay in force).

alter table public.driver_profiles
  add column if not exists vehicle_make text not null default '',
  add column if not exists vehicle_model text not null default '',
  add column if not exists vehicle_color text not null default '',
  add column if not exists vehicle_plate text not null default '';

alter table public.bookings
  add column if not exists driver_location_at timestamptz;

alter table public.driver_profiles drop constraint if exists driver_profiles_vehicle_lengths;
alter table public.driver_profiles add constraint driver_profiles_vehicle_lengths check (
  char_length(vehicle_make) <= 40 and char_length(vehicle_model) <= 60 and
  char_length(vehicle_color) <= 30 and char_length(vehicle_plate) <= 12
);
