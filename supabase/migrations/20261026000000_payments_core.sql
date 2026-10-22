-- C2/C3: card hold at request, capture on completion, release on cancel/expiry, cancellation fee,
-- refunds, disputes, webhook dedupe. Rules live in server/payments.js; Stripe is only called by the API.
--
--   * stripe_customers: one Stripe Customer per AID user (created by the API on the first request).
--   * booking_payments: one row per booking that needed a card hold. Money in cents. `status`:
--       awaiting_authorization  PaymentIntent created (capture_method=manual), card not confirmed yet
--       authorized              hold placed (Stripe status requires_capture) — only now does the request reach drivers
--       failed                  the card was declined / 3-D Secure failed; the customer can try another card
--       captured                job completed, quote charged (never more than the hold)
--       fee_captured            customer cancelled after the driver was on the way: cancellation fee charged, rest released
--       released                hold cancelled (cancel before the driver was on the way, expiry, driver/system cancel): no charge
--       partially_refunded / refunded   admin refund(s) after a capture
--     Disputes are tracked separately (dispute_*), and needs_attention flags a booking for the admin
--     (open dispute, a capture/release that kept failing).
--   * payment_refunds: each refund (admin-issued or seen on a webhook), keyed by Stripe refund id.
--   * stripe_events: every verified webhook event id, so a retried delivery is processed once.
--   * bookings.payment_status gains 'not_required' (dev requests made with DEV_ALLOW_UNPAID_REQUESTS=true).
-- All new tables: RLS on, no policies, no client privileges (API only). Idempotent: safe to run more than once.

create table if not exists public.stripe_customers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id like 'cus_%'),
  created_at timestamptz not null default now()
);

create table if not exists public.booking_payments (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  payment_intent_id text not null unique check (payment_intent_id like 'pi_%'),
  stripe_customer_id text,
  status text not null default 'awaiting_authorization',
  currency text not null default 'usd',
  quoted_cents integer not null check (quoted_cents > 0),
  amount_authorized_cents integer not null default 0 check (amount_authorized_cents >= 0),
  amount_captured_cents integer not null default 0 check (amount_captured_cents >= 0),
  cancellation_fee_cents integer not null default 0 check (cancellation_fee_cents >= 0),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  settlement_attempts integer not null default 0,
  settled_at timestamptz,
  authorized_at timestamptz,
  dispute_id text,
  dispute_status text,
  dispute_amount_cents integer,
  dispute_reason text,
  needs_attention text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_payments drop constraint if exists booking_payments_status_check;
alter table public.booking_payments add constraint booking_payments_status_check check (status in (
  'awaiting_authorization', 'authorized', 'failed', 'captured', 'fee_captured', 'released', 'partially_refunded', 'refunded'
));
alter table public.booking_payments drop constraint if exists booking_payments_attention_check;
alter table public.booking_payments add constraint booking_payments_attention_check check (
  needs_attention is null or needs_attention in ('dispute', 'settlement_failed')
);
alter table public.booking_payments drop constraint if exists booking_payments_refund_not_above_capture;
alter table public.booking_payments add constraint booking_payments_refund_not_above_capture check (refunded_cents <= greatest(amount_captured_cents, 0));
alter table public.booking_payments drop constraint if exists booking_payments_capture_not_above_hold;
alter table public.booking_payments add constraint booking_payments_capture_not_above_hold check (
  amount_captured_cents <= greatest(amount_authorized_cents, quoted_cents)
);

-- Settlement sweep: terminal bookings whose hold is still open.
create index if not exists booking_payments_open_idx on public.booking_payments (status) where settled_at is null;
create index if not exists booking_payments_attention_idx on public.booking_payments (needs_attention) where needs_attention is not null;

drop trigger if exists booking_payments_set_updated_at on public.booking_payments;
create trigger booking_payments_set_updated_at before update on public.booking_payments for each row execute function public.set_updated_at();

create table if not exists public.payment_refunds (
  id text primary key check (id like 're_%' or id like 'pyr_%'),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  status text not null,
  reason text check (reason is null or char_length(reason) <= 500),
  stripe_reason text,
  admin_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payment_refunds_booking_idx on public.payment_refunds (booking_id, created_at);

create table if not exists public.stripe_events (
  id text primary key check (id like 'evt_%'),
  type text not null,
  booking_id uuid references public.bookings(id) on delete set null,
  received_at timestamptz not null default now()
);

-- Dev-only unpaid requests are marked honestly.
alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check
  check (payment_status in ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'not_required'));

alter table public.stripe_customers enable row level security;
alter table public.booking_payments enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.stripe_events enable row level security;
revoke all on public.stripe_customers from anon, authenticated;
revoke all on public.booking_payments from anon, authenticated;
revoke all on public.payment_refunds from anon, authenticated;
revoke all on public.stripe_events from anon, authenticated;
