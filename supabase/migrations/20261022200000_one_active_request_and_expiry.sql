-- E4: one active request per customer, and stale requests end on their own.
--   * New terminal status 'expired': a request no driver accepted within the expiry window
--     (REQUEST_EXPIRY_MINUTES, default 15) is closed by the server, with an audit event
--     (actor null, metadata.role = 'system', reason 'no_driver_found').
--   * At most one active booking per customer, and one unfinished job per driver, each guaranteed
--     by a partial unique index, so two simultaneous requests (or accepts) can never both land.
-- Idempotent: safe to run more than once. Written by the API only; no new client grants.

alter table public.bookings
  add column if not exists expired_at timestamptz;

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending','searching','accepted','en_route','arrived','in_progress','completed','cancelled','expired'));

-- Before the unique index: if a customer somehow holds several unaccepted requests, keep the newest
-- open and expire the older ones (audited). Accepted jobs are never touched here.
with ranked as (
  select id, status, row_number() over (partition by customer_id order by created_at desc) as rn
  from public.bookings
  where status in ('pending','searching','accepted','en_route','arrived','in_progress')
), stale as (
  update public.bookings b set status = 'expired', expired_at = now()
  from ranked r
  where b.id = r.id and r.rn > 1 and r.status in ('pending','searching')
  returning b.id, r.status as from_status
)
insert into public.booking_events (booking_id, actor_id, event_type, from_status, to_status, metadata)
select id, null, 'status_changed', from_status, 'expired', '{"role":"system","reason":"duplicate_active_request"}'::jsonb from stale;

create unique index if not exists bookings_one_active_per_customer
  on public.bookings (customer_id)
  where status in ('pending','searching','accepted','en_route','arrived','in_progress');

-- One job per driver, also guaranteed by the database: the accept statement already refuses a driver
-- with an unfinished job, but two accepts of different jobs at the same instant could both pass that
-- check; this index lets only one of them land.
create unique index if not exists bookings_one_active_job_per_driver
  on public.bookings (driver_id)
  where driver_id is not null and status in ('accepted','en_route','arrived','in_progress');
