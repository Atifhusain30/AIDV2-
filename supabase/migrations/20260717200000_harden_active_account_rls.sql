begin;

create or replace function public.is_active_account(expected_role text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (expected_role is null or p.role = expected_role)
  );
$$;

revoke all on function public.is_active_account(text) from public;
grant execute on function public.is_active_account(text) to authenticated;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated
  using (id = auth.uid() and public.is_active_account());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_active_account())
  with check (id = auth.uid() and public.is_active_account());

drop policy if exists driver_profiles_select_self on public.driver_profiles;
create policy driver_profiles_select_self on public.driver_profiles for select to authenticated
  using (profile_id = auth.uid() and public.is_active_account('driver'));

drop policy if exists vehicles_owner_all on public.vehicles;
create policy vehicles_owner_all on public.vehicles for all to authenticated
  using (customer_id = auth.uid() and public.is_active_account('customer'))
  with check (customer_id = auth.uid() and public.is_active_account('customer'));

drop policy if exists bookings_customer_select on public.bookings;
create policy bookings_customer_select on public.bookings for select to authenticated
  using (customer_id = auth.uid() and public.is_active_account('customer'));

drop policy if exists bookings_driver_select on public.bookings;
create policy bookings_driver_select on public.bookings for select to authenticated
  using (driver_id = auth.uid() and public.is_active_account('driver'));

drop policy if exists booking_events_participant_select on public.booking_events;
create policy booking_events_participant_select on public.booking_events for select to authenticated
  using (
    public.is_active_account() and exists (
      select 1 from public.bookings b
      where b.id = booking_id and (b.customer_id = auth.uid() or b.driver_id = auth.uid())
    )
  );

drop policy if exists driver_documents_select_self on public.driver_documents;
create policy driver_documents_select_self on public.driver_documents for select to authenticated
  using (driver_id = auth.uid() and public.is_active_account('driver'));

commit;
