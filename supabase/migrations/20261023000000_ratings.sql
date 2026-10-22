-- B15: ratings both directions. After a completed job the customer rates the driver and the driver
-- rates the customer: 1–5 stars, optional comment (≤ 500 characters, private: admins only) and
-- optional tags from a fixed list per direction (server/ratings.js).
--   * One rating per booking per rater (unique), never of yourself (check).
--   * Written and read by the API only (service connection). RLS is on with no policies and clients
--     hold no privileges, so a signed-in user can't insert, change or read ratings directly — the API
--     enforces "completed booking, participant, once, within 7 days" and keeps comments private.
--   * Averages and counts are computed from this table on read (indexed by ratee, stars included),
--     so there is no stored aggregate to drift. driver_profiles.rating / total_jobs (always 0) are
--     legacy and no longer read by the API.
-- Idempotent: safe to run more than once.

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  rater_role text not null check (rater_role in ('customer', 'driver')),
  ratee_id uuid not null references public.profiles(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  created_at timestamptz not null default now(),
  constraint ratings_one_per_rater unique (booking_id, rater_id),
  constraint ratings_not_self check (rater_id <> ratee_id)
);

-- Aggregates (avg + count per person) read only the index.
create index if not exists ratings_ratee_idx on public.ratings (ratee_id) include (stars, created_at);
-- Completed-job counts shown next to a driver's rating.
create index if not exists bookings_driver_completed_idx on public.bookings (driver_id) where status = 'completed';

alter table public.ratings enable row level security;
revoke all on public.ratings from anon, authenticated;
