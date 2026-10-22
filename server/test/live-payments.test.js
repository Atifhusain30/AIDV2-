// C2/C3 against the real dev database (LIVE_E2E=1).
//
// 1) "payments SQL" — always runs with LIVE_E2E=1: the real app factory + the real PostgresRepository on
//    the dev database, with the Stripe double (helpers/stripeMock.js). Proves every payment query, the
//    pending → searching release, fee, capture, release, refunds, disputes, webhook dedupe and RLS
//    (apps can't read the payment tables) without needing Stripe keys.
// 2) "real Stripe test mode" — runs only when server/.env has a sk_test_ key AND the dev API on :3001
//    has payments configured: real PaymentIntents with Stripe's test cards through the running API.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });
const { createApp } = require('../app');
const { PostgresRepository } = require('../repository');
const { createStripeMock, signedEvent } = require('./helpers/stripeMock');
const { PAYMENTS_ON } = require('./helpers/payments');
const { signInWithNewTotp } = require('./helpers/totp');

const runLive = process.env.LIVE_E2E === '1';
const stripeTestKey = /^sk_test_/.test(process.env.STRIPE_SECRET_KEY || '') ? process.env.STRIPE_SECRET_KEY : null;
const WEBHOOK_SECRET = 'whsec_live_sql_test';
const DALLAS = { address: '1 Main St, Dallas (payments test)', lat: 32.7767, lng: -96.797 };

async function makeUsers(supabase, pool, suffix, password, created) {
  async function createUser(label, role) {
    const email = `pay-${label}-${suffix}@example.com`;
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role, first_name: 'Pay', last_name: label } });
    if (error) throw error;
    created.push(data.user.id);
    return { id: data.user.id, email };
  }
  const customer = await createUser('customer', 'customer');
  const other = await createUser('other', 'customer');
  const driver = await createUser('driver', 'driver');
  const admin = await createUser('admin', 'customer');
  await pool.query("update public.profiles set role='admin' where id=$1", [admin.id]);
  await pool.query(`update public.driver_profiles set verification_status='verified', credentials_valid_until='2099-01-01', is_online=true,
    vehicle_make='Ford', vehicle_model='F-550', vehicle_year=2021, vehicle_color='White', vehicle_plate='PAY-1', vehicle_plate_state='TX',
    vehicle_equipment_type='flatbed', current_lat=$2, current_lng=$3, current_location_at=now() where profile_id=$1`, [driver.id, DALLAS.lat, DALLAS.lng]);
  return { customer, other, driver, admin };
}

async function cleanup(supabase, pool, created) {
  if (!created.length) return;
  await pool.query('delete from public.bookings where customer_id = any($1::uuid[])', [created]).catch(() => {});
  for (const id of [...created].reverse()) await supabase.auth.admin.deleteUser(id).catch(() => {});
}

test('payments SQL on the real database: hold → dispatch → fee / capture / release → refund → dispute (Stripe double)', { skip: !runLive, timeout: 120000 }, async () => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  const suffix = randomUUID();
  const password = `Aid-${randomUUID()}-aA1!`;
  const created = [];
  const eventIds = [];
  try {
    const users = await makeUsers(supabase, pool, suffix, password, created);
    const tokens = { customer: users.customer, other: users.other, driver: users.driver, admin: users.admin };
    const auth = { async getUser(token) { const user = tokens[token]; return user ? { id: user.id, email: user.email, aal: 'aal2' } : null; } };
    const stripe = createStripeMock();
    const repository = new PostgresRepository(pool);
    const app = createApp({ auth, repository, stripe, stripeWebhookSecret: WEBHOOK_SECRET, paymentsConfig: PAYMENTS_ON, supportContact: { email: null, phone: null } });
    const as = (token) => ({
      get: (p) => request(app).get(p).set('Authorization', `Bearer ${token}`),
      post: (p, body = {}) => request(app).post(p).set('Authorization', `Bearer ${token}`).send(body),
      patch: (p, body = {}) => request(app).patch(p).set('Authorization', `Bearer ${token}`).send(body),
    });
    const customer = as('customer');
    const driver = as('driver');
    const admin = as('admin');
    const webhook = (event) => {
      eventIds.push(event.id);
      const { payload, header } = signedEvent(event, WEBHOOK_SECRET);
      return request(app).post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload);
    };
    const paymentRow = async (bookingId) => (await pool.query('select * from public.booking_payments where booking_id=$1', [bookingId])).rows[0];
    const bookingRow = async (bookingId) => (await pool.query('select status from public.bookings where id=$1', [bookingId])).rows[0];
    const authorized = async () => {
      const made = await customer.post('/api/bookings', { serviceType: 'battery_jump', location: DALLAS, amount: 1 });
      assert.equal(made.status, 201, JSON.stringify(made.body));
      const intentId = (await paymentRow(made.body.id)).payment_intent_id;
      stripe.authorize(intentId);
      const confirmed = await customer.post(`/api/bookings/${made.body.id}/payment/confirm`);
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
      return { id: made.body.id, intentId, made, confirmed };
    };

    // 1. Hold requested: pending, invisible to drivers; PaymentIntent id + Stripe Customer stored server-side.
    const first = await customer.post('/api/bookings', { serviceType: 'battery_jump', location: DALLAS, amount: 1 });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.status, 'pending');
    assert.equal(first.body.payment.status, 'awaiting_authorization');
    const firstPay = await paymentRow(first.body.id);
    assert.equal(firstPay.quoted_cents, 6900);
    assert.match(firstPay.payment_intent_id, /^pi_mock_/);
    assert.match((await pool.query('select stripe_customer_id from public.stripe_customers where profile_id=$1', [users.customer.id])).rows[0].stripe_customer_id, /^cus_mock_/);
    const hidden = await driver.get(`/api/drivers/requests?lat=${DALLAS.lat}&lng=${DALLAS.lng}`);
    assert.equal(hidden.body.requests.some((item) => item.id === first.body.id), false, 'not dispatched before the hold');
    assert.equal((await as('other').post(`/api/bookings/${first.body.id}/payment/confirm`)).status, 404);

    // 2. Card never confirmed → the next request replaces it, hold released.
    const firstAuth = await authorized();
    assert.equal((await bookingRow(first.body.id)).status, 'cancelled');
    assert.equal((await paymentRow(first.body.id)).status, 'released');
    assert.equal(firstAuth.confirmed.body.booking.status, 'searching');
    const listed = await driver.get(`/api/drivers/requests?lat=${DALLAS.lat}&lng=${DALLAS.lng}`);
    assert.ok(listed.body.requests.some((item) => item.id === firstAuth.id), 'dispatched once authorized');
    const trail = (await pool.query("select event_type, from_status, to_status, metadata from public.booking_events where booking_id=$1 order by id", [firstAuth.id])).rows;
    assert.deepEqual(trail.map((e) => e.metadata.action || `${e.from_status}->${e.to_status}`), ['hold_requested', 'authorized', 'pending->searching']);

    // 3. Fee path: accepted → en_route → customer cancels → $15 captured, rest released.
    assert.equal((await driver.post(`/api/bookings/${firstAuth.id}/accept`)).status, 200);
    assert.equal((await driver.patch(`/api/bookings/${firstAuth.id}/status`, { status: 'en_route' })).status, 200);
    const cancelled = await customer.patch(`/api/bookings/${firstAuth.id}/status`, { status: 'cancelled', reason: 'wait_too_long' });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.deepEqual(cancelled.body.payment, { status: 'fee_captured', amountAuthorized: 69, amountCaptured: 15, cancellationFee: 15, refunded: 0 });
    const feeRow = await paymentRow(firstAuth.id);
    assert.equal(feeRow.amount_captured_cents, 1500);
    assert.ok(feeRow.settled_at);

    // 4. Completed → quote captured; admin partial refund; charge.refunded webhook; duplicate ignored.
    const second = await authorized();
    await driver.post(`/api/bookings/${second.id}/accept`);
    for (const status of ['en_route', 'arrived', 'in_progress', 'completed']) assert.equal((await driver.patch(`/api/bookings/${second.id}/status`, { status })).status, 200);
    assert.equal((await paymentRow(second.id)).status, 'captured');
    assert.equal((await paymentRow(second.id)).amount_captured_cents, 6900);
    const refund = await admin.post(`/api/admin/payments/${second.id}/refund`, { reason: 'Live SQL test refund', amountCents: 1900 });
    assert.equal(refund.status, 201, JSON.stringify(refund.body));
    assert.equal(refund.body.payment.status, 'partially_refunded');
    assert.equal(refund.body.payment.refundedCents, 1900);
    const charge = { id: `ch_${suffix}`, object: 'charge', payment_intent: second.intentId, amount_refunded: 1900, refunds: { data: [{ id: refund.body.refund.id, amount: 1900, status: 'succeeded' }] } };
    const refundEvent = { id: `evt_live_refund_${suffix}`, type: 'charge.refunded', data: { object: charge } };
    assert.equal((await webhook(refundEvent)).status, 200);
    assert.equal((await webhook(refundEvent)).body.duplicate, true);
    assert.equal((await paymentRow(second.id)).refunded_cents, 1900);
    assert.equal((await pool.query('select count(*)::int as n from public.payment_refunds where booking_id=$1', [second.id])).rows[0].n, 1);

    // 5. Dispute → flagged for the admin; closed → cleared.
    const dispute = { id: `dp_${suffix}`, object: 'dispute', payment_intent: second.intentId, status: 'needs_response', amount: 5000, reason: 'fraudulent' };
    await webhook({ id: `evt_live_dp1_${suffix}`, type: 'charge.dispute.created', data: { object: dispute } });
    const attention = await admin.get('/api/admin/payments?filter=attention');
    assert.equal(attention.status, 200);
    assert.ok(attention.body.payments.some((p) => p.bookingId === second.id && p.needsAttention === 'dispute' && p.customerEmail === users.customer.email));
    const detail = await admin.get(`/api/admin/payments/${second.id}`);
    assert.ok(detail.body.events.some((e) => e.metadata.action === 'refunded' && e.metadata.reason === 'Live SQL test refund'));
    await webhook({ id: `evt_live_dp2_${suffix}`, type: 'charge.dispute.closed', data: { object: { ...dispute, status: 'won' } } });
    assert.equal((await paymentRow(second.id)).needs_attention, null);

    // 6. Release paths: customer cancel while searching; expiry by the server.
    const third = await authorized();
    const free = await customer.patch(`/api/bookings/${third.id}/status`, { status: 'cancelled' });
    assert.equal(free.body.payment.status, 'released');
    assert.equal(stripe.intents.get(third.intentId).status, 'canceled');
    const fourth = await authorized();
    await pool.query("update public.bookings set created_at = now() - interval '20 minutes' where id=$1", [fourth.id]);
    await customer.get('/api/bookings');
    assert.equal((await bookingRow(fourth.id)).status, 'expired');
    assert.equal((await paymentRow(fourth.id)).status, 'released');

    // 7. The apps can't read any payment table directly (RLS, no grants).
    const client = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await client.auth.signInWithPassword({ email: users.customer.email, password });
    assert.equal(login.error, null);
    for (const table of ['booking_payments', 'stripe_customers', 'payment_refunds', 'stripe_events']) {
      const read = await client.from(table).select('*');
      assert.ok(read.error || read.data.length === 0, `${table} must not be readable by the app`);
    }
    // Every Stripe write used a booking-scoped idempotency key.
    for (const call of stripe.calls.filter((c) => c.method !== 'paymentIntents.retrieve')) assert.ok(call.options && call.options.idempotencyKey, `${call.method} has an idempotency key`);
  } finally {
    if (eventIds.length) await pool.query('delete from public.stripe_events where id = any($1::text[])', [eventIds]).catch(() => {});
    await cleanup(supabase, pool, created);
    await pool.end();
  }
});

test('real Stripe test mode through the running API: test cards, 3-D Secure, capture, release, fee, refund', {
  skip: !runLive ? 'LIVE_E2E not set' : !stripeTestKey ? 'Stripe test keys not configured yet (run scripts/set-stripe-keys.sh) — real Stripe check skipped' : false,
  timeout: 180000,
}, async (t) => {
  const config = await (await fetch('http://127.0.0.1:3001/api/payments/config')).json();
  if (config.status !== 'configured') { t.skip('the dev API on :3001 was started without Stripe keys — restart it after adding them'); return; }
  const Stripe = require('stripe');
  const stripe = new Stripe(stripeTestKey);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const suffix = randomUUID();
  const password = `Aid-${randomUUID()}-aA1!`;
  const created = [];
  const signIn = async (email) => {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session.access_token;
  };
  const api = (pathname, token, options = {}) => fetch(`http://127.0.0.1:3001/api${pathname}`, {
    ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  try {
    const users = await makeUsers(supabase, pool, suffix, password, created);
    const customerToken = await signIn(users.customer.email);
    const driverToken = await signIn(users.driver.email);
    const adminToken = (await signInWithNewTotp(users.admin.email, password)).token;
    const request = async (paymentMethod) => {
      const made = await api('/bookings', customerToken, { method: 'POST', body: JSON.stringify({ serviceType: 'battery_jump', location: DALLAS }) });
      assert.equal(made.status, 201);
      const booking = await made.json();
      const intentId = booking.paymentSetup.clientSecret.split('_secret_')[0];
      const intent = await stripe.paymentIntents.retrieve(intentId);
      assert.equal(intent.amount, 6900);
      assert.equal(intent.capture_method, 'manual');
      await stripe.paymentIntents.confirm(intentId, { payment_method: paymentMethod, return_url: 'https://example.com/return' });
      const confirmed = await api(`/bookings/${booking.id}/payment/confirm`, customerToken, { method: 'POST' });
      return { id: booking.id, intentId, confirmed, body: await confirmed.json() };
    };
    const move = async (id, statuses) => { for (const status of statuses) assert.equal((await api(`/bookings/${id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status }) })).status, 200); };

    // 3-D Secure card: the bank step is required → the request stays pending.
    const threeDs = await request('pm_card_authenticationRequired');
    assert.equal(threeDs.confirmed.status, 409);
    assert.equal(threeDs.body.code, 'payment_requires_action');
    // Declined card.
    const declined = await request('pm_card_chargeDeclined').catch((error) => ({ error }));
    assert.ok(declined.error || declined.confirmed.status === 402);

    // Visa → authorized → completed → captured on Stripe.
    const paid = await request('pm_card_visa');
    assert.equal(paid.confirmed.status, 200);
    assert.equal(paid.body.booking.status, 'searching');
    assert.equal((await api(`/bookings/${paid.id}/accept`, driverToken, { method: 'POST' })).status, 200);
    await move(paid.id, ['en_route', 'arrived', 'in_progress', 'completed']);
    assert.equal((await stripe.paymentIntents.retrieve(paid.intentId)).status, 'succeeded');
    assert.equal((await stripe.paymentIntents.retrieve(paid.intentId)).amount_received, 6900);
    const refund = await api(`/admin/payments/${paid.id}/refund`, adminToken, { method: 'POST', body: JSON.stringify({ reason: 'Stripe test-mode refund check', amountCents: 1000 }) });
    assert.equal(refund.status, 201);

    // Cancel while searching → released on Stripe.
    const released = await request('pm_card_visa');
    await api(`/bookings/${released.id}/status`, customerToken, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
    assert.equal((await stripe.paymentIntents.retrieve(released.intentId)).status, 'canceled');

    // Cancel once the driver is on the way → $15 captured, rest released.
    const fee = await request('pm_card_visa');
    await api(`/bookings/${fee.id}/accept`, driverToken, { method: 'POST' });
    await move(fee.id, ['en_route']);
    await api(`/bookings/${fee.id}/status`, customerToken, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
    const feeIntent = await stripe.paymentIntents.retrieve(fee.intentId);
    assert.equal(feeIntent.status, 'succeeded');
    assert.equal(feeIntent.amount_received, config.cancellationFee.cents);
  } finally {
    await cleanup(supabase, pool, created);
    await pool.end();
  }
});
