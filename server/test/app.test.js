const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');

const TOW_TRUCK = Object.freeze({ make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed' });
const WHEEL_LIFT = Object.freeze({ ...TOW_TRUCK, model: 'F-450', plate: 'LIFT-1', equipmentType: 'wheel_lift' });
const SERVICE_VAN = Object.freeze({ ...TOW_TRUCK, model: 'Transit', plate: 'VAN-1', equipmentType: 'light_duty' });
const serviceOf = (booking) => booking.service?.id || booking.serviceType;
const DALLAS = Object.freeze({ lat: 32.7767, lng: -96.797 });
const pickupOf = (booking) => (booking.location ? { lat: booking.location.lat, lng: booking.location.lng } : DALLAS);
const ACTIVE = ['pending', 'searching', 'accepted', 'en_route', 'arrived', 'in_progress'];
const fitsCapability = (booking, capability) => Boolean(capability) && capability.serviceTypes.includes(serviceOf(booking)) &&
  (capability.electricTowing || serviceOf(booking) !== 'towing' || !booking.vehicleIsElectric);

function buildHarness(stripe = null, accountAdmin = null) {
  const users = {
    customerToken: { id: 'customer-1', role: 'customer', status: 'active', firstName: 'Casey', lastName: 'Customer' },
    otherCustomerToken: { id: 'customer-2', role: 'customer', status: 'active', firstName: 'Olive', lastName: 'Other' },
    adminToken: { id: 'admin-1', role: 'admin', status: 'active', firstName: 'Ada', lastName: 'Admin' },
    driverToken: { id: 'driver-1', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: true, driverVehicle: TOW_TRUCK },
    wheelLiftDriverToken: { id: 'driver-6', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: true, driverVehicle: WHEEL_LIFT },
    lightDutyDriverToken: { id: 'driver-7', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: true, driverVehicle: SERVICE_VAN },
    offlineDriverToken: { id: 'driver-3', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: false, driverVehicle: TOW_TRUCK },
    // Verified and current, but no vehicle on file yet (new driver) / a vehicle saved before D5 (no equipment).
    noVehicleDriverToken: { id: 'driver-4', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: false, driverVehicle: null },
    legacyVehicleDriverToken: { id: 'driver-5', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: true,
      driverVehicle: { make: 'Ford', model: 'F-550', year: null, color: 'White', plate: 'TOW-77', plateState: '', equipmentType: '' } },
    pendingDriverToken: { id: 'driver-2', role: 'driver', status: 'active', verificationStatus: 'pending' },
  };

  const bookings = new Map();
  const repository = {
    async getProfile(userId) {
      return Object.values(users).find((user) => user.id === userId) || null;
    },
    // Mirrors the partial unique index: a second active booking for the same customer is refused.
    async createBooking(input) {
      if ([...bookings.values()].some((item) => item.customerId === input.customerId && ACTIVE.includes(item.status))) {
        throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: 'active_request_exists' });
      }
      const booking = { id: `booking-${bookings.size + 1}`, status: 'searching', createdAt: new Date(this.clock()), ...input };
      bookings.set(booking.id, booking);
      return booking;
    },
    // E4 mirror of the SQL sweep. Fixtures without createdAt / lastDriverActivityAt never go stale.
    requestExpiryMinutes: 15,
    staleJobMinutes: 60,
    clock: () => Date.now(),
    expireCalls: [],
    isOverdue(booking) {
      return Boolean(booking.createdAt) && this.clock() - new Date(booking.createdAt).getTime() >= this.requestExpiryMinutes * 60000;
    },
    async expireStaleBookings(scope = {}) {
      this.expireCalls.push(scope);
      const result = { expired: [], released: [] };
      for (const booking of [...bookings.values()]) {
        if ((scope.customerId && booking.customerId !== scope.customerId) || (scope.driverId && booking.driverId !== scope.driverId) ||
          (scope.bookingId && booking.id !== scope.bookingId)) continue;
        if (['pending', 'searching'].includes(booking.status) && this.isOverdue(booking)) {
          bookings.set(booking.id, { ...booking, status: 'expired', endReason: 'no_driver_found' });
          this.events.push({ bookingId: booking.id, actorId: null, from: booking.status, to: 'expired', role: 'system', reason: 'no_driver_found' });
          result.expired.push(booking.id);
        } else if (['accepted', 'en_route'].includes(booking.status) && booking.driverId && booking.lastDriverActivityAt &&
          this.clock() - new Date(booking.lastDriverActivityAt).getTime() >= this.staleJobMinutes * 60000) {
          bookings.set(booking.id, { ...booking, status: 'cancelled', cancelledBy: 'system', endReason: 'driver_unresponsive' });
          this.events.push({ bookingId: booking.id, actorId: null, from: booking.status, to: 'cancelled', role: 'system', reason: 'driver_unresponsive' });
          result.released.push(booking.id);
        }
      }
      return result;
    },
    async getBookingStatus(bookingId) {
      return bookings.get(bookingId)?.status ?? null;
    },
    // Mirrors the SQL filter: allowed service types, electric tows only with electricTowing, inside the
    // driver's lat/lng box; returns the exact pickup for the API's distance check. No area → nothing.
    async listAvailableBookings(capability, area) {
      this.listedWith = capability;
      this.listedArea = area;
      if (!area) return [];
      return [...bookings.values()]
        .filter((booking) => booking.status === 'searching' && !booking.driverId && !this.isOverdue(booking) && fitsCapability(booking, capability))
        .map((booking) => ({ ...booking, pickup: pickupOf(booking) }))
        .filter(({ pickup }) => pickup.lat >= area.minLat && pickup.lat <= area.maxLat && pickup.lng >= area.minLng && pickup.lng <= area.maxLng);
    },
    async getAvailableBooking(bookingId) {
      const booking = bookings.get(bookingId);
      if (!booking || booking.status !== 'searching' || booking.driverId || this.isOverdue(booking)) return null;
      return { id: booking.id, serviceType: serviceOf(booking), vehicleIsElectric: Boolean(booking.vehicleIsElectric), pickup: pickupOf(booking) };
    },
    // Online drivers start with a fresh position in downtown Dallas (tests move or clear it).
    positions: new Map(Object.values(users).filter((user) => user.isOnline).map((user) => [user.id, { ...DALLAS, at: new Date() }])),
    async getDriverPosition(driverId, maxAgeMinutes) {
      const position = this.positions.get(driverId);
      return position && Date.now() - position.at.getTime() <= maxAgeMinutes * 60000 ? position : null;
    },
    async updateDriverPosition(driverId, position) {
      this.positions.set(driverId, { ...position, at: new Date() });
    },
    async acceptBooking(bookingId, driverId, capability) {
      const booking = bookings.get(bookingId);
      if (!booking || booking.status !== 'searching' || booking.driverId || this.isOverdue(booking) || !fitsCapability(booking, capability)) return null;
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
    async updateDriverOnlineStatus(driverId, isOnline) {
      this.onlineChanges.push({ driverId, isOnline });
      return { profile_id: driverId, is_online: isOnline };
    },
    onlineChanges: [],
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
  bookings.set('available-1', { id: 'available-1', status: 'searching', customerId: 'customer-1', serviceType: 'battery_jump' });

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
  assert.equal(bad.body.field, 'make');
  // Pending drivers can add their vehicle during onboarding, before they are verified.
  const ok = await request(app).patch('/api/drivers/me/vehicle').set('Authorization', 'Bearer pendingDriverToken')
    .send({ make: '  Ford ', model: 'F-550 Flatbed', year: 2021, color: 'White', plate: ' tow-77 ', plateState: 'tx', equipmentType: 'flatbed', extra: 'x' });
  assert.equal(ok.status, 200);
  assert.deepEqual(repository.savedDriverVehicle, {
    driverId: 'driver-2', make: 'Ford', model: 'F-550 Flatbed', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed',
  });
  const customer = await request(app).patch('/api/drivers/me/vehicle').set('Authorization', 'Bearer customerToken').send({ make: 'Ford', model: 'F-550' });
  assert.equal(customer.status, 403);
});

test('driver vehicle validation names the field that needs fixing', async () => {
  const { app, repository } = buildHarness();
  const valid = { make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'wheel_lift' };
  const cases = [
    [{ year: 1975 }, 'year'], [{ year: 2999 }, 'year'], [{ year: '20x1' }, 'year'], [{ year: undefined }, 'year'],
    [{ color: ' ' }, 'color'], [{ plate: '' }, 'plate'], [{ plate: 'A' }, 'plate'], [{ plate: 'TOO-LONG-PLATE' }, 'plate'], [{ plate: 'AB#12' }, 'plate'],
    [{ plateState: 'ZZ' }, 'plateState'], [{ plateState: '' }, 'plateState'], [{ equipmentType: 'helicopter' }, 'equipmentType'], [{ equipmentType: undefined }, 'equipmentType'],
  ];
  for (const [patch, field] of cases) {
    const response = await request(app).patch('/api/drivers/me/vehicle').set('Authorization', 'Bearer driverToken').send({ ...valid, ...patch });
    assert.equal(response.status, 400, JSON.stringify(patch));
    assert.equal(response.body.field, field, JSON.stringify(patch));
    assert.ok(response.body.error);
  }
  assert.equal(repository.savedDriverVehicle, undefined, 'nothing is saved when validation fails');
  // A 4-digit year sent as text is accepted (form inputs), as are spaced plates.
  const ok = await request(app).patch('/api/drivers/me/vehicle').set('Authorization', 'Bearer driverToken').send({ ...valid, year: '2021', plate: 'abc 1234' });
  assert.equal(ok.status, 200);
  assert.equal(repository.savedDriverVehicle.year, 2021);
  assert.equal(repository.savedDriverVehicle.plate, 'ABC 1234');
});

test('drivers without complete vehicle details cannot go online, see or accept work — but can always go offline', async () => {
  const { app, bookings, repository } = buildHarness();
  bookings.set('open-1', { id: 'open-1', status: 'searching', customerId: 'customer-1', serviceType: 'battery_jump' });
  const online = await request(app).patch('/api/drivers/me/online').set('Authorization', 'Bearer noVehicleDriverToken').send({ isOnline: true });
  assert.equal(online.status, 403);
  assert.equal(online.body.code, 'vehicle_required');
  assert.match(online.body.error, /vehicle/i);
  // A driver whose vehicle predates equipment types (already online) is held back too.
  for (const token of ['noVehicleDriverToken', 'legacyVehicleDriverToken']) {
    const list = await request(app).get('/api/drivers/requests').set('Authorization', `Bearer ${token}`);
    const accept = await request(app).post('/api/bookings/open-1/accept').set('Authorization', `Bearer ${token}`);
    assert.equal(list.body.code, 'vehicle_required', token);
    assert.equal(accept.status, 403, token);
    assert.equal(accept.body.code, 'vehicle_required', token);
  }
  assert.equal(bookings.get('open-1').status, 'searching');
  for (const token of ['noVehicleDriverToken', 'legacyVehicleDriverToken']) {
    const offline = await request(app).patch('/api/drivers/me/online').set('Authorization', `Bearer ${token}`).send({ isOnline: false });
    assert.equal(offline.status, 200, token);
  }
  const ready = await request(app).patch('/api/drivers/me/online').set('Authorization', 'Bearer offlineDriverToken').send({ isOnline: true });
  assert.equal(ready.status, 200);
  assert.deepEqual(repository.onlineChanges, [
    { driverId: 'driver-4', isOnline: false }, { driverId: 'driver-5', isOnline: false }, { driverId: 'driver-3', isOnline: true },
  ]);
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
  bookings.set('job-2', { id: 'job-2', status: 'searching', customerId: 'customer-2', serviceType: 'battery_jump' });
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

// D5 follow-up: a driver only sees and can accept work their equipment can perform.
function seedEquipmentJobs(bookings) {
  const open = (id, serviceType, extra = {}) => bookings.set(id, { id, status: 'searching', customerId: 'customer-1', serviceType, ...extra });
  open('tow-gas', 'towing');
  open('tow-ev', 'towing', { vehicleIsElectric: true });
  open('jump', 'battery_jump');
  open('tire', 'flat_tire');
  open('charge', 'ev_charging', { vehicleIsElectric: true });
  open('detail', 'detailing'); // scheduled service, not offered at launch: no equipment takes it
}

test('each equipment type only sees the requests it can perform', async () => {
  const expected = {
    driverToken: ['tow-gas', 'tow-ev', 'jump', 'tire', 'charge'], // flatbed
    wheelLiftDriverToken: ['tow-gas', 'jump', 'tire', 'charge'], // wheel-lift: no electric tows
    lightDutyDriverToken: ['jump', 'tire', 'charge'], // light-duty: no towing at all
  };
  for (const [token, ids] of Object.entries(expected)) {
    const { app, bookings, repository } = buildHarness();
    seedEquipmentJobs(bookings);
    const list = await request(app).get('/api/drivers/requests').set('Authorization', `Bearer ${token}`);
    assert.equal(list.status, 200, token);
    assert.deepEqual(list.body.requests.map((job) => job.id), ids, token);
    assert.ok(repository.listedWith.serviceTypes.length > 0, `${token} filters by a capability`);
  }
});

test('accepting a request the equipment cannot perform is refused with a clear message', async () => {
  const refused = [
    ['lightDutyDriverToken', 'tow-gas', /Towing needs a flatbed or wheel-lift tow truck\. Your light-duty service vehicle can't take this job\./],
    ['lightDutyDriverToken', 'tow-ev', /Towing needs a flatbed or wheel-lift tow truck/],
    ['wheelLiftDriverToken', 'tow-ev', /electric vehicle, so it has to go on a flatbed\. Your wheel-lift tow truck can't take this job\./],
    ['driverToken', 'detail', /Your flatbed \/ rollback can't take this job\./],
  ];
  for (const [token, id, message] of refused) {
    const { app, bookings } = buildHarness();
    seedEquipmentJobs(bookings);
    const accept = await request(app).post(`/api/bookings/${id}/accept`).set('Authorization', `Bearer ${token}`);
    assert.equal(accept.status, 403, `${token} ${id}`);
    assert.equal(accept.body.code, 'equipment_mismatch', `${token} ${id}`);
    assert.match(accept.body.error, message, `${token} ${id}`);
    assert.equal(bookings.get(id).status, 'searching', 'the request stays open for a driver who can do it');
    assert.equal(bookings.get(id).driverId, undefined);
  }
  const allowed = [
    ['driverToken', 'tow-ev'], ['driverToken', 'tow-gas'], ['wheelLiftDriverToken', 'tow-gas'],
    ['lightDutyDriverToken', 'jump'], ['lightDutyDriverToken', 'charge'], ['wheelLiftDriverToken', 'tire'],
  ];
  for (const [token, id] of allowed) {
    const { app, bookings } = buildHarness();
    seedEquipmentJobs(bookings);
    const accept = await request(app).post(`/api/bookings/${id}/accept`).set('Authorization', `Bearer ${token}`);
    assert.equal(accept.status, 200, `${token} ${id}`);
    assert.equal(accept.body.status, 'accepted');
  }
});

test('accepting a request that is gone still says it is no longer available', async () => {
  const { app } = buildHarness();
  const accept = await request(app).post('/api/bookings/missing/accept').set('Authorization', 'Bearer lightDutyDriverToken');
  assert.equal(accept.status, 409);
  assert.equal(accept.body.error, 'Booking is no longer available');
});

test('service catalog lists which equipment can perform each service', async () => {
  const { app } = buildHarness();
  const response = await request(app).get('/api/services');
  const byId = Object.fromEntries(response.body.map((service) => [service.id, service.equipmentTypes]));
  assert.deepEqual(byId.towing, ['flatbed', 'wheel_lift']);
  for (const id of ['battery_jump', 'flat_tire', 'lockout', 'fuel_delivery', 'ev_charging', 'oil_change']) {
    assert.deepEqual(byId[id], ['flatbed', 'wheel_lift', 'light_duty'], id);
  }
  assert.deepEqual(byId.detailing, []);
  assert.deepEqual(byId.window_tinting, []);
});

// B8: drivers only see open requests near where they are now, nearest first, with the distance.
const at = (dLat, dLng = 0) => ({ address: 'x', lat: DALLAS.lat + dLat, lng: DALLAS.lng + dLng });
function seedNearbyJobs(bookings) {
  const open = (id, serviceType, location, extra = {}) => bookings.set(id, { id, status: 'searching', customerId: 'customer-1', serviceType, location, createdAt: new Date(), ...extra });
  open('mid', 'battery_jump', at(0.1)); // ≈ 8.6 road mi
  open('far', 'battery_jump', at(1)); // ≈ 86 road mi
  open('near', 'flat_tire', at(0.05)); // ≈ 4.3 road mi
  open('edge-out', 'lockout', at(0.3)); // inside the lat/lng box, but ≈ 25.9 road mi
  open('near-tow', 'towing', at(0.02)); // ≈ 1.7 road mi
}

test('request list: only requests within the radius, nearest first, with distance in miles', async () => {
  const { app, bookings } = buildHarness();
  seedNearbyJobs(bookings);
  const list = await request(app).get('/api/drivers/requests').set('Authorization', 'Bearer driverToken');
  assert.equal(list.status, 200);
  assert.equal(list.body.status, 'ok');
  assert.equal(list.body.radiusMiles, 25);
  assert.deepEqual(list.body.requests.map((job) => job.id), ['near-tow', 'near', 'mid']);
  assert.deepEqual(list.body.requests.map((job) => job.distanceMiles), [1.7, 4.3, 8.6]);
  assert.ok(list.body.requests.every((job) => job.pickup === undefined), 'exact pickup is never sent with the list');
});

test('request list: equipment and distance filters combine', async () => {
  const { app, bookings } = buildHarness();
  seedNearbyJobs(bookings);
  const list = await request(app).get('/api/drivers/requests').set('Authorization', 'Bearer lightDutyDriverToken');
  assert.deepEqual(list.body.requests.map((job) => job.id), ['near', 'mid'], 'no tow for light duty, nothing beyond the radius');
});

test('request list: the position the app sends is used and remembered; the radius is configurable', async () => {
  const { app, bookings, repository } = buildHarness();
  seedNearbyJobs(bookings);
  const fromFar = await request(app).get('/api/drivers/requests').query({ lat: DALLAS.lat + 1, lng: DALLAS.lng }).set('Authorization', 'Bearer driverToken');
  assert.deepEqual(fromFar.body.requests.map((job) => [job.id, job.distanceMiles]), [['far', 0]]);
  assert.equal(repository.positions.get('driver-1').lat, DALLAS.lat + 1);
  const again = await request(app).get('/api/drivers/requests').set('Authorization', 'Bearer driverToken');
  assert.deepEqual(again.body.requests.map((job) => job.id), ['far'], 'stored position is used without query');

  const { createApp: create } = require('../app');
  const narrow = create({ auth: { getUser: async () => ({ id: 'driver-1' }) }, repository, requestRadiusMiles: 5 });
  repository.positions.set('driver-1', { ...DALLAS, at: new Date() });
  const small = await request(narrow).get('/api/drivers/requests').set('Authorization', 'Bearer driverToken');
  assert.equal(small.body.radiusMiles, 5);
  assert.deepEqual(small.body.requests.map((job) => job.id), ['near-tow', 'near']);
});

test('request list: no fresh position means "location required", never every request', async () => {
  const { app, bookings, repository } = buildHarness();
  seedNearbyJobs(bookings);
  repository.positions.delete('driver-1');
  const none = await request(app).get('/api/drivers/requests').set('Authorization', 'Bearer driverToken');
  assert.equal(none.status, 200);
  assert.deepEqual(none.body, { status: 'location_required', radiusMiles: 25, requests: [] });
  repository.positions.set('driver-1', { ...DALLAS, at: new Date(Date.now() - 11 * 60000) });
  const stale = await request(app).get('/api/drivers/requests').set('Authorization', 'Bearer driverToken');
  assert.equal(stale.body.status, 'location_required', 'a position older than 10 minutes is ignored');
  assert.equal(repository.listedArea, undefined, 'nothing was listed');
});

test('request list: invalid coordinates are refused and not stored', async () => {
  const { app, repository } = buildHarness();
  for (const query of [{ lat: 200, lng: -96 }, { lat: 32, lng: -500 }, { lat: 'abc', lng: -96 }, { lat: 32.7 }, { lng: -96 }, { lat: 0, lng: 0 }, { lat: '', lng: '' }, { lat: 'Infinity', lng: 1 }]) {
    const response = await request(app).get('/api/drivers/requests').query(query).set('Authorization', 'Bearer driverToken');
    assert.equal(response.status, 400, JSON.stringify(query));
    assert.equal(response.body.code, 'invalid_location');
  }
  assert.equal(repository.positions.get('driver-1').lat, DALLAS.lat, 'stored position unchanged');
});

test('accept: refused beyond the radius or without a position; nearby accept still works once', async () => {
  const { app, bookings, repository } = buildHarness();
  seedNearbyJobs(bookings);
  const far = await request(app).post('/api/bookings/far/accept').set('Authorization', 'Bearer driverToken');
  assert.equal(far.status, 403);
  assert.equal(far.body.code, 'out_of_range');
  assert.match(far.body.error, /more than 25 miles/);
  assert.equal(bookings.get('far').status, 'searching');
  repository.positions.delete('driver-6');
  const noPosition = await request(app).post('/api/bookings/near/accept').set('Authorization', 'Bearer wheelLiftDriverToken');
  assert.equal(noPosition.status, 409);
  assert.equal(noPosition.body.code, 'location_required');
  const [first, second] = await Promise.all([
    request(app).post('/api/bookings/near/accept').set('Authorization', 'Bearer driverToken'),
    request(app).post('/api/bookings/near/accept').set('Authorization', 'Bearer lightDutyDriverToken'),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409], 'one driver wins, the other is told it is gone');
});

test('nearby helpers: radius env is clamped with a sane default', () => {
  const { radiusFromEnv, parsePosition } = require('../nearby');
  assert.equal(radiusFromEnv({}), 25);
  assert.equal(radiusFromEnv({ DRIVER_REQUEST_RADIUS_MILES: '10' }), 10);
  assert.equal(radiusFromEnv({ DRIVER_REQUEST_RADIUS_MILES: 'lots' }), 25);
  assert.equal(radiusFromEnv({ DRIVER_REQUEST_RADIUS_MILES: '0' }), 1);
  assert.equal(radiusFromEnv({ DRIVER_REQUEST_RADIUS_MILES: '5000' }), 100);
  assert.deepEqual(parsePosition('32.5', '-96.1'), { lat: 32.5, lng: -96.1 });
  assert.equal(parsePosition(null, 1), null);
});

// ---- E4: one active request per customer; stale requests expire ----
const BATTERY = Object.freeze({ serviceType: 'battery_jump', location: { address: '100 Main St', lat: 32.7767, lng: -96.797 } });

test('E4: a customer with an active request is refused a second one and pointed at it', async () => {
  const { app, bookings } = buildHarness();
  const first = await request(app).post('/api/bookings').set('Authorization', 'Bearer customerToken').send(BATTERY);
  assert.equal(first.status, 201);
  for (const status of ['searching', 'accepted', 'en_route', 'arrived', 'in_progress']) {
    bookings.set(first.body.id, { ...bookings.get(first.body.id), status });
    const second = await request(app).post('/api/bookings').set('Authorization', 'Bearer customerToken').send({ ...BATTERY, serviceType: 'flat_tire' });
    assert.equal(second.status, 409, `refused while the first is ${status}`);
    assert.equal(second.body.code, 'active_request_exists');
    assert.equal(second.body.booking.id, first.body.id, 'the answer carries the active request');
    assert.match(second.body.error, /already have an active request/);
  }
  assert.equal(bookings.size, 1, 'nothing extra was created');
  const other = await request(app).post('/api/bookings').set('Authorization', 'Bearer otherCustomerToken').send(BATTERY);
  assert.equal(other.status, 201, 'other customers are unaffected');
  for (const status of ['completed', 'cancelled', 'expired']) {
    bookings.set(first.body.id, { ...bookings.get(first.body.id), status });
    const again = await request(app).post('/api/bookings').set('Authorization', 'Bearer customerToken').send(BATTERY);
    assert.equal(again.status, 201, `a new request is fine once the last one is ${status}`);
    bookings.delete(again.body.id);
  }
});

test('E4: two simultaneous requests — exactly one is created (the database index decides)', async () => {
  const { app, repository, bookings } = buildHarness();
  // Hold both requests at the pre-check until both have passed it, so only the index can stop the second.
  const original = repository.getActiveBooking.bind(repository);
  let waiting = [];
  repository.getActiveBooking = async (...args) => {
    const result = await original(...args);
    if (waiting) {
      await new Promise((resolve) => { waiting.push(resolve); if (waiting.length === 2) { waiting.forEach((go) => go()); waiting = null; } });
    }
    return result;
  };
  const [a, b] = await Promise.all([
    request(app).post('/api/bookings').set('Authorization', 'Bearer customerToken').send(BATTERY),
    request(app).post('/api/bookings').set('Authorization', 'Bearer customerToken').send({ ...BATTERY, serviceType: 'flat_tire' }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  const refused = a.status === 409 ? a : b;
  const created = a.status === 201 ? a : b;
  assert.equal(refused.body.code, 'active_request_exists');
  assert.equal(refused.body.booking.id, created.body.id);
  assert.equal([...bookings.values()].filter((item) => item.customerId === 'customer-1').length, 1);
});

test('E4: an unaccepted request expires after the window, with a system audit event', async () => {
  const { app, repository, bookings } = buildHarness();
  const created = await request(app).post('/api/bookings').set('Authorization', 'Bearer customerToken').send(BATTERY);
  const id = created.body.id;
  repository.clock = () => Date.now() + 14 * 60000;
  assert.equal((await request(app).get('/api/bookings/active').set('Authorization', 'Bearer customerToken')).body.status, 'searching', 'still open at 14 minutes');
  repository.clock = () => Date.now() + 15 * 60000;
  const active = await request(app).get('/api/bookings/active').set('Authorization', 'Bearer customerToken');
  assert.equal(active.body, null, 'expired on read: no active request any more');
  const ended = await request(app).get(`/api/bookings/${id}`).set('Authorization', 'Bearer customerToken');
  assert.equal(ended.body.status, 'expired');
  assert.equal(ended.body.endReason, 'no_driver_found');
  assert.deepEqual(repository.events.filter((event) => event.bookingId === id),
    [{ bookingId: id, actorId: null, from: 'searching', to: 'expired', role: 'system', reason: 'no_driver_found' }]);
  assert.equal(bookings.get(id).status, 'expired');
  const cancel = await request(app).patch(`/api/bookings/${id}/status`).set('Authorization', 'Bearer customerToken').send({ status: 'cancelled' });
  assert.equal(cancel.status, 409);
  assert.match(cancel.body.error, /expired because no driver accepted it in time/);
});

test('E4: an overdue request never blocks a new one — it expires first', async () => {
  const { app, repository, bookings } = buildHarness();
  const first = await request(app).post('/api/bookings').set('Authorization', 'Bearer customerToken').send(BATTERY);
  repository.clock = () => Date.now() + 16 * 60000;
  const second = await request(app).post('/api/bookings').set('Authorization', 'Bearer customerToken').send(BATTERY);
  assert.equal(second.status, 201);
  assert.equal(bookings.get(first.body.id).status, 'expired');
  assert.deepEqual(repository.expireCalls.at(-1), { customerId: 'customer-1' });
});

test('E4: drivers never see expired requests, and accepting one says it expired', async () => {
  const { app, repository, bookings } = buildHarness();
  bookings.set('old', { id: 'old', status: 'searching', customerId: 'customer-2', serviceType: 'battery_jump', createdAt: new Date(Date.now() - 20 * 60000) });
  bookings.set('fresh', { id: 'fresh', status: 'searching', customerId: 'customer-1', serviceType: 'battery_jump', createdAt: new Date() });
  const list = await request(app).get('/api/drivers/requests').set('Authorization', 'Bearer driverToken');
  assert.deepEqual(list.body.requests.map((job) => job.id), ['fresh'], 'overdue requests are not listed, even before the sweep');
  const accept = await request(app).post('/api/bookings/old/accept').set('Authorization', 'Bearer driverToken');
  assert.equal(accept.status, 409);
  assert.equal(accept.body.code, 'request_expired');
  assert.match(accept.body.error, /expired — no driver accepted it within 15 minutes/);
  assert.equal(bookings.get('old').status, 'expired', 'and it is marked expired');
  assert.ok(repository.events.some((event) => event.bookingId === 'old' && event.to === 'expired' && event.actorId === null));
  // A request already marked expired gets the same answer.
  const again = await request(app).post('/api/bookings/old/accept').set('Authorization', 'Bearer driverToken');
  assert.equal(again.body.code, 'request_expired');
  assert.equal((await request(app).post('/api/bookings/fresh/accept').set('Authorization', 'Bearer driverToken')).status, 200);
});

test('E4: one job per driver — a second accept is refused while a job is open', async () => {
  const { app, bookings } = buildHarness();
  bookings.set('mine', { id: 'mine', status: 'en_route', driverId: 'driver-1', customerId: 'customer-2', serviceType: 'battery_jump' });
  bookings.set('next', { id: 'next', status: 'searching', customerId: 'customer-1', serviceType: 'battery_jump', createdAt: new Date() });
  const accept = await request(app).post('/api/bookings/next/accept').set('Authorization', 'Bearer driverToken');
  assert.equal(accept.status, 409);
  assert.equal(accept.body.code, 'driver_busy');
  assert.equal(bookings.get('next').status, 'searching');
});

test('E4: two simultaneous accepts by one driver — one job lands, the other is told to finish it first', async () => {
  const { app, repository, bookings } = buildHarness();
  bookings.set('a', { id: 'a', status: 'searching', customerId: 'customer-1', serviceType: 'battery_jump', createdAt: new Date() });
  bookings.set('b', { id: 'b', status: 'searching', customerId: 'customer-2', serviceType: 'battery_jump', createdAt: new Date() });
  // Both pass the "no current job" pre-check; the database (unique index on driver_id) lets only one land.
  const originalActive = repository.getActiveBooking.bind(repository);
  let gate = [];
  repository.getActiveBooking = async (...args) => {
    const result = await originalActive(...args);
    if (gate) await new Promise((resolve) => { gate.push(resolve); if (gate.length === 2) { gate.forEach((go) => go()); gate = null; } });
    return result;
  };
  const originalAccept = repository.acceptBooking.bind(repository);
  repository.acceptBooking = async (id, driverId, capability) => {
    if ([...bookings.values()].some((item) => item.driverId === driverId && ['accepted', 'en_route', 'arrived', 'in_progress'].includes(item.status))) return null;
    return originalAccept(id, driverId, capability);
  };
  const [first, second] = await Promise.all(['a', 'b'].map((id) => request(app).post(`/api/bookings/${id}/accept`).set('Authorization', 'Bearer driverToken')));
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  assert.equal((first.status === 409 ? first : second).body.code, 'driver_busy');
  assert.equal([...bookings.values()].filter((item) => item.driverId === 'driver-1').length, 1);
});

test('E4: a job whose driver went silent is released (cancelled by the system, audited)', async () => {
  const { app, repository, bookings } = buildHarness();
  const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000);
  bookings.set('quiet', { id: 'quiet', status: 'en_route', driverId: 'driver-1', customerId: 'customer-1', serviceType: 'battery_jump', lastDriverActivityAt: at(61) });
  bookings.set('busy', { id: 'busy', status: 'accepted', driverId: 'driver-6', customerId: 'customer-2', serviceType: 'battery_jump', lastDriverActivityAt: at(20) });
  bookings.set('onsite', { id: 'onsite', status: 'arrived', driverId: 'driver-7', customerId: 'customer-3', serviceType: 'battery_jump', lastDriverActivityAt: at(300) });
  const result = await repository.expireStaleBookings();
  assert.deepEqual(result, { expired: [], released: ['quiet'] });
  assert.equal(bookings.get('busy').status, 'accepted', 'a driver heard from recently keeps the job');
  assert.equal(bookings.get('onsite').status, 'arrived', 'arrived jobs are never ended automatically');
  const seen = await request(app).get('/api/bookings/quiet').set('Authorization', 'Bearer customerToken');
  assert.equal(seen.body.status, 'cancelled');
  assert.equal(seen.body.cancelledBy, 'system');
  assert.equal(seen.body.endReason, 'driver_unresponsive');
  assert.ok(repository.events.some((event) => event.bookingId === 'quiet' && event.actorId === null && event.reason === 'driver_unresponsive'));
});

test('E4: reads and status changes run the expiry check for the caller first', async () => {
  const { app, repository } = buildHarness();
  await request(app).get('/api/bookings').set('Authorization', 'Bearer customerToken');
  await request(app).get('/api/bookings/active').set('Authorization', 'Bearer driverToken');
  await request(app).patch('/api/bookings/x/status').set('Authorization', 'Bearer customerToken').send({ status: 'cancelled' });
  assert.deepEqual(repository.expireCalls, [{ customerId: 'customer-1' }, { driverId: 'driver-1' }, { customerId: 'customer-1' }]);
});
