const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');

function buildHarness(stripe = null, accountAdmin = null) {
  const users = {
    customerToken: { id: 'customer-1', role: 'customer', status: 'active', firstName: 'Casey', lastName: 'Customer' },
    driverToken: { id: 'driver-1', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: true },
    offlineDriverToken: { id: 'driver-3', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: false },
    pendingDriverToken: { id: 'driver-2', role: 'driver', status: 'active', verificationStatus: 'pending' },
  };

  const bookings = new Map();
  const repository = {
    async getProfile(userId) {
      return Object.values(users).find((user) => user.id === userId) || null;
    },
    async createBooking(input) {
      const booking = { id: `booking-${bookings.size + 1}`, status: 'searching', ...input };
      bookings.set(booking.id, booking);
      return booking;
    },
    async listAvailableBookings() {
      return [...bookings.values()].filter((booking) => booking.status === 'searching');
    },
    async acceptBooking(bookingId, driverId) {
      const booking = bookings.get(bookingId);
      if (!booking || booking.status !== 'searching' || booking.driverId) return null;
      const accepted = { ...booking, status: 'accepted', driverId };
      bookings.set(bookingId, accepted);
      return accepted;
    },
    async listVehicles(customerId) {
      return [{ id: 'vehicle-1', customerId, make: 'Honda', model: 'Civic', year: 2020 }];
    },
    async getVehicle(customerId, vehicleId) {
      return vehicleId === 'vehicle-1' ? { id: vehicleId, customerId } : null;
    },
    async getBooking(bookingId, userId, role) {
      const booking = bookings.get(bookingId);
      if (!booking) return null;
      return role === 'customer' && booking.customerId === userId ? booking : null;
    },
    async setPaymentIntent(bookingId, customerId, paymentIntentId) {
      const booking = bookings.get(bookingId);
      if (!booking || booking.customerId !== customerId) return null;
      const updated = { ...booking, paymentIntentId, payment: { status: 'processing' } };
      bookings.set(bookingId, updated);
      return updated;
    },
    async prepareAccountDeletion(userId) {
      return { userId, storagePaths: [] };
    },
  };

  const auth = {
    async getUser(token) {
      const user = users[token];
      return user ? { id: user.id, email: `${user.id}@example.com` } : null;
    },
  };

  return { app: createApp({ auth, repository, stripe, accountAdmin }), repository, bookings };
}

test('health endpoint is available without authentication', async () => {
  const { app } = buildHarness();
  const response = await request(app).get('/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
});

test('protected endpoints reject missing bearer tokens', async () => {
  const { app } = buildHarness();
  const response = await request(app).get('/api/vehicles');
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Authentication required');
});

test('customer can list only their vehicles', async () => {
  const { app } = buildHarness();
  const response = await request(app).get('/api/vehicles').set('Authorization', 'Bearer customerToken');
  assert.equal(response.status, 200);
  assert.equal(response.body[0].customerId, 'customer-1');
});

test('booking price is server-owned and customer identity comes from the token', async () => {
  const { app } = buildHarness();
  const response = await request(app)
    .post('/api/bookings')
    .set('Authorization', 'Bearer customerToken')
    .send({
      customerId: 'attacker-selected-id',
      serviceType: 'battery_jump',
      estimatedPrice: 1,
      location: { address: '100 Main St', lat: 32.77, lng: -96.79 },
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.customerId, 'customer-1');
  assert.equal(response.body.estimatedPrice, 69);
  assert.equal(response.body.service.id, 'battery_jump');
});

test('catalog uses the approved market prices', async () => {
  const { app } = buildHarness();
  const response = await request(app).get('/api/services');
  const prices = Object.fromEntries(response.body.map((service) => [service.id, service.basePrice]));
  assert.deepEqual(
    { ...prices, detailing: undefined, window_tinting: undefined },
    { battery_jump: 69, flat_tire: 79, towing: 95, lockout: 79, fuel_delivery: 79, ev_charging: 129, oil_change: 99, detailing: undefined, window_tinting: undefined },
  );
  const towing = response.body.find((service) => service.id === 'towing');
  assert.deepEqual(towing.pricing, { hookup: 95, includedMiles: 5, perMile: 4.5, maxMiles: 100 });
});

test('towing is priced by distance on the server, ignoring any client price', async () => {
  const { app } = buildHarness();
  const response = await request(app)
    .post('/api/bookings')
    .set('Authorization', 'Bearer customerToken')
    .send({
      serviceType: 'towing', estimatedPrice: 1,
      location: { address: 'Dallas', lat: 32.7767, lng: -96.797 },
      dropoffLocation: { address: 'Fort Worth', lat: 32.7555, lng: -97.3308 },
    });
  assert.equal(response.status, 201);
  assert.ok(response.body.estimatedPrice > 230 && response.body.estimatedPrice < 250, `got ${response.body.estimatedPrice}`);
});

test('quote endpoint returns the same price the booking will charge', async () => {
  const { app } = buildHarness();
  const body = {
    serviceType: 'towing',
    location: { address: 'Dallas', lat: 32.7767, lng: -96.797 },
    dropoffLocation: { address: 'Fort Worth', lat: 32.7555, lng: -97.3308 },
  };
  const quote = await request(app).post('/api/quotes').set('Authorization', 'Bearer customerToken').send(body);
  assert.equal(quote.status, 200);
  assert.ok(quote.body.distanceMiles > 36 && quote.body.distanceMiles < 40);
  const booking = await request(app).post('/api/bookings').set('Authorization', 'Bearer customerToken').send(body);
  assert.equal(booking.body.estimatedPrice, quote.body.price);

  const tooFar = await request(app).post('/api/quotes').set('Authorization', 'Bearer customerToken')
    .send({ ...body, dropoffLocation: { address: 'Houston', lat: 29.7604, lng: -95.3698 } });
  assert.equal(tooFar.status, 400);
  assert.match(tooFar.body.error, /longer than 100 miles/);
  const unauthenticated = await request(app).post('/api/quotes').send(body);
  assert.equal(unauthenticated.status, 401);
});

test('service catalog marks which services can be requested now', async () => {
  const { app } = buildHarness();
  const response = await request(app).get('/api/services');
  assert.equal(response.status, 200);
  const byId = Object.fromEntries(response.body.map((service) => [service.id, service]));
  assert.equal(byId.battery_jump.available, true);
  assert.equal(byId.towing.requiresDropoff, true);
  assert.equal(byId.detailing.available, false);
  assert.equal(byId.window_tinting.available, false);
});

test('services that are not offered yet cannot be booked', async () => {
  const { app } = buildHarness();
  const response = await request(app)
    .post('/api/bookings')
    .set('Authorization', 'Bearer customerToken')
    .send({ serviceType: 'detailing', location: { address: '100 Main St', lat: 32.77, lng: -96.79 } });
  assert.equal(response.status, 409);
  assert.match(response.body.error, /not available yet/i);
});

test('towing requires a drop-off location and stores it cleaned', async () => {
  const { app } = buildHarness();
  const missing = await request(app)
    .post('/api/bookings')
    .set('Authorization', 'Bearer customerToken')
    .send({ serviceType: 'towing', location: { address: '100 Main St', lat: 32.77, lng: -96.79 } });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /drop-off/i);

  const ok = await request(app)
    .post('/api/bookings')
    .set('Authorization', 'Bearer customerToken')
    .send({
      serviceType: 'towing',
      location: { address: '100 Main St', lat: 32.77, lng: -96.79 },
      dropoffLocation: { address: `  Joe's Garage ${'x'.repeat(400)}`, lat: 32.8, lng: -96.81, extra: 'ignored' },
    });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.dropoffLocation.address.length, 300);
  assert.ok(ok.body.dropoffLocation.address.startsWith("Joe's Garage"));
  assert.equal(ok.body.dropoffLocation.extra, undefined);
});

test('booking cannot reference a vehicle owned by another customer', async () => {
  const { app } = buildHarness();
  const response = await request(app)
    .post('/api/bookings')
    .set('Authorization', 'Bearer customerToken')
    .send({
      serviceType: 'battery_jump',
      vehicleId: 'other-customer-vehicle',
      location: { address: '100 Main St', lat: 32.77, lng: -96.79 },
    });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Vehicle is not available for this customer');
});

test('drivers cannot create customer bookings', async () => {
  const { app } = buildHarness();
  const response = await request(app)
    .post('/api/bookings')
    .set('Authorization', 'Bearer driverToken')
    .send({ serviceType: 'battery_jump', location: { address: '100 Main St', lat: 32.77, lng: -96.79 } });
  assert.equal(response.status, 403);
});

test('unverified drivers cannot view dispatch requests', async () => {
  const { app } = buildHarness();
  const response = await request(app)
    .get('/api/drivers/requests')
    .set('Authorization', 'Bearer pendingDriverToken');
  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'Verified driver account required');
});

test('verified offline drivers cannot view or accept dispatch requests', async () => {
  const { app, bookings } = buildHarness();
  bookings.set('available-1', { id: 'available-1', status: 'searching', customerId: 'customer-1' });

  const list = await request(app).get('/api/drivers/requests').set('Authorization', 'Bearer offlineDriverToken');
  const accept = await request(app).post('/api/bookings/available-1/accept').set('Authorization', 'Bearer offlineDriverToken');

  assert.equal(list.status, 403);
  assert.equal(accept.status, 403);
  assert.equal(list.body.error, 'Driver must be online to receive requests');
});

test('unverified drivers cannot change an assigned booking status', async () => {
  const { app, bookings } = buildHarness();
  bookings.set('assigned-1', { id: 'assigned-1', status: 'accepted', driverId: 'driver-2', customerId: 'customer-1' });
  const response = await request(app)
    .patch('/api/bookings/assigned-1/status')
    .set('Authorization', 'Bearer pendingDriverToken')
    .send({ status: 'en_route' });
  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'Verified driver account required');
});

test('booking acceptance is atomic', async () => {
  const { app } = buildHarness();
  const created = await request(app)
    .post('/api/bookings')
    .set('Authorization', 'Bearer customerToken')
    .send({ serviceType: 'towing', location: { address: '100 Main St', lat: 32.77, lng: -96.79 }, dropoffLocation: { address: '200 Garage Rd', lat: 32.8, lng: -96.8 } });

  const first = await request(app)
    .post(`/api/bookings/${created.body.id}/accept`)
    .set('Authorization', 'Bearer driverToken');
  const second = await request(app)
    .post(`/api/bookings/${created.body.id}/accept`)
    .set('Authorization', 'Bearer driverToken');

  assert.equal(first.status, 200);
  assert.equal(first.body.driverId, 'driver-1');
  assert.equal(second.status, 409);
});

test('payment intent amount and customer identity come from the owned booking', async () => {
  let stripeRequest;
  const stripe = {
    paymentIntents: {
      async create(input, options) {
        stripeRequest = { input, options };
        return { id: 'pi_test_1', client_secret: 'pi_test_1_secret', amount: input.amount, currency: input.currency, status: 'requires_payment_method' };
      },
    },
  };
  const { app, bookings } = buildHarness(stripe);
  bookings.set('booking-paid', { id: 'booking-paid', customerId: 'customer-1', estimatedPrice: 125, status: 'completed' });

  const response = await request(app)
    .post('/api/payments/create-intent')
    .set('Authorization', 'Bearer customerToken')
    .send({ bookingId: 'booking-paid', amount: 1, customerId: 'attacker-selected-id' });

  assert.equal(response.status, 200);
  assert.equal(response.body.amount, 12500);
  assert.equal(stripeRequest.input.amount, 12500);
  assert.equal(stripeRequest.input.metadata.customerId, 'customer-1');
  assert.equal(stripeRequest.options.idempotencyKey, 'booking-booking-paid');
  assert.equal(bookings.get('booking-paid').paymentIntentId, 'pi_test_1');
});

test('customer cannot create a payment intent for another customer booking', async () => {
  const stripe = { paymentIntents: { async create() { throw new Error('Stripe must not be called'); } } };
  const { app, bookings } = buildHarness(stripe);
  bookings.set('booking-other', { id: 'booking-other', customerId: 'customer-2', estimatedPrice: 65, status: 'completed' });

  const response = await request(app)
    .post('/api/payments/create-intent')
    .set('Authorization', 'Bearer customerToken')
    .send({ bookingId: 'booking-other' });

  assert.equal(response.status, 404);
});

test('payment intent creation requires a completed booking', async () => {
  const stripe = { paymentIntents: { async create() { throw new Error('Stripe must not be called'); } } };
  const { app, bookings } = buildHarness(stripe);
  bookings.set('booking-active', { id: 'booking-active', customerId: 'customer-1', estimatedPrice: 65, status: 'searching' });

  const response = await request(app)
    .post('/api/payments/create-intent')
    .set('Authorization', 'Bearer customerToken')
    .send({ bookingId: 'booking-active' });

  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'Booking must be completed before payment');
});

test('failed payment retries use a new idempotency key derived from the previous intent', async () => {
  let options;
  const stripe = {
    paymentIntents: {
      async create(_input, requestOptions) {
        options = requestOptions;
        return { id: 'pi_retry', client_secret: 'pi_retry_secret', amount: 12500, currency: 'usd', status: 'requires_payment_method' };
      },
    },
  };
  const { app, bookings } = buildHarness(stripe);
  bookings.set('booking-retry', {
    id: 'booking-retry', customerId: 'customer-1', estimatedPrice: 125, status: 'completed',
    payment: { intentId: 'pi_failed', status: 'failed' },
  });

  const response = await request(app)
    .post('/api/payments/create-intent')
    .set('Authorization', 'Bearer customerToken')
    .send({ bookingId: 'booking-retry' });

  assert.equal(response.status, 200);
  assert.equal(options.idempotencyKey, 'booking-booking-retry-retry-pi_failed');
});

test('authenticated users can permanently delete their own account', async () => {
  const deletedUsers = [];
  const accountAdmin = { async deleteUser(userId) { deletedUsers.push(userId); } };
  const { app } = buildHarness(null, accountAdmin);

  const response = await request(app)
    .delete('/api/me')
    .set('Authorization', 'Bearer customerToken');

  assert.equal(response.status, 204);
  assert.deepEqual(deletedUsers, ['customer-1']);
});

test('account deletion fails safely when identity deletion is unavailable', async () => {
  const { app } = buildHarness();
  const response = await request(app)
    .delete('/api/me')
    .set('Authorization', 'Bearer customerToken');

  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'Account deletion is not configured');
});
