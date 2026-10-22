-- D5: the driver's service vehicle gets year, plate state and equipment type.
-- Drivers need complete vehicle details before going online (enforced in the API). Clients write
-- through the API only; no new grants (least-privilege grants from 20261021230000 stay in force).

alter table public.driver_profiles
  add column if not exists vehicle_year integer,
  add column if not exists vehicle_plate_state text not null default '',
  add column if not exists vehicle_equipment_type text not null default '';

alter table public.driver_profiles drop constraint if exists driver_profiles_vehicle_details_check;
alter table public.driver_profiles add constraint driver_profiles_vehicle_details_check check (
  (vehicle_year is null or vehicle_year between 1980 and 2100) and
  (vehicle_plate_state = '' or vehicle_plate_state ~ '^[A-Z]{2}$') and
  vehicle_equipment_type in ('', 'flatbed', 'wheel_lift', 'light_duty')
);
