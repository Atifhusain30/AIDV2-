-- C2: card holds at request, charge on completion (server/payments.js).
--  • profiles.stripe_customer_id — one Stripe Customer per AID account (cards live at Stripe, never here).
--  • bookings.payment_card_brand/last4 — what the receipt shows ("Visa •••• 4242").
--  • payment_status gains 'authorized' (hold placed) and 'canceled' (hold released).
--  • a partial index for the settlement sweep (holds on jobs that have ended).
-- Nothing here is writable by app users: the API (service connection) is the only writer.

alter table public.profiles
  add column if not exists stripe_customer_id text unique
    constraint profiles_stripe_customer_id_format check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]{1,250}$');

alter table public.bookings
  add column if not exists payment_card_brand text check (payment_card_brand is null or char_length(payment_card_brand) <= 20),
  add column if not exists payment_card_last4 text check (payment_card_last4 is null or payment_card_last4 ~ '^[0-9]{4}$');

alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check
  check (payment_status in ('pending','authorized','processing','succeeded','canceled','failed','refunded'));

create index if not exists bookings_unsettled_payment_idx on public.bookings (updated_at)
  where payment_status = 'authorized';
