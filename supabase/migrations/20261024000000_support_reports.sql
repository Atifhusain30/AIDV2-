-- B18: help & support reports from customers and drivers, general or tied to a job, plus the admin
-- triage trail.
--   * support_reports: one row per report. Category comes from a fixed list per role (server/support.js;
--     the check below repeats it so a bad row can't be written even directly). Message ≤ 2000 chars.
--     Status open → in_review → resolved (admin only); resolved_by / resolved_at record who closed it.
--   * support_report_events: append-only admin trail — status changes and internal notes (notes are never
--     shown to the reporter), so an earlier note is never overwritten.
--   * Job issue reports (B10) used to be stored only as booking_events 'issue_reported' rows that no screen
--     read. They are copied here once (source_event_id keeps it idempotent) and new job reports are written
--     here directly, so the admin inbox reads one table. The booking_events row stays as the job's audit trail.
--   * Written and read by the API only: RLS on, no policies, no client privileges (E1). Apps can't read
--     other people's reports or write rows directly; the API checks job participation and rate limits.
-- Idempotent: safe to run more than once.

create table if not exists public.support_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  reporter_role text not null check (reporter_role in ('customer', 'driver')),
  booking_id uuid references public.bookings(id) on delete set null,
  booking_status text,
  category text not null,
  message text not null default '' check (char_length(message) <= 2000),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  source_event_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_reports_category_for_role check (
    (reporter_role = 'customer' and category in ('driver_behaviour', 'vehicle_damage', 'pricing', 'service_problem', 'app_problem', 'safety', 'other'))
    or (reporter_role = 'driver' and category in ('customer_behaviour', 'payment', 'vehicle_damage', 'service_problem', 'app_problem', 'safety', 'other'))
  ),
  constraint support_reports_resolved_consistent check ((status = 'resolved') = (resolved_at is not null))
);

create table if not exists public.support_report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.support_reports(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('status_changed', 'note_added')),
  from_status text,
  to_status text,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists support_reports_status_created_idx on public.support_reports (status, created_at desc);
create index if not exists support_reports_reporter_created_idx on public.support_reports (reporter_id, created_at desc);
create index if not exists support_reports_booking_idx on public.support_reports (booking_id) where booking_id is not null;
create index if not exists support_report_events_report_idx on public.support_report_events (report_id, created_at);

drop trigger if exists support_reports_set_updated_at on public.support_reports;
create trigger support_reports_set_updated_at before update on public.support_reports for each row execute function public.set_updated_at();

alter table public.support_reports enable row level security;
alter table public.support_report_events enable row level security;
revoke all on public.support_reports from anon, authenticated;
revoke all on public.support_report_events from anon, authenticated;

-- One-time copy of B10 job issue reports. New-style events carry metadata.reportId and are skipped.
insert into public.support_reports (reporter_id, reporter_role, booking_id, booking_status, category, message, status, created_at, updated_at, source_event_id)
select e.actor_id, e.metadata->>'role', e.booking_id, e.from_status,
  case e.metadata->>'role'
    when 'customer' then case e.metadata->>'category'
      when 'safety' then 'safety' when 'driver_issue' then 'driver_behaviour' when 'vehicle_damage' then 'vehicle_damage'
      when 'cannot_complete' then 'service_problem' when 'price' then 'pricing' else 'other' end
    else case e.metadata->>'category'
      when 'safety' then 'safety' when 'customer_issue' then 'customer_behaviour' when 'vehicle_damage' then 'vehicle_damage'
      when 'cannot_complete' then 'service_problem' when 'price' then 'payment' else 'other' end
  end,
  left(coalesce(e.metadata->>'details', ''), 2000), 'open', e.created_at, e.created_at, e.id
from public.booking_events e
where e.event_type = 'issue_reported' and e.metadata->>'role' in ('customer', 'driver') and not (e.metadata ? 'reportId')
on conflict (source_event_id) do nothing;
