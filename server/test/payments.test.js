const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const { createPayments, paymentStatusOf, paymentConfigFromEnv, cancellationFeeCents, DEFAULT_PAYMENT_CONFIG } = require('../payments');

const DENTON = Object.freeze({ address: '500 Elm St, Denton, TX', lat: 33.2148, lng: -97.1331 });
const ACTIVE = ['pending', 'searching', 'accepted', 'en_route', 'arrived', 'in_progress'];
const VISA = { id: 'pm_visa', customer: 'cus_casey', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } };
const SOMEONE_ELSES = { id: 'pm_other', customer: 'cus_other', card: { brand: 'mastercard', last4: '4444', exp_month: 1, exp_year: 2031 } };

function cardError(code, declineCode) {
  return Object.assign(new Error('card error'), { type: 'StripeCardError', code, decline_code: declineCode });
}

function fakeStripe() {
  const stripe = {
    calls: [],
    intents: new Map(),
    paymentMethodsById: new Map([[VISA.id, VISA], [SOMEONE_ELSES.id, SOMEONE_ELSES]]),
    holdError: null,
    holdStatus: 'requires_capture',
    captureError: null,
    customers: {
      async create(input, options) { stripe.calls.push(['customers.create', input, options]); return { id: 'cus_new' }; },
      async del(id) { stripe.calls.push(['customers.del', id]); return { id, deleted: true }; },
    },
    refunds: {
      async create(input, options) { stripe.calls.push(['refunds.create', input, options]); return { id: `re_${stripe.callsOf('refunds.create').length}`, amount: input.amount }; },
    },
    transfers: {
      transferError: null,
      async create(input, options) {
        stripe.calls.push(['transfers.create', input, options]);
        if (stripe.transfers.transferError) throw stripe.transfers.transferError;
        return { id: `tr_${stripe.callsOf('transfers.create').length}`, amount: input.amount };
      },
      async createReversal(id, input, options) { stripe.calls.push(['transfers.createReversal', id, input, options]); return { id: 'trr_1', amount: input.amount }; },
    },
    setupIntents: {
      async create(input) { stripe.calls.push(['setupIntents.create', input]); return { id: 'seti_1', client_secret: 'seti_1_secret' }; },
    },
    paymentMethods: {
      async list({ customer }) { return { data: [...stripe.paymentMethodsById.values()].filter((pm) => pm.customer === customer) }; },
      async retrieve(id) {
        const pm = stripe.paymentMethodsById.get(id);
        if (!pm) throw Object.assign(new Error('No such PaymentMethod'), { type: 'StripeInvalidRequestError' });
        return pm;
      },
      async detach(id) { stripe.calls.push(['paymentMethods.detach', id]); stripe.paymentMethodsById.delete(id); return { id }; },
    },
    paymentIntents: {
      async create(input, options) {
        stripe.calls.push(['paymentIntents.create', input, options]);
        if (stripe.holdError) throw stripe.holdError;
        const intent = { id: `pi_${stripe.intents.size + 1}`, status: stripe.holdStatus, amount: input.amount };
        stripe.intents.set(intent.id, intent);
        return intent;
      },
      async capture(id, params, options) {
        stripe.calls.push(['paymentIntents.capture', id, options, params]);
        if (stripe.captureError) throw stripe.captureError;
        const intent = stripe.intents.get(id);
        if (intent.status !== 'requires_capture') throw Object.assign(new Error('unexpected state'), { type: 'StripeInvalidRequestError' });
        intent.status = 'succeeded';
        intent.amount_received = params && params.amount_to_capture ? params.amount_to_capture : intent.amount;
        intent.latest_charge = `ch_${id.slice(3)}`;
        return intent;
      },
      async cancel(id, _params, options) {
        stripe.calls.push(['paymentIntents.cancel', id, options]);
        const intent = stripe.intents.get(id) || { id };
        intent.status = 'canceled';
        stripe.intents.set(id, intent);
        return intent;
      },
      async retrieve(id) { return stripe.intents.get(id); },
    },
  };
  stripe.callsOf = (name) => stripe.calls.filter(([call]) => call === name);
  return stripe;
}

function harness({ stripe = fakeStripe(), customerIds = { 'customer-1': 'cus_casey' }, now = () => Date.now(), stripeV2 = null, driverAccounts = {} } = {}) {
  const users = {
    customerToken: { id: 'customer-1', role: 'customer', status: 'active', firstName: 'Casey', lastName: 'Customer' },
    driverToken: { id: 'driver-1', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: true, firstName: 'Dana', lastName: 'Driver' },
    adminToken: { id: 'admin-1', role: 'admin', status: 'active' },
  };
  const bookings = new Map();
  const stripeCustomers = new Map(Object.entries(customerIds));
  const repository = {
    async getProfile(id) { return Object.values(users).find((user) => user.id === id) || null; },
    async getStripeCustomerId(id) { return stripeCustomers.get(id) || null; },
    async setStripeCustomerId(id, customerId) {
      if (!stripeCustomers.has(id)) stripeCustomers.set(id, customerId);
      return stripeCustomers.get(id);
    },
    async expireStaleBookings() { return { expired: [], released: [] }; },
    async getVehicle() { return null; },
    async getActiveBooking(userId, role) {
      const key = role === 'driver' ? 'driverId' : 'customerId';
      return [...bookings.values()].find((booking) => booking[key] === userId && ACTIVE.includes(booking.status)) || null;
    },
    failNextCreate: false,
    async createBooking(input) {
      if (this.failNextCreate) { this.failNextCreate = false; throw new Error('database unavailable'); }
      const booking = { id: `booking-${bookings.size + 1}`, status: 'searching', createdAt: new Date(), ...input };
      bookings.set(booking.id, booking);
      return booking;
    },
    async getBooking(id, userId, role) {
      const booking = bookings.get(id);
      if (!booking) return null;
      return (role === 'driver' ? booking.driverId : booking.customerId) === userId ? booking : null;
    },
    async updateBookingStatus(id, actorId, role, next, allowed, { cancellationFeeCents = 0 } = {}) {
      const booking = bookings.get(id);
      const owner = role === 'driver' ? booking?.driverId : booking?.customerId;
      if (!booking || owner !== actorId || !allowed.includes(booking.status)) return null;
      const updated = { ...booking, status: next, ...(cancellationFeeCents ? { cancellationFeeCents } : {}) };
      bookings.set(id, updated);
      return updated;
    },
    async recordCapture(intentId, { capturedCents, chargeId, payoutCents }) {
      for (const booking of bookings.values()) {
        if (booking.payment?.intentId !== intentId) continue;
        booking.payment = { ...booking.payment, status: 'succeeded', charged: capturedCents / 100 };
        booking.chargeId = chargeId;
        booking.capturedCents = capturedCents;
        if (payoutCents > 0 && booking.driverId && !booking.payoutStatus) Object.assign(booking, { payoutStatus: 'pending', payoutCents });
        return booking.id;
      }
      return null;
    },
    async getChargeDetails(id) {
      const b = bookings.get(id);
      return b ? { intentId: b.payment?.intentId, paymentStatus: b.payment?.status, capturedCents: b.capturedCents || 0, refundedCents: b.refundedCents || 0,
        payoutStatus: b.payoutStatus || 'none', payoutAmountCents: b.payoutCents || 0, payoutTransferId: b.transferId || null } : null;
    },
    async recordRefund(id, { amountCents, full, payoutReductionCents }) {
      const b = bookings.get(id);
      b.refundedCents = (b.refundedCents || 0) + amountCents;
      if (full) b.payment = { ...b.payment, status: 'refunded' };
      b.payoutCents = Math.max(0, (b.payoutCents || 0) - payoutReductionCents);
      return b;
    },
    accounts: new Map(Object.entries(driverAccounts)),
    async getDriverStripeAccount(driverId) { return this.accounts.get(driverId) || { accountId: null, ready: false }; },
    async setDriverStripeAccount(driverId, accountId) {
      if (!this.accounts.has(driverId)) this.accounts.set(driverId, { accountId, ready: false });
      return this.accounts.get(driverId).accountId;
    },
    async setPayoutsReady(driverId, ready) { this.accounts.set(driverId, { ...this.accounts.get(driverId), ready }); },
    async listPendingPayouts() {
      return [...bookings.values()].filter((b) => b.payoutStatus === 'pending').map((b) => ({
        bookingId: b.id, driverId: b.driverId, amountCents: b.payoutCents, chargeId: b.chargeId,
        stripeAccountId: this.accounts.get(b.driverId)?.accountId || null, payoutsReady: Boolean(this.accounts.get(b.driverId)?.ready),
      }));
    },
    async recordPayout(id, { status, transferId }) { Object.assign(bookings.get(id), { payoutStatus: status, transferId }); },
    async listDriverEarnings(driverId) {
      const mine = [...bookings.values()].filter((b) => b.driverId === driverId && b.payoutStatus);
      const sum = (status) => mine.filter((b) => b.payoutStatus === status).reduce((t, b) => t + b.payoutCents, 0) / 100;
      return { pending: sum('pending'), paid: sum('paid'), thisWeek: sum('pending') + sum('paid'), jobs: mine.map((b) => ({ bookingId: b.id, payoutStatus: b.payoutStatus, amount: b.payoutCents / 100 })) };
    },
    async listUnsettledPayments(ids) {
      return [...bookings.values()]
        .filter((booking) => booking.payment?.status === 'authorized' && ['completed', 'cancelled', 'expired'].includes(booking.status))
        .filter((booking) => !ids || ids.includes(booking.id))
        .map((booking) => ({ bookingId: booking.id, status: booking.status, intentId: booking.payment.intentId, driverId: booking.driverId || null, cancellationFeeCents: booking.cancellationFeeCents || 0 }));
    },
    async updatePaymentStatus(intentId, status) {
      for (const booking of bookings.values()) {
        if (booking.payment?.intentId === intentId) booking.payment = { ...booking.payment, status };
      }
    },
  };
  const auth = { async getUser(token) { const user = users[token]; return user ? { id: user.id, email: `${user.id}@example.com`, aal: 'aal2' } : null; } };
  return { app: createApp({ auth, repository, stripe, stripeV2, clock: now, accountAdmin: { async deleteUser() {} } }), repository, bookings, stripe, stripeCustomers };
}

const requestHelp = (app, body = {}) => request(app).post('/api/bookings').set('authorization', 'Bearer customerToken')
  .send({ serviceType: 'battery_jump', location: DENTON, paymentMethodId: 'pm_visa', requestId: 'req-00000001', ...body });

test('maps Stripe payment states to booking payment states', () => {
  assert.equal(paymentStatusOf({ status: 'requires_capture' }), 'authorized');
  assert.equal(paymentStatusOf({ status: 'succeeded' }), 'succeeded');
  assert.equal(paymentStatusOf({ status: 'canceled' }), 'canceled');
  assert.equal(paymentStatusOf({ status: 'requires_payment_method' }), 'failed');
});

test('saving a card creates one Stripe customer per account and returns a setup secret', async () => {
  const { app, stripe, stripeCustomers } = harness({ customerIds: {} });
  const response = await request(app).post('/api/payments/setup-intent').set('authorization', 'Bearer customerToken').send({});
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { clientSecret: 'seti_1_secret' });
  const [, customerInput, customerOptions] = stripe.callsOf('customers.create')[0];
  assert.equal(customerInput.email, 'customer-1@example.com');
  assert.equal(customerOptions.idempotencyKey, 'aid-customer-customer-1');
  assert.equal(stripeCustomers.get('customer-1'), 'cus_new');
  const [, setupInput] = stripe.callsOf('setupIntents.create')[0];
  assert.equal(setupInput.customer, 'cus_new');
  assert.equal(setupInput.usage, 'off_session');

  await request(app).post('/api/payments/setup-intent').set('authorization', 'Bearer customerToken').send({});
  assert.equal(stripe.callsOf('customers.create').length, 1, 'the stored customer is reused');
});

test('lists only the customer\'s own cards, never card numbers', async () => {
  const { app } = harness();
  const response = await request(app).get('/api/payments/methods').set('authorization', 'Bearer customerToken');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.methods, [{ id: 'pm_visa', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 }]);
  assert.deepEqual(response.body.policy, { cancellationFee: 10, freeCancelMinutes: 5 }, 'the app shows the same fee the server charges');

  const fresh = harness({ customerIds: {} });
  const none = await request(fresh.app).get('/api/payments/methods').set('authorization', 'Bearer customerToken');
  assert.deepEqual(none.body.methods, []);
  assert.equal(fresh.stripe.callsOf('customers.create').length, 0, 'looking does not create a Stripe customer');
});

test('payment endpoints are for customers and report when payments are off', async () => {
  const { app } = harness();
  const driver = await request(app).get('/api/payments/methods').set('authorization', 'Bearer driverToken');
  assert.equal(driver.status, 403);
  const off = harness({ stripe: null });
  const response = await request(off.app).get('/api/payments/methods').set('authorization', 'Bearer customerToken');
  assert.deepEqual(response.body, { enabled: false, methods: [] });
  const setup = await request(off.app).post('/api/payments/setup-intent').set('authorization', 'Bearer customerToken').send({});
  assert.equal(setup.status, 503);
});

test('a customer can remove their own card but not someone else\'s', async () => {
  const { app, stripe } = harness();
  const other = await request(app).delete('/api/payments/methods/pm_other').set('authorization', 'Bearer customerToken');
  assert.equal(other.status, 404);
  const own = await request(app).delete('/api/payments/methods/pm_visa').set('authorization', 'Bearer customerToken');
  assert.equal(own.status, 204);
  assert.deepEqual(stripe.callsOf('paymentMethods.detach').map(([, id]) => id), ['pm_visa']);
});

test('requesting help holds the server price on the saved card before drivers see it', async () => {
  const { app, stripe } = harness();
  const response = await requestHelp(app);
  assert.equal(response.status, 201);
  const [, input, options] = stripe.callsOf('paymentIntents.create')[0];
  assert.equal(input.amount, 6900, 'battery jump price from the server catalog');
  assert.equal(input.capture_method, 'manual');
  assert.equal(input.customer, 'cus_casey');
  assert.equal(input.payment_method, 'pm_visa');
  assert.equal(input.metadata.customerId, 'customer-1');
  assert.equal(options.idempotencyKey, 'aid-hold-customer-1-req-00000001');
  assert.deepEqual(response.body.payment, { intentId: 'pi_1', status: 'authorized', brand: 'visa', last4: '4242' });
});

test('the client cannot change the held amount', async () => {
  const { app, stripe } = harness();
  await requestHelp(app, { estimatedPrice: 1, amount: 1, price: 1 });
  assert.equal(stripe.callsOf('paymentIntents.create')[0][1].amount, 6900);
});

test('no card, or someone else\'s card, means no request and no hold', async () => {
  const { app, stripe, bookings } = harness();
  const missing = await requestHelp(app, { paymentMethodId: undefined });
  assert.equal(missing.status, 402);
  assert.equal(missing.body.code, 'payment_method_required');
  const stolen = await requestHelp(app, { paymentMethodId: 'pm_other' });
  assert.equal(stolen.status, 402);
  assert.equal(stripe.callsOf('paymentIntents.create').length, 0);
  assert.equal(bookings.size, 0);
});

test('a declined card is explained in plain words and creates nothing', async () => {
  const { app, stripe, bookings } = harness();
  stripe.holdError = cardError('card_declined', 'insufficient_funds');
  const response = await requestHelp(app);
  assert.equal(response.status, 402);
  assert.equal(response.body.code, 'card_declined');
  assert.match(response.body.error, /insufficient funds/i);
  assert.equal(bookings.size, 0);

  stripe.holdError = cardError('authentication_required');
  const bank = await requestHelp(app, { requestId: 'req-00000002' });
  assert.equal(bank.body.code, 'card_authentication_required');
});

test('a hold that is not authorized is released and refused', async () => {
  const { app, stripe, bookings } = harness();
  stripe.holdStatus = 'requires_action';
  const response = await requestHelp(app);
  assert.equal(response.status, 402);
  assert.equal(stripe.callsOf('paymentIntents.cancel').length, 1);
  assert.equal(bookings.size, 0);
});

test('if saving the request fails, the hold is released', async () => {
  const { app, stripe, repository } = harness();
  repository.failNextCreate = true;
  const response = await requestHelp(app);
  assert.equal(response.status, 500);
  assert.deepEqual(stripe.callsOf('paymentIntents.cancel').map(([, id]) => id), ['pi_1']);
});

test('an existing active request is answered before any hold is placed', async () => {
  const { app, stripe } = harness();
  await requestHelp(app);
  const second = await requestHelp(app, { requestId: 'req-00000002' });
  assert.equal(second.status, 409);
  assert.equal(stripe.callsOf('paymentIntents.create').length, 1);
});

test('cancelling releases the hold; completing charges it', async () => {
  const { app, stripe, bookings } = harness();
  const first = (await requestHelp(app)).body;
  const cancelled = await request(app).patch(`/api/bookings/${first.id}/status`).set('authorization', 'Bearer customerToken').send({ status: 'cancelled', reason: 'no_longer_needed' });
  assert.equal(cancelled.status, 200);
  assert.deepEqual(stripe.callsOf('paymentIntents.cancel').map(([, id]) => id), ['pi_1']);
  assert.equal(cancelled.body.payment.status, 'canceled', 'the answer shows the released hold');

  const second = (await requestHelp(app, { requestId: 'req-00000002' })).body;
  bookings.set(second.id, { ...bookings.get(second.id), status: 'in_progress', driverId: 'driver-1' });
  const completed = await request(app).patch(`/api/bookings/${second.id}/status`).set('authorization', 'Bearer driverToken').send({ status: 'completed' });
  assert.equal(completed.status, 200);
  const [, capturedId, options] = stripe.callsOf('paymentIntents.capture')[0];
  assert.equal(capturedId, 'pi_2');
  assert.equal(options.idempotencyKey, 'aid-capture-pi_2');
  assert.equal(completed.body.payment.status, 'succeeded');
});

test('a failed capture never blocks completing the job, and the sweep retries it', async () => {
  const { app, stripe, bookings } = harness();
  const job = (await requestHelp(app)).body;
  bookings.set(job.id, { ...bookings.get(job.id), status: 'in_progress', driverId: 'driver-1' });
  stripe.captureError = Object.assign(new Error('Stripe is down'), { type: 'StripeAPIError' });
  const completed = await request(app).patch(`/api/bookings/${job.id}/status`).set('authorization', 'Bearer driverToken').send({ status: 'completed' });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.status, 'completed');
  assert.equal(bookings.get(job.id).payment.status, 'authorized');

  stripe.captureError = null;
  const settled = await app.locals.payments.settle();
  assert.deepEqual(settled, [{ bookingId: job.id, status: 'succeeded' }]);
});

test('settling records what Stripe says when the hold was already settled elsewhere', async () => {
  const stripe = fakeStripe();
  stripe.intents.set('pi_9', { id: 'pi_9', status: 'succeeded', amount_received: 6900, latest_charge: 'ch_9' });
  const captures = [];
  const payments = createPayments({
    stripe,
    repository: {
      async listUnsettledPayments() { return [{ bookingId: 'b-9', status: 'completed', intentId: 'pi_9', driverId: 'd-1' }]; },
      async recordCapture(intentId, details) { captures.push([intentId, details]); },
    },
  });
  assert.deepEqual(await payments.settle(), [{ bookingId: 'b-9', status: 'succeeded' }]);
  assert.deepEqual(captures, [['pi_9', { capturedCents: 6900, chargeId: 'ch_9', payoutCents: 5520 }]]);
});

test('without Stripe configured, requests work as before and nothing is held', async () => {
  const { app, bookings } = harness({ stripe: null });
  const response = await requestHelp(app, { paymentMethodId: undefined });
  assert.equal(response.status, 201);
  assert.equal(bookings.get(response.body.id).payment, undefined);
});

// ---- C3: cancellation fees ----
const MIN = 60000;
async function acceptedJob(h, { minutesAgo, status = 'en_route' }) {
  const job = (await requestHelp(h.app)).body;
  h.bookings.set(job.id, { ...h.bookings.get(job.id), status, driverId: 'driver-1', acceptedAt: new Date(Date.now() - minutesAgo * MIN).toISOString() });
  return job;
}
const customerCancels = (app, id) => request(app).patch(`/api/bookings/${id}/status`).set('authorization', 'Bearer customerToken').send({ status: 'cancelled', reason: 'wait_too_long' });

test('the fee rules: free window, only once a driver is on the way, never more than the job', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const base = { status: 'en_route', estimatedPrice: 69, acceptedAt: '2026-11-11T11:50:00Z' };
  assert.equal(cancellationFeeCents(base, now), 1000);
  assert.equal(cancellationFeeCents({ ...base, acceptedAt: '2026-11-11T11:57:00Z' }, now), 0, 'inside the 5-minute free window');
  assert.equal(cancellationFeeCents({ ...base, status: 'searching', acceptedAt: undefined }, now), 0, 'no driver yet');
  assert.equal(cancellationFeeCents({ ...base, status: 'arrived' }, now), 0, 'customers cannot cancel after arrival anyway');
  assert.equal(cancellationFeeCents({ ...base, estimatedPrice: 5 }, now), 500);
  assert.deepEqual(paymentConfigFromEnv({}), DEFAULT_PAYMENT_CONFIG);
  assert.deepEqual(paymentConfigFromEnv({ CANCELLATION_FEE: '12.5', CANCELLATION_FREE_MINUTES: '3', DRIVER_PAYOUT_PERCENT: '75' }), { cancellationFeeCents: 1250, freeCancelMinutes: 3, driverPayoutPercent: 75 });
  assert.deepEqual(paymentConfigFromEnv({ CANCELLATION_FEE: '500', DRIVER_PAYOUT_PERCENT: '120' }), DEFAULT_PAYMENT_CONFIG, 'out-of-range values fall back');
});

test('cancelling within 5 minutes of a driver accepting is free: the whole hold is released', async () => {
  const h = harness();
  const job = await acceptedJob(h, { minutesAgo: 2 });
  const response = await customerCancels(h.app, job.id);
  assert.equal(response.status, 200);
  assert.equal(h.stripe.callsOf('paymentIntents.capture').length, 0);
  assert.equal(h.stripe.callsOf('paymentIntents.cancel').length, 1);
});

test('cancelling later charges only the $10 fee, and the driver gets their share of it', async () => {
  const h = harness({ driverAccounts: { 'driver-1': { accountId: 'acct_driver', ready: true } } });
  const job = await acceptedJob(h, { minutesAgo: 8 });
  const response = await customerCancels(h.app, job.id);
  assert.equal(response.status, 200);
  const [, , , params] = h.stripe.callsOf('paymentIntents.capture')[0];
  assert.deepEqual(params, { amount_to_capture: 1000 }, 'only the fee is captured; Stripe releases the rest');
  assert.equal(response.body.payment.status, 'succeeded');
  const [, transfer] = h.stripe.callsOf('transfers.create')[0];
  assert.equal(transfer.amount, 800);
});

test('a driver cancelling never costs the customer anything', async () => {
  const h = harness();
  const job = await acceptedJob(h, { minutesAgo: 30 });
  const response = await request(h.app).patch(`/api/bookings/${job.id}/status`).set('authorization', 'Bearer driverToken').send({ status: 'cancelled', reason: 'vehicle_problem' });
  assert.equal(response.status, 200);
  assert.equal(h.stripe.callsOf('paymentIntents.capture').length, 0);
  assert.equal(h.stripe.callsOf('paymentIntents.cancel').length, 1);
});

// ---- C4: driver payouts ----
test('completing a job queues 80% for the driver and sends it once their payout account is ready', async () => {
  const h = harness({ driverAccounts: { 'driver-1': { accountId: 'acct_driver', ready: false } } });
  const job = (await requestHelp(h.app)).body;
  h.bookings.set(job.id, { ...h.bookings.get(job.id), status: 'in_progress', driverId: 'driver-1' });
  await request(h.app).patch(`/api/bookings/${job.id}/status`).set('authorization', 'Bearer driverToken').send({ status: 'completed' });
  assert.equal(h.bookings.get(job.id).payoutStatus, 'pending');
  assert.equal(h.bookings.get(job.id).payoutCents, 5520, '80% of $69');
  assert.equal(h.stripe.callsOf('transfers.create').length, 0, 'not sent before the driver finishes payout setup');

  h.repository.accounts.set('driver-1', { accountId: 'acct_driver', ready: true });
  const sent = await h.app.locals.payouts.processPending();
  assert.deepEqual(sent, [{ bookingId: job.id, amountCents: 5520 }]);
  const [, transfer, options] = h.stripe.callsOf('transfers.create')[0];
  assert.deepEqual([transfer.destination, transfer.source_transaction, transfer.currency], ['acct_driver', 'ch_1', 'usd']);
  assert.equal(options.idempotencyKey, `aid-payout-${job.id}`);
  assert.equal(h.bookings.get(job.id).payoutStatus, 'paid');
  assert.deepEqual(await h.app.locals.payouts.processPending(), [], 'never paid twice');
});

test('a transfer refused because the account lost transfers marks it not ready and keeps the payout waiting', async () => {
  const h = harness({ driverAccounts: { 'driver-1': { accountId: 'acct_driver', ready: true } } });
  h.stripe.transfers.transferError = Object.assign(new Error('needs transfers'), { code: 'insufficient_capabilities_for_transfer' });
  const job = (await requestHelp(h.app)).body;
  h.bookings.set(job.id, { ...h.bookings.get(job.id), status: 'in_progress', driverId: 'driver-1' });
  await request(h.app).patch(`/api/bookings/${job.id}/status`).set('authorization', 'Bearer driverToken').send({ status: 'completed' });
  assert.equal(h.bookings.get(job.id).payoutStatus, 'pending');
  assert.equal(h.repository.accounts.get('driver-1').ready, false);
});

function fakeStripeV2({ transfers = 'restricted' } = {}) {
  const calls = [];
  const v2 = async (path, options = {}) => {
    calls.push([path, options]);
    if (path === '/v2/core/accounts' && options.method === 'POST') return { id: 'acct_new' };
    if (path === '/v2/core/account_links') return { url: 'https://connect.stripe.com/setup/e/acct_new/abc' };
    if (path.startsWith('/v2/core/accounts/')) return { configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: transfers } } } } } };
    throw new Error(`unexpected ${path}`);
  };
  v2.calls = calls;
  return v2;
}

test('a driver sets up payouts on Stripe\'s own page; AID never sees bank or tax details', async () => {
  const stripeV2 = fakeStripeV2();
  const h = harness({ stripeV2 });
  const link = await request(h.app).post('/api/drivers/me/payouts/onboarding').set('authorization', 'Bearer driverToken').send({});
  assert.equal(link.status, 200);
  assert.match(link.body.url, /^https:\/\/connect\.stripe\.com\//);
  const [, create] = stripeV2.calls[0];
  assert.equal(create.body.dashboard, 'express');
  assert.equal(create.body.identity.country, 'US');
  assert.equal(create.idempotencyKey, 'aid-driver-account-driver-1');
  const [, linkCall] = stripeV2.calls[1];
  assert.equal(linkCall.body.account, 'acct_new');
  assert.match(linkCall.body.use_case.account_onboarding.return_url, /\/payouts\/done$/);
  assert.equal(h.repository.accounts.get('driver-1').accountId, 'acct_new');

  const customer = await request(h.app).post('/api/drivers/me/payouts/onboarding').set('authorization', 'Bearer customerToken').send({});
  assert.equal(customer.status, 403);
});

test('the earnings screen shows setup state, the split and totals, checking Stripe for readiness', async () => {
  const h = harness({ stripeV2: fakeStripeV2({ transfers: 'active' }), driverAccounts: { 'driver-1': { accountId: 'acct_driver', ready: false } } });
  const response = await request(h.app).get('/api/drivers/me/payouts').set('authorization', 'Bearer driverToken');
  assert.equal(response.status, 200);
  assert.deepEqual([response.body.enabled, response.body.hasAccount, response.body.ready, response.body.payoutPercent], [true, true, true, 80]);
  assert.equal(h.repository.accounts.get('driver-1').ready, true, 'readiness is remembered');
});

test('the page Stripe returns drivers to is plain and links back to the app', async () => {
  const { app } = harness();
  const done = await request(app).get('/payouts/done');
  assert.equal(done.status, 200);
  assert.match(done.text, /com\.aid\.roadside:\/\/payouts/);
  assert.doesNotMatch(done.headers['content-security-policy'], /script-src/);
});

// ---- C3: refunds ----
async function chargedJob(h, { paid = false } = {}) {
  const job = (await requestHelp(h.app)).body;
  h.bookings.set(job.id, { ...h.bookings.get(job.id), status: 'in_progress', driverId: 'driver-1' });
  await request(h.app).patch(`/api/bookings/${job.id}/status`).set('authorization', 'Bearer driverToken').send({ status: 'completed' });
  if (paid) await h.app.locals.payouts.processPending();
  return job;
}
const adminRefund = (app, id, body = {}) => request(app).post(`/api/admin/bookings/${id}/refund`).set('authorization', 'Bearer adminToken').send(body);

test('an admin can refund part of a job; the driver\'s waiting payout shrinks in proportion', async () => {
  const h = harness();
  const job = await chargedJob(h);
  const response = await adminRefund(h.app, job.id, { amount: 34.5 });
  assert.equal(response.status, 200);
  assert.deepEqual([response.body.amount, response.body.full], [34.5, false]);
  const [, input, options] = h.stripe.callsOf('refunds.create')[0];
  assert.deepEqual([input.payment_intent, input.amount], ['pi_1', 3450]);
  assert.equal(options.idempotencyKey, `aid-refund-${job.id}-0-3450`);
  assert.equal(h.bookings.get(job.id).payoutCents, 2760, 'half the job refunded → half the driver share');
});

test('a full refund after the driver was paid reverses their share from their Stripe account', async () => {
  const h = harness({ driverAccounts: { 'driver-1': { accountId: 'acct_driver', ready: true } } });
  const job = await chargedJob(h, { paid: true });
  const response = await adminRefund(h.app, job.id);
  assert.equal(response.status, 200);
  assert.deepEqual([response.body.amount, response.body.full, response.body.payoutReversed], [69, true, 55.2]);
  const [, transferId, reversal] = h.stripe.callsOf('transfers.createReversal')[0];
  assert.deepEqual([transferId, reversal.amount], ['tr_1', 5520]);
  assert.equal(h.bookings.get(job.id).payment.status, 'refunded');
  const again = await adminRefund(h.app, job.id);
  assert.equal(again.status, 409, 'nothing left to refund');
});

test('refunds are admin-only and validated', async () => {
  const h = harness();
  const job = await chargedJob(h);
  assert.equal((await request(h.app).post(`/api/admin/bookings/${job.id}/refund`).set('authorization', 'Bearer customerToken').send({})).status, 403);
  assert.equal((await adminRefund(h.app, job.id, { amount: 500 })).status, 400);
  assert.equal((await adminRefund(h.app, job.id, { amount: 'all' })).status, 400);
  assert.equal((await adminRefund(h.app, 'booking-missing')).status, 409, 'an unknown job has nothing to refund');
});

test('deleting an account deletes the Stripe customer and saved cards', async () => {
  const h = harness();
  const response = await request(h.app).delete('/api/me').set('authorization', 'Bearer customerToken');
  assert.equal(response.status, 204);
  assert.deepEqual(h.stripe.callsOf('customers.del').map(([, id]) => id), ['cus_casey']);
});

test('the hold asks Stripe to email the receipt', async () => {
  const h = harness();
  await requestHelp(h.app);
  assert.equal(h.stripe.callsOf('paymentIntents.create')[0][1].receipt_email, 'customer-1@example.com');
});
