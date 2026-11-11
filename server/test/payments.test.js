const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const { createPayments, paymentStatusOf } = require('../payments');

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
      async capture(id, _params, options) {
        stripe.calls.push(['paymentIntents.capture', id, options]);
        if (stripe.captureError) throw stripe.captureError;
        const intent = stripe.intents.get(id);
        if (intent.status !== 'requires_capture') throw Object.assign(new Error('unexpected state'), { type: 'StripeInvalidRequestError' });
        intent.status = 'succeeded';
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

function harness({ stripe = fakeStripe(), customerIds = { 'customer-1': 'cus_casey' } } = {}) {
  const users = {
    customerToken: { id: 'customer-1', role: 'customer', status: 'active', firstName: 'Casey', lastName: 'Customer' },
    driverToken: { id: 'driver-1', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: true },
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
    async updateBookingStatus(id, actorId, role, next, allowed) {
      const booking = bookings.get(id);
      const owner = role === 'driver' ? booking?.driverId : booking?.customerId;
      if (!booking || owner !== actorId || !allowed.includes(booking.status)) return null;
      const updated = { ...booking, status: next };
      bookings.set(id, updated);
      return updated;
    },
    async listUnsettledPayments(ids) {
      return [...bookings.values()]
        .filter((booking) => booking.payment?.status === 'authorized' && ['completed', 'cancelled', 'expired'].includes(booking.status))
        .filter((booking) => !ids || ids.includes(booking.id))
        .map((booking) => ({ bookingId: booking.id, status: booking.status, intentId: booking.payment.intentId }));
    },
    async updatePaymentStatus(intentId, status) {
      for (const booking of bookings.values()) {
        if (booking.payment?.intentId === intentId) booking.payment = { ...booking.payment, status };
      }
    },
  };
  const auth = { async getUser(token) { const user = users[token]; return user ? { id: user.id, email: `${user.id}@example.com`, aal: 'aal2' } : null; } };
  return { app: createApp({ auth, repository, stripe }), repository, bookings, stripe, stripeCustomers };
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
  assert.deepEqual(response.body, { enabled: true, methods: [{ id: 'pm_visa', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 }] });

  const fresh = harness({ customerIds: {} });
  const none = await request(fresh.app).get('/api/payments/methods').set('authorization', 'Bearer customerToken');
  assert.deepEqual(none.body, { enabled: true, methods: [] });
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
  stripe.intents.set('pi_9', { id: 'pi_9', status: 'succeeded' });
  const updates = [];
  const payments = createPayments({
    stripe,
    repository: {
      async listUnsettledPayments() { return [{ bookingId: 'b-9', status: 'completed', intentId: 'pi_9' }]; },
      async updatePaymentStatus(intentId, status) { updates.push([intentId, status]); },
    },
  });
  assert.deepEqual(await payments.settle(), [{ bookingId: 'b-9', status: 'succeeded' }]);
  assert.deepEqual(updates, [['pi_9', 'succeeded']]);
});

test('without Stripe configured, requests work as before and nothing is held', async () => {
  const { app, bookings } = harness({ stripe: null });
  const response = await requestHelp(app, { paymentMethodId: undefined });
  assert.equal(response.status, 201);
  assert.equal(bookings.get(response.body.id).payment, undefined);
});
