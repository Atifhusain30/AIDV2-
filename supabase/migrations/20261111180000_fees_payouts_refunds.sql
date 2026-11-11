-- C3/C4: cancellation fees, refunds, disputes and driver payouts (server/payments.js, server/payouts.js).
--  • bookings.cancellation_fee_cents — charged when the customer cancels after the free window.
--  • bookings.payment_charge_id / refunded_cents — what Stripe charged and refunded.
--  • bookings.payout_* — the driver's share of a charged job, sent to their Stripe account.
--  • driver_profiles.stripe_account_id / payouts_ready — the driver's Stripe payout account.
--  • payment_status gains 'disputed' (the customer's bank opened a chargeback).
-- Only the API (service connection) writes these.

alter table public.bookings
  add column if not exists cancellation_fee_cents integer check (cancellation_fee_cents is null or cancellation_fee_cents >= 0),
  add column if not exists payment_charge_id text check (payment_charge_id is null or payment_charge_id ~ '^(ch|py)_[A-Za-z0-9]{1,250}$'),
  add column if not exists refunded_cents integer not null default 0 check (refunded_cents >= 0),
  add column if not exists payout_status text not null default 'none'
    check (payout_status in ('none','pending','paid','failed','reversed')),
  add column if not exists payout_amount_cents integer check (payout_amount_cents is null or payout_amount_cents >= 0),
  add column if not exists payout_transfer_id text check (payout_transfer_id is null or payout_transfer_id ~ '^tr_[A-Za-z0-9]{1,250}$'),
  add column if not exists payout_at timestamptz;

alter table public.bookings drop constraint if exists bookings_final_price_cents_check;
alter table public.bookings add constraint bookings_final_price_cents_check check (final_price_cents is null or final_price_cents >= 0);

alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check
  check (payment_status in ('pending','authorized','processing','succeeded','canceled','failed','refunded','disputed'));

create index if not exists bookings_pending_payout_idx on public.bookings (driver_id) where payout_status = 'pending';
create index if not exists bookings_driver_earnings_idx on public.bookings (driver_id, completed_at desc) where payout_status <> 'none';

alter table public.driver_profiles
  add column if not exists stripe_account_id text unique
    check (stripe_account_id is null or stripe_account_id ~ '^acct_[A-Za-z0-9]{1,250}$'),
  add column if not exists payouts_ready boolean not null default false;
