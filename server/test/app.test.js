const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');

function buildHarness(stripe = null, accountAdmin = null) {
  const users = {
    customerToken: { id: 'customer-1', role: 'customer', status: 'active', firstName: 'Casey', lastName: 'Customer' },
    otherCustomerToken: { id: 'customer-2', role: 'customer', status: 'active', firstName: 'Olive', lastName: 'Other' },
    adminToken: { id: 'admin-1', role: 'admin', status: 'active', firstName: 'Ada', lastName: 'Admin' },
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
      if (role === 'customer') return booking.customerId === userId ? booking : null;
      if (role === 'driver') return booking.driverId === userId ? booking : null;
      return null;
    },
    async getActiveBooking(userId, role) {
      const column = role === 'driver' ? 'driverId' : 'customerId';
      return [...bookings.values()].find((booking) => booking[column] === userId &&
        ['pending', 'searching', 'accepted', 'en_route', 'arrived', 'in_progress'].includes(booking.status)) || null;
    },
    // Mirrors the SQL compare-and-set: ownership + expected current status, plus an audit event.
    async updateBookingStatus(bookingId, actorId, role, nextStatus, allowedCurrent, { reason = null } = {}) {
      const booking = bookings.get(bookingId);
      const owner = role === 'customer' ? booking?.customerId : booking?.driverId;
      if (!booking || owner !== actorId || !allowedCurrent.includes(booking.status)) return null;
      this.events.push({ bookingId, actorId, from: booking.status, to: nextStatus, reason, at: new Date() });
      const updated = { ...booking, status: nextStatus, ...(nextStatus === 'cancelled' ? { cancelledBy: role } : {}) };
      bookings.set(bookingId, updated);
      return updated;
    },
    events: [],
    async reportBookingIssue(bookingId, actorId, issue) {
      this.issues.push({ bookingId, actorId, ...issue });
      return { id: String(this.issues.length), bookingId, category: issue.category, status: issue.status };
    },
    issues: [],
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
    async updateDriverVehicle(driverId, vehicle) {
      this.savedDriverVehicle = { driverId, ...vehicle };
      return vehicle;
    },
    async updateDriverLocation(bookingId, driverId, location) {
      this.savedDriverLocation = { bookingId, driverId, location };
      return { id: bookingId, driverId, status: 'en_route', driverLocation: location };
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

test('drivers save their service vehicle with cleaned fields', async () => {
  const { app, repository } = buildHarness();
  const bad = await request(app).patch('/api/drivers/me/vehicle').set('Authorization', 'Bearer driverToken').send({ make: '', model: 'F-550' });
  assert.equal(bad.status, 400);
  const ok = await request(app).patch('/api/drivers/me/vehicle').set('Authorization', 'Bearer pendingDriverToken')
    .send({ make: '  Ford ', model: 'F-550 Flatbed', color: 'White', plate: ' tow-77 ', extra: 'x' });
  assert.equal(ok.status, 200);
  assert.deepEqual(repository.savedDriverVehicle, { driverId: 'driver-2', make: 'Ford', model: 'F-550 Flatbed', color: 'White', plate: 'TOW-77' });
  const customer = await request(app).patch('/api/drivers/me/vehicle').set('Authorization', 'Bearer customerToken').send({ make: 'Ford', model: 'F-550' });
  assert.equal(customer.status, 403);
});

test('driver location must be real coordinates', async () => {
  const { app, repository } = buildHarness();
  const bad = await request(app).patch('/api/bookings/booking-1/driver-location').set('Authorization', 'Bearer driverToken').send({ location: { lat: 200, lng: -97 } });
  assert.equal(bad.status, 400);
  const ok = await request(app).patch('/api/bookings/booking-1/driver-location').set('Authorization', 'Bearer driverToken').send({ location: { lat: 33.1, lng: -97.0, accuracy: 12 } });
  assert.equal(ok.status, 200);
  assert.deepEqual(repository.savedDriverLocation.location, { lat: 33.1, lng: -97.0 });
});

// ── B10 job lifecycle ──────────────────────────────────────────────────────────────────────
const job = (status, extra = {}) => ({ id: 'job-1', status, customerId: 'customer-1', driverId: 'driver-1', ...extra });
const setStatus = (app, token, body, id = 'job-1') => request(app).patch(`/api/bookings/${id}/status`).set('Authorization', `Bearer ${token}`).send(body);

test('driver moves a job through every step in order, with one audit event per change', async () => {
  const { app, bookings, repository } = buildHarness();
  bookings.set('job-1', job('accepted'));
  for (const status of ['en_route', 'arrived', 'in_progress', 'completed']) {
    const response = await setStatus(app, 'driverToken', { status });
    assert.equal(response.status, 200, `to ${status}`);
    assert.equal(response.body.status, status);
  }
  assert.deepEqual(repository.events.map((event) => `${event.from}→${event.to}`), ['accepted→en_route', 'en_route→arrived', 'arrived→in_progress', 'in_progress→completed']);
  assert.ok(repository.events.every((event) => event.actorId === 'driver-1' && event.at instanceof Date));
});

test('out-of-order and repeated steps are rejected with the current status', async () => {
  const cases = [
    ['accepted', 'arrived'], ['accepted', 'in_progress'], ['accepted', 'completed'], ['en_route', 'completed'],
    ['en_route', 'en_route'], ['arrived', 'en_route'], ['in_progress', 'arrived'], ['completed', 'in_progress'],
    ['cancelled', 'en_route'], ['searching', 'en_route'],
  ];
  for (const [from, to] of cases) {
    const { app, bookings, repository } = buildHarness();
    bookings.set('job-1', job(from));
    const response = await setStatus(app, 'driverToken', { status: to });
    assert.equal(response.status, 409, `${from} → ${to}`);
    assert.equal(response.body.currentStatus, from);
    assert.equal(bookings.get('job-1').status, from, 'booking unchanged');
    assert.equal(repository.events.length, 0);
  }
});

test('statuses no party may set directly are rejected', async () => {
  const { app, bookings } = buildHarness();
  bookings.set('job-1', job('accepted'));
  for (const status of ['searching', 'pending', 'accepted', 'bogus', undefined]) {
    assert.equal((await setStatus(app, 'driverToken', { status })).status, 400, `driver → ${status}`);
  }
  for (const status of ['en_route', 'arrived', 'in_progress', 'completed', 'searching']) {
    assert.equal((await setStatus(app, 'customerToken', { status })).status, 400, `customer → ${status}`);
  }
  assert.equal(bookings.get('job-1').status, 'accepted');
});

test('only the assigned driver and the booking\'s own customer can change a job', async () => {
  const { app, bookings, repository } = buildHarness();
  bookings.set('job-1', job('accepted'));
  const otherDriver = await setStatus(app, 'offlineDriverToken', { status: 'en_route' });
  assert.equal(otherDriver.status, 404);
  const otherCustomer = await setStatus(app, 'otherCustomerToken', { status: 'cancelled' });
  assert.equal(otherCustomer.status, 404);
  const admin = await setStatus(app, 'adminToken', { status: 'cancelled' });
  assert.equal(admin.status, 403);
  assert.equal(otherDriver.body.booking, undefined, 'no booking details leak to other parties');
  assert.equal(bookings.get('job-1').status, 'accepted');
  assert.equal(repository.events.length, 0);
});

test('customer can cancel until the driver arrives, then not at all', async () => {
  for (const status of ['searching', 'accepted', 'en_route']) {
    const { app, bookings, repository } = buildHarness();
    bookings.set('job-1', job(status, status === 'searching' ? { driverId: undefined } : {}));
    const response = await setStatus(app, 'customerToken', { status: 'cancelled', reason: 'found_other_help' });
    assert.equal(response.status, 200, `cancel from ${status}`);
    assert.equal(response.body.cancelledBy, 'customer');
    assert.equal(repository.events[0].reason, 'found_other_help');
  }
  for (const status of ['arrived', 'in_progress', 'completed']) {
    const { app, bookings } = buildHarness();
    bookings.set('job-1', job(status));
    const response = await setStatus(app, 'customerToken', { status: 'cancelled' });
    assert.equal(response.status, 409, `no cancel from ${status}`);
    assert.equal(bookings.get('job-1').status, status);
  }
  const { app, bookings } = buildHarness();
  bookings.set('job-1', job('arrived'));
  assert.match((await setStatus(app, 'customerToken', { status: 'cancelled' })).body.error, /already arrived/);
});

test('driver must give a reason to cancel, and can only cancel before service starts', async () => {
  const { app, bookings, repository } = buildHarness();
  bookings.set('job-1', job('arrived'));
  assert.equal((await setStatus(app, 'driverToken', { status: 'cancelled' })).status, 400);
  assert.equal((await setStatus(app, 'driverToken', { status: 'cancelled', reason: 'made_up' })).status, 400);
  const ok = await setStatus(app, 'driverToken', { status: 'cancelled', reason: 'cannot_reach_customer' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.cancelledBy, 'driver');
  assert.deepEqual(repository.events.map((event) => [event.from, event.to, event.reason]), [['arrived', 'cancelled', 'cannot_reach_customer']]);

  for (const status of ['in_progress', 'completed']) {
    const harness = buildHarness();
    harness.bookings.set('job-1', job(status));
    const response = await setStatus(harness.app, 'driverToken', { status: 'cancelled', reason: 'other' });
    assert.equal(response.status, 409, `no driver cancel from ${status}`);
    if (status === 'in_progress') assert.match(response.body.error, /complete it or report an issue/i);
  }
});

test('a cancelled job frees the driver: one job at a time, and they can accept again after a cancel', async () => {
  const { app, bookings } = buildHarness();
  bookings.set('job-1', job('en_route'));
  bookings.set('job-2', { id: 'job-2', status: 'searching', customerId: 'customer-2' });
  assert.equal((await request(app).post('/api/bookings/job-2/accept').set('Authorization', 'Bearer driverToken')).status, 409, 'busy driver cannot take a second job');
  assert.match((await request(app).post('/api/bookings/job-2/accept').set('Authorization', 'Bearer driverToken')).body.error, /current job/);
  assert.equal((await setStatus(app, 'customerToken', { status: 'cancelled' })).status, 200);
  const accept = await request(app).post('/api/bookings/job-2/accept').set('Authorization', 'Bearer driverToken');
  assert.equal(accept.status, 200);
});

test('a concurrent change turns into a 409 with the latest booking instead of skipping a step', async () => {
  const { app, bookings, repository } = buildHarness();
  bookings.set('job-1', job('en_route'));
  const original = repository.updateBookingStatus.bind(repository);
  repository.updateBookingStatus = async (...args) => {
    bookings.set('job-1', job('cancelled', { cancelledBy: 'customer' })); // customer cancelled a moment earlier
    return original(...args);
  };
  const response = await setStatus(app, 'driverToken', { status: 'arrived' });
  assert.equal(response.status, 409);
  assert.equal(response.body.currentStatus, 'cancelled');
  assert.equal(response.body.booking.cancelledBy, 'customer');
});

test('either party can report an issue on an active job, including after service starts', async () => {
  const { app, bookings, repository } = buildHarness();
  bookings.set('job-1', job('in_progress'));
  const driver = await request(app).post('/api/bookings/job-1/issues').set('Authorization', 'Bearer driverToken').send({ category: 'vehicle_damage', details: ' Bumper was already cracked ' });
  assert.equal(driver.status, 201);
  assert.deepEqual(repository.issues[0], { bookingId: 'job-1', actorId: 'driver-1', role: 'driver', category: 'vehicle_damage', details: 'Bumper was already cracked', status: 'in_progress' });
  const customer = await request(app).post('/api/bookings/job-1/issues').set('Authorization', 'Bearer customerToken').send({ category: 'safety' });
  assert.equal(customer.status, 201);
  assert.equal((await request(app).post('/api/bookings/job-1/issues').set('Authorization', 'Bearer customerToken').send({ category: 'nope' })).status, 400);
  assert.equal((await request(app).post('/api/bookings/job-1/issues').set('Authorization', 'Bearer customerToken').send({ category: 'other' })).status, 400, 'other needs details');
  assert.equal((await request(app).post('/api/bookings/job-1/issues').set('Authorization', 'Bearer otherCustomerToken').send({ category: 'safety' })).status, 404);
  bookings.set('job-1', job('completed'));
  assert.equal((await request(app).post('/api/bookings/job-1/issues').set('Authorization', 'Bearer driverToken').send({ category: 'safety' })).status, 409);
});
