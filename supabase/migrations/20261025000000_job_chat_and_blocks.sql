-- B12: in-app chat between the customer and the driver of a job (text only), and blocking.
--   * job_messages: one row per message. Only the job's customer or assigned driver can write, only
--     while the job is accepted / en_route / arrived / in_progress (server/chat.js; the API's insert
--     re-checks it in SQL). Body 1–1000 characters. `seq` is the polling cursor: inserts lock the
--     booking row, so within one job seq order is commit order and "after seq N" never skips a message.
--     read_at is set when the other participant reads it. client_id makes a retried send idempotent.
--     Messages stay for admins after the apps stop showing them (24 h after the job ends).
--   * user_blocks: either participant can block the other from a job. Effect: chat closes on that job
--     and dispatch never pairs them again (the customer's requests are hidden from that driver and the
--     driver can't accept them — enforced in the request list, the accept checks and the atomic accept).
--     One row per (blocker, blocked); there is no unblock in the apps yet.
--   * Written and read by the API only: RLS on, no policies, no client privileges (E1).
-- Idempotent: safe to run more than once.

create table if not exists public.job_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_role text not null check (sender_role in ('customer', 'driver')),
  body text not null check (char_length(body) between 1 and 1000),
  client_id text check (client_id is null or char_length(client_id) <= 64),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint job_messages_seq_key unique (seq)
);

-- Polling: messages of one job after a cursor.
create index if not exists job_messages_booking_seq_idx on public.job_messages (booking_id, seq);
-- Unread counts in the booking payload.
create index if not exists job_messages_unread_idx on public.job_messages (booking_id, sender_id) where read_at is null;
-- Rate limit: a sender's recent messages.
create index if not exists job_messages_sender_created_idx on public.job_messages (sender_id, created_at desc);
-- A retried send with the same client id returns the first one instead of a duplicate.
create unique index if not exists job_messages_sender_client_id_key on public.job_messages (sender_id, client_id) where client_id is not null;

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  blocker_role text not null check (blocker_role in ('customer', 'driver')),
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint user_blocks_pkey primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
-- "Is either of these two blocking the other?" from the blocked side (the primary key covers the other).
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id, blocker_id);

alter table public.job_messages enable row level security;
alter table public.user_blocks enable row level security;
revoke all on public.job_messages from anon, authenticated;
revoke all on public.user_blocks from anon, authenticated;
