begin;

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'driver', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  session_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'under_review', 'verified', 'rejected')),
  is_online boolean not null default false,
  current_lat double precision,
  current_lng double precision,
  rating numeric(3,2) not null default 0 check (rating between 0 and 5),
  total_jobs integer not null default 0 check (total_jobs >= 0),
  specializations text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  make text not null,
  model text not null,
  year integer not null check (year between 1900 and 2100),
  color text not null default '',
  license_plate text not null default '',
  is_electric boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  driver_id uuid references public.profiles(id),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  service_type text not null check (service_type in ('oil_change','battery_jump','flat_tire','lockout','towing','ev_charging','fuel_delivery','detailing','window_tinting')),
  service_name text not null,
  status text not null default 'searching' check (status in ('pending','searching','accepted','en_route','arrived','in_progress','completed','cancelled')),
  location_address text not null,
  location_lat double precision not null check (location_lat between -90 and 90),
  location_lng double precision not null check (location_lng between -180 and 180),
  dropoff_address text,
  dropoff_lat double precision check (dropoff_lat between -90 and 90),
  dropoff_lng double precision check (dropoff_lng between -180 and 180),
  notes text check (char_length(notes) <= 1000),
  estimated_price_cents integer not null check (estimated_price_cents > 0),
  final_price_cents integer check (final_price_cents > 0),
  payment_intent_id text,
  payment_status text not null default 'pending' check (payment_status in ('pending','processing','succeeded','failed','refunded')),
  driver_lat double precision,
  driver_lng double precision,
  accepted_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index vehicles_customer_id_idx on public.vehicles(customer_id);
create index bookings_customer_created_idx on public.bookings(customer_id, created_at desc);
create index bookings_driver_status_idx on public.bookings(driver_id, status);
create index bookings_dispatch_idx on public.bookings(status, created_at) where status = 'searching' and driver_id is null;
create index booking_events_booking_idx on public.booking_events(booking_id, created_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger driver_profiles_set_updated_at before update on public.driver_profiles for each row execute function public.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'customer');
  if requested_role not in ('customer', 'driver') then requested_role := 'customer'; end if;

  insert into public.profiles (id, role, first_name, last_name, phone)
  values (
    new.id,
    requested_role,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;

  if requested_role = 'driver' then
    insert into public.driver_profiles (profile_id) values (new.id) on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into public.profiles (id, role, first_name, last_name, phone, created_at)
select
  u.id,
  case when u.raw_user_meta_data ->> 'role' in ('customer','driver') then u.raw_user_meta_data ->> 'role' else 'customer' end,
  coalesce(u.raw_user_meta_data ->> 'first_name',''),
  coalesce(u.raw_user_meta_data ->> 'last_name',''),
  coalesce(u.raw_user_meta_data ->> 'phone',''),
  u.created_at
from auth.users u
on conflict (id) do nothing;

insert into public.driver_profiles (profile_id)
select id from public.profiles where role = 'driver'
on conflict (profile_id) do nothing;

alter table public.profiles enable row level security;
alter table public.driver_profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;

create policy profiles_select_self on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy driver_profiles_select_self on public.driver_profiles for select to authenticated using (profile_id = auth.uid());
create policy vehicles_owner_all on public.vehicles for all to authenticated using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy bookings_customer_select on public.bookings for select to authenticated using (customer_id = auth.uid());
create policy bookings_driver_select on public.bookings for select to authenticated using (
  driver_id = auth.uid() or (
    status = 'searching' and driver_id is null and exists (
      select 1 from public.driver_profiles dp where dp.profile_id = auth.uid() and dp.verification_status = 'verified' and dp.is_online
    )
  )
);
create policy booking_events_participant_select on public.booking_events for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or b.driver_id = auth.uid()))
);

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone) on public.profiles to authenticated;
grant select on public.driver_profiles to authenticated;
grant select, insert, update, delete on public.vehicles to authenticated;
grant select on public.bookings, public.booking_events to authenticated;

commit;
