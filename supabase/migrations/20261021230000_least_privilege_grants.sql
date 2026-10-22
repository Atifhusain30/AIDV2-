begin;

-- Supabase auto-grants ALL on new public tables to anon/authenticated. RLS
-- restricts rows but not columns, so profiles_update_self let any signed-in
-- user set their own role/status (e.g. promote themselves to admin).
-- Reset to least privilege; the Express API uses the service connection.

revoke all on public.profiles, public.driver_profiles, public.vehicles, public.bookings,
  public.booking_events, public.driver_documents, public.driver_verification_events
  from anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone) on public.profiles to authenticated;
grant select on public.driver_profiles to authenticated;
grant select, insert, update, delete on public.vehicles to authenticated;
grant select on public.bookings, public.booking_events, public.driver_documents to authenticated;

-- Vehicles: clients may only write user-editable columns (ownership comes from RLS).
revoke insert, update on public.vehicles from authenticated;
grant insert (customer_id, make, model, year, color, license_plate, is_electric) on public.vehicles to authenticated;
grant update (make, model, year, color, license_plate, is_electric) on public.vehicles to authenticated;

-- Defense in depth: privileged profile fields change only through trusted roles,
-- even if a future grant or policy is loosened by mistake.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.role is distinct from old.role
          or new.status is distinct from old.status
          or new.session_version is distinct from old.session_version
          or new.id is distinct from old.id) then
    raise exception 'profile role, status, and session fields are server-managed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- Future tables created by the migration owner start with no client privileges.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

commit;
