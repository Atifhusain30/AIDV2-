begin;

-- Manual review of individual providers: document expirations, reviewer
-- attribution, suspension, and an append-only audit trail.

alter table public.driver_profiles drop constraint if exists driver_profiles_verification_status_check;
alter table public.driver_profiles add constraint driver_profiles_verification_status_check
  check (verification_status in ('pending', 'under_review', 'verified', 'rejected', 'suspended'));

alter table public.driver_profiles
  add column if not exists review_notes text check (char_length(review_notes) <= 1000),
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  -- Earliest expiration among approved license/insurance/registration at approval time.
  -- Dispatch requires this to be in the future.
  add column if not exists credentials_valid_until date;

alter table public.driver_documents
  add column if not exists expires_on date,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.driver_documents drop constraint if exists driver_documents_review_notes_length;
alter table public.driver_documents add constraint driver_documents_review_notes_length
  check (review_notes is null or char_length(review_notes) <= 1000);

create table if not exists public.driver_verification_events (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  document_id uuid references public.driver_documents(id) on delete set null,
  action text not null check (action in ('submitted', 'document_approved', 'document_rejected', 'verified', 'rejected', 'suspended', 'reinstated')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists driver_verification_events_driver_idx
  on public.driver_verification_events(driver_id, created_at desc);
create index if not exists driver_profiles_verification_status_idx
  on public.driver_profiles(verification_status);
create index if not exists driver_documents_pending_idx
  on public.driver_documents(driver_id) where status = 'pending';

-- Audit rows are written and read only by the API (service connection).
alter table public.driver_verification_events enable row level security;
revoke all on public.driver_verification_events from anon, authenticated;

commit;
