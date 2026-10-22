// C2/C3: card hold at request → capture on completion / release on cancel or expiry → cancellation fee,
// admin refunds, disputes and webhook hardening. The app factory gets a Stripe double with stripe-node's
// real method names and argument order (helpers/stripeMock.js — webhook signatures use stripe-node's own
// code), and an in-memory repository with PostgresRepository's contract (helpers/paymentsRepository.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const Stripe = require('stripe');
const { createApp } = require('../app');
const { createStripeMock, signedEvent } = require('./helpers/stripeMock');
const { createPaymentsRepository } = require('./helpers/paymentsRepository');
const { PAYMENTS_ON, DEV_UNPAID, NOT_CONFIGURED } = require('./helpers/payments');
const {
  cancellationFeeFor, settlementFor, cleanRefundRequest, paymentsConfigFromEnv, DEFAULT_CANCELLATION_FEE_CENTS,
} = require('../payments');

const WEBHOOK_SECRET = 'whsec_test_mock_secret';
const TRUCK = { make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed' };
const USERS = {
  customerToken: { id: 'c0000000-0000-4000-8000-000000000001', role: 'customer', status: 'active', firstName: 'Casey', lastName: 'Customer' },
  otherCustomerToken: { id: 'c0000000-0000-4000-8000-000000000002', role: 'customer', status: 'active', firstName: 'Olive', lastName: 'Other' },
  driverToken: { id: 'd0000000-0000-4000-8000-000000000001', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: true, driverVehicle: TRUCK },
  adminToken: { id: 'a0000000-0000-4000-8000-000000000001', role: 'admin', status: 'active', firstName: 'Ada', lastName: 'Admin', aal: 'aal2' },
  adminAal1Token: { id: 'a0000000-0000-4000-8000-000000000001', role: 'admin', status: 'active', firstName: 'Ada', lastName: 'Admin', aal: 'aal1' },
};
const DALLAS = { address: '1 Main St, Dallas', lat: 32.7767, lng: -96.797 };
const JUMP = { serviceType: 'battery_jump', location: DALLAS }; // $69 flat → 6900 cents

function harness({ stripe = createStripeMock(), paymentsConfig = PAYMENTS_ON, webhookSecret = WEBHOOK_SECRET } = {}) {
  let now = Date.parse('2026-10-22T12:00:00Z');
  const clock = () => now;
  const repository = createPaymentsRepository({ users: USERS, clock });
  const auth = { async getUser(token) { const user = USERS[token]; return user ? { id: user.id, email: `${user.id}@example.com`, aal: user.aal || 'aal2' } : null; } };
  const app = createApp({ auth, repository, stripe, stripeWebhookSecret: webhookSecret, paymentsConfig, clock, supportContact: { email: null, phone: null } });
  const as = (token) => ({
    get: (path) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path, body = {}) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body),
    patch: (path, body = {}) => request(app).patch(path).set('Authorization', `Bearer ${token}`).send(body),
  });
  const customer = as('customerToken');
  const driver = as('driverToken');
  return {
    app, stripe, repository, customer, driver, as, advance(ms) { now += ms; },
    /** Request + card confirmed (the bank authorizes the hold) → the request is with drivers. */
    async authorizedBooking(body = JUMP) {
      const created = await customer.post('/api/bookings', body);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const intentId = repository.payments.get(created.body.id).intentId;
      stripe.authorize(intentId);
      const confirmed = await customer.post(`/api/bookings/${created.body.id}/payment/confirm`);
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
      return { id: created.body.id, intentId, created, confirmed };
    },
    async moveTo(bookingId, statuses) {
      for (const status of statuses) {
        const response = await driver.patch(`/api/bookings/${bookingId}/status`, { status });
        assert.equal(response.status, 200, `${status}: ${JSON.stringify(response.body)}`);
      }
    },
    webhook(event, secret = webhookSecret) {
      const { payload, header } = signedEvent(event, secret);
      return request(app).post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload);
    },
  };
}

const intentEvent = (id, type, object) => ({ id, object: 'event', type, data: { object } });

// ---------- pure policy ----------

test('policy: the cancellation fee applies only to a customer cancel once the driver is on the way, capped at the hold', () => {
  const base = { feeCents: 1500, authorizedCents: 6900 };
  assert.equal(cancellationFeeFor({ ...base, role: 'customer', fromStatus: 'en_route' }), 1500);
  for (const fromStatus of ['pending', 'searching', 'accepted']) assert.equal(cancellationFeeFor({ ...base, role: 'customer', fromStatus }), 0, fromStatus);
  assert.equal(cancellationFeeFor({ ...base, role: 'driver', fromStatus: 'en_route' }), 0, 'driver cancels never cost the customer');
  assert.equal(cancellationFeeFor({ role: 'customer', fromStatus: 'en_route', feeCents: 20000, authorizedCents: 6900 }), 6900, 'never above the hold');
  assert.equal(cancellationFeeFor({ role: 'customer', fromStatus: 'en_route', feeCents: 1500, authorizedCents: 0 }), 0, 'no hold, no fee');
  assert.equal(DEFAULT_CANCELLATION_FEE_CENTS, 1500);
});

test('policy: settlement is capture (completed), fee (cancelled with fee), release (anything else ended), nothing while active', () => {
  const p = { intentId: 'pi_1', status: 'authorized', amountAuthorizedCents: 6900, quotedCents: 6900, cancellationFeeCents: 0, finalCents: null };
  assert.deepEqual(settlementFor({ ...p, bookingStatus: 'completed' }), { action: 'capture', amountCents: 6900 });
  assert.deepEqual(settlementFor({ ...p, bookingStatus: 'completed', finalCents: 99999 }), { action: 'capture', amountCents: 6900 }, 'never above the hold');
  assert.deepEqual(settlementFor({ ...p, bookingStatus: 'cancelled', cancellationFeeCents: 1500 }), { action: 'capture_fee', amountCents: 1500 });
  assert.deepEqual(settlementFor({ ...p, bookingStatus: 'cancelled' }), { action: 'release' });
  assert.deepEqual(settlementFor({ ...p, bookingStatus: 'expired' }), { action: 'release' });
  assert.deepEqual(settlementFor({ ...p, status: 'awaiting_authorization', bookingStatus: 'completed' }), { action: 'release' }, 'no hold → nothing to capture');
  assert.equal(settlementFor({ ...p, bookingStatus: 'en_route' }), null);
  assert.equal(settlementFor({ ...p, status: 'captured', bookingStatus: 'completed' }), null, 'already settled');
});

test('config: unpaid dev requests need the explicit flag and never run in production; fee is owner-adjustable', () => {
  assert.equal(paymentsConfigFromEnv({}).allowUnpaidRequests, false);
  assert.equal(paymentsConfigFromEnv({ DEV_ALLOW_UNPAID_REQUESTS: 'true' }).allowUnpaidRequests, true);
  assert.equal(paymentsConfigFromEnv({ DEV_ALLOW_UNPAID_REQUESTS: 'true', NODE_ENV: 'production' }).allowUnpaidRequests, false);
  assert.equal(paymentsConfigFromEnv({ CANCELLATION_FEE_CENTS: '2500' }).cancellationFeeCents, 2500);
  assert.equal(paymentsConfigFromEnv({ CANCELLATION_FEE_CENTS: '-5' }).cancellationFeeCents, 1500, 'bad values fall back to the default');
  assert.deepEqual(paymentsConfigFromEnv({ CANCELLATION_FEE_FROM: 'accepted,en_route,arrived' }).feeFromStatuses, ['accepted', 'en_route']);
  assert.equal(paymentsConfigFromEnv({ STRIPE_SECRET_KEY: 'sk_live_x' }).mode, 'live');
});

test('refund requests need a reason; amounts are whole cents', () => {
  assert.equal(cleanRefundRequest({}).ok, false);
  assert.equal(cleanRefundRequest({ reason: 'Driver was late', amountCents: 10.5 }).ok, false);
  assert.equal(cleanRefundRequest({ reason: 'Driver was late', stripeReason: 'because' }).ok, false);
  assert.deepEqual(cleanRefundRequest({ reason: ' Driver was late ', amountCents: 500, stripeReason: 'requested_by_customer' }),
    { ok: true, refund: { amountCents: 500, reason: 'Driver was late', stripeReason: 'requested_by_customer' } });
});

test('the Stripe double uses the same methods stripe-node really has', () => {
  const real = new Stripe('sk_test_signature_check_only');
  for (const [resource, method] of [['paymentIntents', 'create'], ['paymentIntents', 'retrieve'], ['paymentIntents', 'capture'], ['paymentIntents', 'cancel'],
    ['customers', 'create'], ['refunds', 'create'], ['webhooks', 'constructEvent']]) {
    assert.equal(typeof real[resource][method], 'function', `stripe.${resource}.${method}`);
    assert.equal(typeof createStripeMock()[resource][method], 'function', `mock ${resource}.${method}`);
  }
});

// ---------- not configured ----------

test('without Stripe keys: payments report not_configured and requests are refused honestly (nothing is faked)', async () => {
  const h = harness({ stripe: null, paymentsConfig: NOT_CONFIGURED });
  const config = await request(h.app).get('/api/payments/config');
  assert.equal(config.status, 200);
  assert.equal(config.body.status, 'not_configured');
  assert.equal(config.body.unpaidRequestsAllowed, false);
  const created = await h.customer.post('/api/bookings', JUMP);
  assert.equal(created.status, 503);
  assert.equal(created.body.code, 'payments_not_configured');
  assert.equal(h.repository.bookings.size, 0, 'no request is created');
  const webhook = await request(h.app).post('/api/webhooks/stripe').set('Content-Type', 'application/json').send('{}');
  assert.equal(webhook.status, 503);
  const refund = await h.as('adminToken').post('/api/admin/payments/00000000-0000-4000-8000-000000000001/refund', { reason: 'test refund' });
  assert.equal(refund.status, 503);
});

test('dev only: DEV_ALLOW_UNPAID_REQUESTS lets a request through without a card, marked not_required (no fake charge)', async () => {
  const h = harness({ stripe: null, paymentsConfig: DEV_UNPAID });
  const config = await request(h.app).get('/api/payments/config');
  assert.equal(config.body.unpaidRequestsAllowed, true);
  const created = await h.customer.post('/api/bookings', JUMP);
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'searching');
  assert.deepEqual(created.body.payment, { status: 'not_required', amountAuthorized: 0, amountCaptured: 0, cancellationFee: 0, refunded: 0 });
  assert.equal(created.body.paymentSetup, undefined);
});

test('the dev unpaid flag is ignored once Stripe is configured', async () => {
  const h = harness({ paymentsConfig: { ...PAYMENTS_ON, allowUnpaidRequests: true } });
  const created = await h.customer.post('/api/bookings', JUMP);
  assert.equal(created.body.status, 'pending');
  assert.ok(created.body.paymentSetup.clientSecret);
});

// ---------- C2: authorization before dispatch ----------

test('a request reaches drivers only after the card hold is authorized; amount and customer come from the server', async () => {
  const h = harness();
  const created = await h.customer.post('/api/bookings', { ...JUMP, amount: 1, price: 1, estimatedPrice: 1, customerId: 'attacker' });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'pending');
  assert.equal(created.body.payment.status, 'awaiting_authorization');
  assert.match(created.body.paymentSetup.clientSecret, /^pi_mock_\d+_secret_mock$/);
  assert.equal(created.body.paymentSetup.amountCents, 6900);

  const [customerCall] = h.stripe.callsTo('customers.create');
  assert.equal(customerCall.args[0].metadata.aidUserId, USERS.customerToken.id);
  assert.equal(customerCall.options.idempotencyKey, `customer-${USERS.customerToken.id}`);
  const [createCall] = h.stripe.callsTo('paymentIntents.create');
  assert.equal(createCall.args[0].amount, 6900, 'the server price, not the client value');
  assert.equal(createCall.args[0].currency, 'usd');
  assert.equal(createCall.args[0].capture_method, 'manual');
  assert.equal(createCall.args[0].customer, h.repository.customers.get(USERS.customerToken.id));
  assert.equal(createCall.args[0].metadata.bookingId, created.body.id);
  assert.equal(createCall.args[0].metadata.customerId, USERS.customerToken.id);
  assert.equal(createCall.options.idempotencyKey, `booking-${created.body.id}-authorize`);
  // The PaymentIntent id is stored server-side.
  assert.equal(h.repository.payments.get(created.body.id).intentId, h.stripe.intents.keys().next().value);

  // Not visible to drivers, and can't be accepted, while the card isn't confirmed.
  const list = await h.driver.get('/api/drivers/requests?lat=32.7767&lng=-96.797');
  assert.equal(list.body.requests.length, 0);
  assert.equal((await h.driver.post(`/api/bookings/${created.body.id}/accept`)).status, 409);

  h.stripe.authorize(h.repository.payments.get(created.body.id).intentId);
  const confirmed = await h.customer.post(`/api/bookings/${created.body.id}/payment/confirm`);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.promoted, true);
  assert.equal(confirmed.body.booking.status, 'searching');
  assert.deepEqual(confirmed.body.booking.payment, { status: 'authorized', amountAuthorized: 69, amountCaptured: 0, cancellationFee: 0, refunded: 0 });
  assert.equal((await h.driver.get('/api/drivers/requests?lat=32.7767&lng=-96.797')).body.requests.length, 1);
  const accepted = await h.driver.post(`/api/bookings/${created.body.id}/accept`);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.payment, undefined, "drivers never see the customer's payment");
  // Audit trail: hold requested, authorized, pending → searching by the system.
  const trail = h.repository.events.filter((e) => e.bookingId === created.body.id).map((e) => e.metadata?.action || `${e.from}→${e.to}`);
  assert.deepEqual(trail.slice(0, 3), ['hold_requested', 'authorized', 'pending→searching']);
});

test('3-D Secure: requires_action keeps the request pending and tells the app to finish the bank step', async () => {
  const h = harness();
  const created = await h.customer.post('/api/bookings', JUMP);
  h.stripe.requireAction(h.repository.payments.get(created.body.id).intentId);
  const response = await h.customer.post(`/api/bookings/${created.body.id}/payment/confirm`);
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'payment_requires_action');
  assert.equal(response.body.booking.status, 'pending');
});

test('a declined card is reported, the request stays pending, and another card can still authorize it', async () => {
  const h = harness();
  const created = await h.customer.post('/api/bookings', JUMP);
  const intentId = h.repository.payments.get(created.body.id).intentId;
  h.stripe.decline(intentId, 'Your card has insufficient funds.');
  const declined = await h.customer.post(`/api/bookings/${created.body.id}/payment/confirm`);
  assert.equal(declined.status, 402);
  assert.equal(declined.body.code, 'payment_failed');
  assert.match(declined.body.error, /insufficient funds/);
  assert.equal(declined.body.booking.status, 'pending');
  assert.equal(declined.body.booking.payment.status, 'failed');
  h.stripe.authorize(intentId);
  const retried = await h.customer.post(`/api/bookings/${created.body.id}/payment/confirm`);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.booking.status, 'searching');
});

test("another customer can't confirm, see or cancel someone else's booking", async () => {
  const h = harness();
  const created = await h.customer.post('/api/bookings', JUMP);
  h.stripe.authorize(h.repository.payments.get(created.body.id).intentId);
  const other = h.as('otherCustomerToken');
  assert.equal((await other.post(`/api/bookings/${created.body.id}/payment/confirm`)).status, 404);
  assert.equal((await other.get(`/api/bookings/${created.body.id}`)).status, 404);
  assert.equal((await other.patch(`/api/bookings/${created.body.id}/status`, { status: 'cancelled' })).status, 404);
  assert.equal(h.repository.bookings.get(created.body.id).status, 'pending');
  assert.equal(h.stripe.callsTo('paymentIntents.retrieve').length, 0, 'Stripe is never asked on behalf of another customer');
});

test("a hold that can't be created ends the request (nothing charged) so it never blocks the next one", async () => {
  const h = harness();
  h.stripe.failNext('paymentIntents.create');
  const failed = await h.customer.post('/api/bookings', JUMP);
  assert.equal(failed.status, 502);
  assert.equal(failed.body.code, 'payment_setup_failed');
  assert.equal([...h.repository.bookings.values()][0].status, 'cancelled');
  assert.equal((await h.customer.post('/api/bookings', JUMP)).status, 201);
});

test('a request whose card was never confirmed is replaced by the next request (its hold released)', async () => {
  const h = harness();
  const first = await h.customer.post('/api/bookings', JUMP);
  const second = await h.customer.post('/api/bookings', JUMP);
  assert.equal(second.status, 201);
  assert.equal(h.repository.bookings.get(first.body.id).status, 'cancelled');
  assert.equal(h.repository.payments.get(first.body.id).status, 'released');
  const [cancel] = h.stripe.callsTo('paymentIntents.cancel');
  assert.equal(cancel.args[0], h.repository.payments.get(first.body.id).intentId);
  assert.equal(cancel.options.idempotencyKey, `booking-${first.body.id}-release`);
});

test('the payments tick ends requests whose card was not confirmed in time, releasing the hold', async () => {
  const h = harness();
  const created = await h.customer.post('/api/bookings', JUMP);
  h.advance(11 * 60000);
  const { ended } = await h.app.locals.payments.tick();
  assert.deepEqual(ended, [created.body.id]);
  assert.equal(h.repository.bookings.get(created.body.id).status, 'cancelled');
  assert.equal(h.repository.payments.get(created.body.id).status, 'released');
});

// ---------- C2: capture and release ----------

test('completing the job captures the quoted amount (never more than the hold) with an idempotency key', async () => {
  const h = harness();
  const { id, intentId } = await h.authorizedBooking();
  await h.driver.post(`/api/bookings/${id}/accept`);
  await h.moveTo(id, ['en_route', 'arrived', 'in_progress', 'completed']);
  const [capture] = h.stripe.callsTo('paymentIntents.capture');
  assert.equal(capture.args[0], intentId);
  assert.deepEqual(capture.args[1], { amount_to_capture: 6900 });
  assert.equal(capture.options.idempotencyKey, `booking-${id}-capture-6900`);
  const receipt = await h.customer.get(`/api/bookings/${id}`);
  assert.deepEqual(receipt.body.payment, { status: 'captured', amountAuthorized: 69, amountCaptured: 69, cancellationFee: 0, refunded: 0 });
  // Settling again (sweep, retry) changes nothing and calls Stripe no more.
  await h.app.locals.payments.settle(id);
  assert.equal(h.stripe.callsTo('paymentIntents.capture').length, 1);
});

for (const scenario of [
  { name: 'customer cancels while searching', from: [], token: 'customerToken', body: { status: 'cancelled' }, reason: 'requested_by_customer' },
  { name: 'customer cancels after the driver accepted (not yet on the way)', from: ['accept'], token: 'customerToken', body: { status: 'cancelled', reason: 'found_other_help' }, reason: 'requested_by_customer' },
  { name: 'driver cancels on the way', from: ['accept', 'en_route'], token: 'driverToken', body: { status: 'cancelled', reason: 'vehicle_problem' }, reason: 'abandoned' },
]) {
  test(`release, no fee: ${scenario.name}`, async () => {
    const h = harness();
    const { id, intentId } = await h.authorizedBooking();
    if (scenario.from.includes('accept')) await h.driver.post(`/api/bookings/${id}/accept`);
    if (scenario.from.includes('en_route')) await h.moveTo(id, ['en_route']);
    const response = await h.as(scenario.token).patch(`/api/bookings/${id}/status`, scenario.body);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const [cancel] = h.stripe.callsTo('paymentIntents.cancel');
    assert.equal(cancel.args[0], intentId);
    assert.equal(cancel.args[1].cancellation_reason, scenario.reason);
    assert.equal(cancel.options.idempotencyKey, `booking-${id}-release`);
    assert.equal(h.stripe.callsTo('paymentIntents.capture').length, 0, 'nothing is charged');
    const payment = (await h.customer.get(`/api/bookings/${id}`)).body.payment;
    assert.deepEqual(payment, { status: 'released', amountAuthorized: 69, amountCaptured: 0, cancellationFee: 0, refunded: 0 });
  });
}

test('release, no fee: the request expires with no driver (E4)', async () => {
  const h = harness();
  const { id } = await h.authorizedBooking();
  h.advance(16 * 60000);
  const list = await h.customer.get('/api/bookings');
  assert.equal(list.status, 200);
  assert.equal(h.repository.bookings.get(id).status, 'expired');
  const [cancel] = h.stripe.callsTo('paymentIntents.cancel');
  assert.equal(cancel.args[1].cancellation_reason, 'abandoned');
  assert.equal(h.repository.payments.get(id).status, 'released');
});

test('release, no fee: the system releases a job whose driver went silent (E4)', async () => {
  const h = harness();
  const { id } = await h.authorizedBooking();
  await h.driver.post(`/api/bookings/${id}/accept`);
  h.advance(61 * 60000);
  await h.customer.get('/api/bookings');
  assert.equal(h.repository.bookings.get(id).status, 'cancelled');
  assert.equal(h.repository.payments.get(id).status, 'released');
  assert.equal(h.stripe.callsTo('paymentIntents.capture').length, 0);
});

// ---------- C3: cancellation fee ----------

test('fee: a customer who cancels once the driver is on the way pays the $15 fee; the rest of the hold is released', async () => {
  const h = harness();
  const { id, intentId } = await h.authorizedBooking();
  await h.driver.post(`/api/bookings/${id}/accept`);
  await h.moveTo(id, ['en_route']);
  const response = await h.customer.patch(`/api/bookings/${id}/status`, { status: 'cancelled', reason: 'wait_too_long' });
  assert.equal(response.status, 200);
  const [capture] = h.stripe.callsTo('paymentIntents.capture');
  assert.equal(capture.args[0], intentId);
  assert.deepEqual(capture.args[1], { amount_to_capture: 1500 }, 'Stripe releases the uncaptured remainder');
  assert.equal(capture.options.idempotencyKey, `booking-${id}-fee-1500`);
  assert.deepEqual(response.body.payment, { status: 'fee_captured', amountAuthorized: 69, amountCaptured: 15, cancellationFee: 15, refunded: 0 });
  const cancelEvent = h.repository.events.find((e) => e.bookingId === id && e.to === 'cancelled');
  assert.equal(cancelEvent.metadata.cancellationFeeCents, 1500);
});

test('fee: never more than the hold, even if the configured fee is larger', async () => {
  const h = harness({ paymentsConfig: { ...PAYMENTS_ON, cancellationFeeCents: 20000 } });
  const { id } = await h.authorizedBooking();
  await h.driver.post(`/api/bookings/${id}/accept`);
  await h.moveTo(id, ['en_route']);
  await h.customer.patch(`/api/bookings/${id}/status`, { status: 'cancelled' });
  assert.deepEqual(h.stripe.callsTo('paymentIntents.capture')[0].args[1], { amount_to_capture: 6900 });
});

test('the public payments config states the fee policy the apps show', async () => {
  const h = harness();
  const config = await request(h.app).get('/api/payments/config');
  assert.deepEqual(config.body, {
    status: 'configured', mode: 'test', unpaidRequestsAllowed: false, currency: 'usd', captureMethod: 'manual',
    cancellationFee: { cents: 1500, appliesFrom: ['en_route'] },
  });
});

// ---------- settlement failures ----------

test("a failed capture never undoes the job; it's retried and flagged for the admin after 3 failures", async () => {
  const h = harness();
  const { id } = await h.authorizedBooking();
  await h.driver.post(`/api/bookings/${id}/accept`);
  await h.moveTo(id, ['en_route', 'arrived', 'in_progress']);
  h.stripe.failNext('paymentIntents.capture');
  const done = await h.driver.patch(`/api/bookings/${id}/status`, { status: 'completed' });
  assert.equal(done.status, 200);
  assert.equal(h.repository.bookings.get(id).status, 'completed');
  assert.equal(h.repository.payments.get(id).status, 'authorized');
  h.stripe.failNext('paymentIntents.capture');
  await h.app.locals.payments.tick();
  h.stripe.failNext('paymentIntents.capture');
  await h.app.locals.payments.tick();
  assert.equal(h.repository.payments.get(id).needsAttention, 'settlement_failed');
  const attention = await h.as('adminToken').get('/api/admin/payments?filter=attention');
  assert.equal(attention.body.payments[0].bookingId, id);
  await h.app.locals.payments.tick();
  assert.equal(h.repository.payments.get(id).status, 'captured');
  assert.equal(h.repository.payments.get(id).needsAttention, null);
  // Every attempt used the same idempotency key, so Stripe can never capture twice.
  assert.deepEqual(new Set(h.stripe.callsTo('paymentIntents.capture').map((c) => c.options.idempotencyKey)), new Set([`booking-${id}-capture-6900`]));
});

test('if the intent was already settled elsewhere, the server reads Stripe instead of failing', async () => {
  const h = harness();
  const { id, intentId } = await h.authorizedBooking();
  await h.driver.post(`/api/bookings/${id}/accept`);
  await h.moveTo(id, ['en_route', 'arrived', 'in_progress']);
  Object.assign(h.stripe.intents.get(intentId), { status: 'succeeded', amount_received: 6900, amount_capturable: 0 }); // captured in the dashboard
  await h.driver.patch(`/api/bookings/${id}/status`, { status: 'completed' });
  assert.equal(h.repository.payments.get(id).status, 'captured');
  assert.equal(h.repository.payments.get(id).amountCapturedCents, 6900);
});

// ---------- C3: webhooks ----------

test('webhook: a bad or missing signature is refused with 400 and nothing changes', async () => {
  const h = harness();
  const created = await h.customer.post('/api/bookings', JUMP);
  const intent = h.stripe.authorize(h.repository.payments.get(created.body.id).intentId);
  const event = intentEvent('evt_bad_1', 'payment_intent.amount_capturable_updated', intent);
  assert.equal((await h.webhook(event, 'whsec_wrong_secret')).status, 400);
  const unsigned = await request(h.app).post('/api/webhooks/stripe').set('Content-Type', 'application/json').send(JSON.stringify(event));
  assert.equal(unsigned.status, 400);
  assert.equal(h.repository.bookings.get(created.body.id).status, 'pending');
  assert.equal(h.repository.stripeEvents.size, 0);
});

test('webhook: amount_capturable_updated releases the request to drivers even if the app never called back', async () => {
  const h = harness();
  const created = await h.customer.post('/api/bookings', JUMP);
  const intent = h.stripe.authorize(h.repository.payments.get(created.body.id).intentId);
  const response = await h.webhook(intentEvent('evt_auth_1', 'payment_intent.amount_capturable_updated', intent));
  assert.equal(response.status, 200);
  assert.equal(h.repository.bookings.get(created.body.id).status, 'searching');
  // A tampered amount (not the server's quote) is never accepted as the hold.
  const second = harness();
  const other = await second.customer.post('/api/bookings', JUMP);
  const tampered = { ...second.stripe.authorize(second.repository.payments.get(other.body.id).intentId), amount: 100, amount_capturable: 100 };
  await second.webhook(intentEvent('evt_auth_2', 'payment_intent.amount_capturable_updated', tampered));
  assert.equal(second.repository.bookings.get(other.body.id).status, 'pending');
});

test('webhook: a duplicate event is acknowledged and ignored', async () => {
  const h = harness();
  const { id, intentId } = await h.authorizedBooking();
  await h.driver.post(`/api/bookings/${id}/accept`);
  await h.moveTo(id, ['en_route', 'arrived', 'in_progress', 'completed']);
  const charge = { id: 'ch_1', object: 'charge', payment_intent: intentId, amount_refunded: 1000, refunds: { data: [{ id: 're_dash_1', amount: 1000, status: 'succeeded' }] } };
  const event = intentEvent('evt_refund_1', 'charge.refunded', charge);
  const first = await h.webhook(event);
  assert.equal(first.status, 200);
  assert.equal(h.repository.payments.get(id).refundedCents, 1000);
  assert.equal(h.repository.payments.get(id).status, 'partially_refunded');
  const eventsBefore = h.repository.events.length;
  const again = await h.webhook(event);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(h.repository.events.length, eventsBefore, 'nothing processed twice');
});

test('webhook: out-of-order events never move a settled payment backwards', async () => {
  const h = harness();
  const { id, intentId } = await h.authorizedBooking();
  await h.driver.post(`/api/bookings/${id}/accept`);
  await h.moveTo(id, ['en_route', 'arrived', 'in_progress', 'completed']);
  const stale = { ...h.stripe.intents.get(intentId), status: 'requires_capture', amount_capturable: 6900 };
  await h.webhook(intentEvent('evt_late_1', 'payment_intent.amount_capturable_updated', stale));
  await h.webhook(intentEvent('evt_late_2', 'payment_intent.payment_failed', { ...stale, status: 'requires_payment_method', last_payment_error: { message: 'x' } }));
  await h.webhook(intentEvent('evt_late_3', 'payment_intent.canceled', { ...stale, status: 'canceled' }));
  assert.equal(h.repository.payments.get(id).status, 'captured');
  assert.equal(h.repository.payments.get(id).amountCapturedCents, 6900);
});

test('webhook: a processing error answers 500 and forgets the event so Stripe retries it', async () => {
  const h = harness();
  const { id, intentId } = await h.authorizedBooking();
  const original = h.repository.applyDispute;
  h.repository.applyDispute = async () => { throw new Error('database down'); };
  const event = intentEvent('evt_dispute_retry', 'charge.dispute.created', { id: 'dp_1', object: 'dispute', payment_intent: intentId, status: 'needs_response', amount: 6900, reason: 'fraudulent' });
  assert.equal((await h.webhook(event)).status, 500);
  assert.equal(h.repository.stripeEvents.has('evt_dispute_retry'), false);
  h.repository.applyDispute = original;
  assert.equal((await h.webhook(event)).status, 200);
  assert.equal(h.repository.payments.get(id).needsAttention, 'dispute');
});

test("webhook: events for PaymentIntents that aren't AID bookings are acknowledged and ignored", async () => {
  const h = harness();
  const response = await h.webhook(intentEvent('evt_foreign_1', 'payment_intent.succeeded', { id: 'pi_not_ours', object: 'payment_intent', status: 'succeeded', amount_received: 500 }));
  assert.equal(response.status, 200);
});

test('disputes flag the booking for the admin while open and clear when closed', async () => {
  const h = harness();
  const { id, intentId } = await h.authorizedBooking();
  await h.driver.post(`/api/bookings/${id}/accept`);
  await h.moveTo(id, ['en_route', 'arrived', 'in_progress', 'completed']);
  const dispute = { id: 'dp_mock_1', object: 'dispute', payment_intent: intentId, status: 'needs_response', amount: 6900, reason: 'product_not_received' };
  await h.webhook(intentEvent('evt_dp_1', 'charge.dispute.created', dispute));
  const admin = h.as('adminToken');
  const list = await admin.get('/api/admin/payments?filter=attention');
  assert.equal(list.status, 200);
  assert.equal(list.body.counts.disputes, 1);
  assert.equal(list.body.payments[0].dispute.status, 'needs_response');
  assert.equal(list.body.payments[0].needsAttention, 'dispute');
  await h.webhook(intentEvent('evt_dp_2', 'charge.dispute.closed', { ...dispute, status: 'won' }));
  assert.equal(h.repository.payments.get(id).needsAttention, null);
  assert.equal(h.repository.payments.get(id).dispute.status, 'won');
  const detail = await admin.get(`/api/admin/payments/${id}`);
  assert.ok(detail.body.events.some((e) => e.metadata?.action === 'dispute_needs_response'));
});

// ---------- C3: admin refunds ----------

test('refunds: admin-only, need the authenticator step (aal2), a reason, and can never exceed what was charged', async () => {
  const h = harness();
  const { id, intentId } = await h.authorizedBooking();
  await h.driver.post(`/api/bookings/${id}/accept`);
  await h.moveTo(id, ['en_route', 'arrived', 'in_progress', 'completed']);
  const path = `/api/admin/payments/${id}/refund`;

  assert.equal((await h.customer.post(path, { reason: 'please', amountCents: 6900 })).status, 403);
  const aal1 = await h.as('adminAal1Token').post(path, { reason: 'Driver was late', amountCents: 2000 });
  assert.equal(aal1.status, 403);
  assert.equal(aal1.body.code, 'mfa_required');
  const admin = h.as('adminToken');
  assert.equal((await admin.post(path, { amountCents: 2000 })).status, 400, 'reason required');
  assert.equal((await admin.post(path, { reason: 'Too much', amountCents: 7000 })).status, 400, 'not above the charge');
  assert.equal(h.stripe.callsTo('refunds.create').length, 0);

  const partial = await admin.post(path, { reason: 'Driver was 40 minutes late', amountCents: 2000, stripeReason: 'requested_by_customer' });
  assert.equal(partial.status, 201);
  const [call] = h.stripe.callsTo('refunds.create');
  assert.equal(call.args[0].payment_intent, intentId);
  assert.equal(call.args[0].amount, 2000);
  assert.equal(call.args[0].reason, 'requested_by_customer');
  assert.equal(call.args[0].metadata.adminId, USERS.adminToken.id);
  assert.equal(call.options.idempotencyKey, `booking-${id}-refund-0-2000`);
  assert.equal(partial.body.payment.status, 'partially_refunded');

  const rest = await admin.post(path, { reason: 'Refund the rest' });
  assert.equal(rest.status, 201);
  assert.equal(h.stripe.callsTo('refunds.create')[1].args[0].amount, 4900);
  assert.equal(h.stripe.callsTo('refunds.create')[1].options.idempotencyKey, `booking-${id}-refund-2000-4900`);
  assert.equal((await admin.post(path, { reason: 'Again' })).status, 409, 'nothing left to refund');

  const receipt = await h.customer.get(`/api/bookings/${id}`);
  assert.deepEqual(receipt.body.payment, { status: 'refunded', amountAuthorized: 69, amountCaptured: 69, cancellationFee: 0, refunded: 69 });
  const audit = h.repository.events.filter((e) => e.bookingId === id && e.metadata?.action === 'refunded');
  assert.equal(audit.length, 2);
  assert.equal(audit[0].actorId, USERS.adminToken.id);
  assert.equal(audit[0].metadata.reason, 'Driver was 40 minutes late');
});

test('refunds: a released hold has nothing to refund', async () => {
  const h = harness();
  const { id } = await h.authorizedBooking();
  await h.customer.patch(`/api/bookings/${id}/status`, { status: 'cancelled' });
  const response = await h.as('adminToken').post(`/api/admin/payments/${id}/refund`, { reason: 'Customer asked' });
  assert.equal(response.status, 409);
});
