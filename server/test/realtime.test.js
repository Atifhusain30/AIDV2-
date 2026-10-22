// B11: realtime channel — stream tickets (single use, expiry), who receives which event (never an
// outsider), an event from every write path, connection cap, cleanup on disconnect, rotation, payload
// privacy, and an hour of realtime use by both apps with no 429.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../app');
const { createRealtimeHub, notifyEnded, jobTarget } = require('../realtime');
const { startExpirySweep } = require('../expiry');
const { PostgresRepository } = require('../repository');

const JOB = '11111111-1111-4111-8111-111111111111';
const OPEN = '22222222-2222-4222-8222-222222222222';
const DALLAS = { lat: 32.7767, lng: -96.797 };
const HOUSTON = { lat: 29.7604, lng: -95.3698 };
const TRUCK = { make: 'Ford', model: 'F-250', year: 2021, color: 'White', plate: 'TRK-1', plateState: 'TX', equipmentType: 'light_duty' };
const DRIVER = { role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: true, driverVehicle: TRUCK };
const USERS = {
  customerToken: { id: 'customer-1', role: 'customer', status: 'active' },
  outsiderToken: { id: 'customer-9', role: 'customer', status: 'active' },
  driverToken: { id: 'driver-1', ...DRIVER },
  nearDriverToken: { id: 'driver-2', ...DRIVER },
  farDriverToken: { id: 'driver-3', ...DRIVER },
  offlineDriverToken: { id: 'driver-4', ...DRIVER, isOnline: false },
  adminToken: { id: 'admin-1', role: 'admin', status: 'active' },
};
const POSITIONS = { 'driver-1': DALLAS, 'driver-2': DALLAS, 'driver-3': HOUSTON, 'driver-4': DALLAS };

function harness({ clock = () => Date.now(), hubOptions = {}, status = 'accepted' } = {}) {
  const bookings = new Map([
    [JOB, { id: JOB, customerId: 'customer-1', driverId: 'driver-1', status, service: { id: 'battery_jump', name: 'Jump' }, location: { ...DALLAS, address: '1 Main' } }],
  ]);
  const messages = [];
  let seq = 0;
  const repository = {
    async getProfile(id) { return Object.values(USERS).find((user) => user.id === id) || null; },
    expireResult: { expired: [], released: [] },
    async expireStaleBookings() { const result = this.expireResult; this.expireResult = { expired: [], released: [] }; return result; },
    async getRealtimeTargets(ids) { return ids.map((id) => jobTarget(bookings.get(id))).filter(Boolean); },
    async getBooking(id, userId, role) {
      const booking = bookings.get(id);
      if (!booking) return null;
      if (role === 'customer') return booking.customerId === userId ? booking : null;
      if (role === 'driver') return booking.driverId === userId ? booking : null;
      return null;
    },
    async getActiveBooking(userId, role) {
      const key = role === 'driver' ? 'driverId' : 'customerId';
      return [...bookings.values()].find((b) => b[key] === userId && !['completed', 'cancelled', 'expired'].includes(b.status)) || null;
    },
    async createBooking({ customerId, service, location }) {
      const booking = { id: OPEN, customerId, status: 'searching', service: { id: service.id, name: service.name }, location, createdAt: new Date().toISOString() };
      bookings.set(OPEN, booking);
      return booking;
    },
    async updateBookingStatus(id, userId, role, next, from) {
      const booking = bookings.get(id);
      if (!booking || !from.includes(booking.status)) return null;
      booking.status = next;
      if (next === 'completed') booking.completedAt = new Date().toISOString();
      return booking;
    },
    async getAvailableBooking(id) {
      const b = bookings.get(id);
      return b && b.status === 'searching' ? { id, customerId: b.customerId, serviceType: b.service.id, vehicleIsElectric: false, pickup: { lat: b.location.lat, lng: b.location.lng } } : null;
    },
    async getBookingStatus(id) { return bookings.get(id)?.status || null; },
    async getBlockBetween() { return { byMe: false, byThem: false }; },
    async getDriverPosition(driverId) { return POSITIONS[driverId] || null; },
    async updateDriverPosition() {},
    async listAvailableBookings() { return []; },
    async acceptBooking(id, driverId) {
      const booking = bookings.get(id);
      if (!booking || booking.status !== 'searching') return null;
      Object.assign(booking, { status: 'accepted', driverId });
      return booking;
    },
    async updateDriverLocation(id, driverId, location) {
      const booking = bookings.get(id);
      if (!booking || booking.driverId !== driverId) return null;
      booking.driverLocation = location;
      return booking;
    },
    async updateDriverOnlineStatus() {},
    async getChatSummary() { return { unread: 0, block: { byMe: false, byThem: false } }; },
    async listJobMessages() { return []; },
    async countRecentJobMessages() { return 0; },
    async createJobMessage({ bookingId, senderId, senderRole, body }) {
      seq += 1;
      messages.push({ bookingId, senderId, body });
      return { message: { id: `m${seq}`, seq: String(seq), mine: true, senderRole, body, createdAt: new Date().toISOString(), readAt: null }, duplicate: false };
    },
    async markJobMessagesRead() { return 1; },
    async blockUser() { return { created: true }; },
    async hasRated() { return false; },
    async createRating(input) { return { id: 'r1', bookingId: input.bookingId, stars: input.stars }; },
  };
  const hub = createRealtimeHub({ clock, radiusMiles: 25, ...hubOptions });
  const auth = { async getUser(token) { const user = USERS[token]; return user ? { id: user.id, aal: 'aal2' } : null; } };
  const app = createApp({ auth, repository, realtime: hub, clock, supportContact: { email: null, phone: null } });
  return { app, hub, repository, bookings };
}

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }) };
}

const call = (base, token, path, method = 'GET', body) => fetch(`${base}${path}`, {
  method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null), headers: response.headers }));

async function ticketFor(base, token) {
  const answer = await call(base, token, '/api/realtime/ticket', 'POST', {});
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return answer.body.ticket;
}

/** Minimal SSE client: collects { type, data } events. */
function openStream(base, ticket, headers = {}) {
  return new Promise((resolve) => {
    const events = [];
    const waiters = [];
    const req = http.get(`${base}/api/realtime/stream?ticket=${encodeURIComponent(ticket)}`, { headers }, (res) => {
      let buffer = '';
      const stream = {
        status: res.statusCode, headers: res.headers, events,
        close: () => req.destroy(),
        ended: new Promise((done) => res.on('close', done)),
        next(type, timeoutMs = 2000) {
          const found = events.find((event) => event.type === type && !event.taken);
          if (found) { found.taken = true; return Promise.resolve(found); }
          return new Promise((done, fail) => {
            const timer = setTimeout(() => fail(new Error(`no ${type} event within ${timeoutMs} ms`)), timeoutMs);
            waiters.push({ type, done: (event) => { clearTimeout(timer); event.taken = true; done(event); } });
          });
        },
        async none(type, ms = 150) {
          await new Promise((done) => setTimeout(done, ms));
          return events.filter((event) => event.type === type && !event.taken);
        },
      };
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const type = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (!type) continue;
          const event = { type, data: data ? JSON.parse(data) : null, raw: block };
          events.push(event);
          const waiter = waiters.findIndex((w) => w.type === type);
          if (waiter >= 0) waiters.splice(waiter, 1)[0].done(event);
        }
      });
      resolve(stream);
    });
  });
}

async function connect(base, token) {
  const stream = await openStream(base, await ticketFor(base, token));
  assert.equal(stream.status, 200);
  await stream.next('ready');
  return stream;
}

test('ticket: needs a signed-in customer or driver; admins and anonymous callers get none', async () => {
  const { app } = harness();
  const { base, close } = await listen(app);
  try {
    assert.equal((await call(base, null, '/api/realtime/ticket', 'POST', {})).status, 401);
    assert.equal((await call(base, 'bogus', '/api/realtime/ticket', 'POST', {})).status, 401);
    assert.equal((await call(base, 'adminToken', '/api/realtime/ticket', 'POST', {})).status, 403);
    const ok = await call(base, 'customerToken', '/api/realtime/ticket', 'POST', {});
    assert.equal(ok.status, 200);
    assert.match(ok.body.ticket, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(ok.body.expiresInSeconds, 30);
    assert.equal(ok.body.streamPath, '/api/realtime/stream');
    assert.equal(ok.headers.get('cache-control'), 'no-store');
  } finally { await close(); }
});

test('ticket is single use, expires after 30 s, and a stream without one is refused', async () => {
  let now = Date.now();
  const { app } = harness({ clock: () => now });
  const { base, close } = await listen(app);
  try {
    const missing = await openStream(base, '');
    assert.equal(missing.status, 401);
    const made = await openStream(base, 'x'.repeat(43));
    assert.equal(made.status, 401);

    const ticket = await ticketFor(base, 'customerToken');
    const first = await openStream(base, ticket);
    assert.equal(first.status, 200);
    assert.equal((await first.next('ready')).data.heartbeatSeconds, 25);
    const replay = await openStream(base, ticket);
    assert.equal(replay.status, 401, 'a used ticket never opens a second stream');
    first.close();

    const late = await ticketFor(base, 'customerToken');
    now += 31_000;
    assert.equal((await openStream(base, late)).status, 401, 'expired ticket');
  } finally { await close(); }
});

test('stream answers carry security headers and CORS is still enforced', async () => {
  const { app } = harness();
  const { base, close } = await listen(app);
  try {
    const stream = await openStream(base, await ticketFor(base, 'customerToken'));
    assert.equal(stream.headers['content-type'], 'text/event-stream; charset=utf-8');
    assert.equal(stream.headers['x-content-type-options'], 'nosniff');
    assert.match(stream.headers['cache-control'], /no-store/);
    stream.close();
    const foreign = await openStream(base, await ticketFor(base, 'customerToken'), { Origin: 'https://evil.example' });
    assert.equal(foreign.status, 403);
  } finally { await close(); }
});

test('job events reach only its customer and driver — an outsider hears nothing', async () => {
  const { app } = harness();
  const { base, close } = await listen(app);
  const streams = [];
  try {
    const customer = await connect(base, 'customerToken'); streams.push(customer);
    const driver = await connect(base, 'driverToken'); streams.push(driver);
    const outsider = await connect(base, 'outsiderToken'); streams.push(outsider);

    const moved = await call(base, 'driverToken', `/api/bookings/${JOB}/status`, 'PATCH', { status: 'en_route' });
    assert.equal(moved.status, 200);
    assert.deepEqual((await customer.next('booking')).data, { bookingId: JOB, reason: 'status' });
    assert.deepEqual((await driver.next('booking')).data, { bookingId: JOB, reason: 'status' });

    // Wrong user: an outsider can't change the job, and hears none of it.
    assert.equal((await call(base, 'outsiderToken', `/api/bookings/${JOB}/status`, 'PATCH', { status: 'cancelled' })).status, 404);
    await call(base, 'driverToken', `/api/bookings/${JOB}/driver-location`, 'PATCH', { location: DALLAS });
    assert.deepEqual((await customer.next('booking')).data, { bookingId: JOB, reason: 'location' });
    await call(base, 'customerToken', `/api/bookings/${JOB}/messages`, 'POST', { body: 'Gate code is 4411', clientId: 'client-01' });
    assert.deepEqual((await driver.next('chat')).data, { bookingId: JOB });
    assert.deepEqual(await outsider.none('booking'), []);
    assert.deepEqual(await outsider.none('chat'), []);
    // The driver who sent their own location isn't pinged about it.
    assert.deepEqual((await driver.none('booking')).filter((e) => e.data.reason === 'location'), []);
  } finally { streams.forEach((s) => s.close()); await close(); }
});

test('payloads never carry PII, coordinates, message text or status details', async () => {
  const { app } = harness();
  const { base, close } = await listen(app);
  const streams = [];
  try {
    const customer = await connect(base, 'customerToken'); streams.push(customer);
    const driver = await connect(base, 'driverToken'); streams.push(driver);
    await call(base, 'driverToken', `/api/bookings/${JOB}/driver-location`, 'PATCH', { location: DALLAS });
    await call(base, 'customerToken', `/api/bookings/${JOB}/messages`, 'POST', { body: 'call me 214-555-0100', clientId: 'client-02' });
    await customer.next('booking');
    await driver.next('chat');
    const all = [...customer.events, ...driver.events].map((event) => event.raw).join('\n');
    for (const secret of ['32.77', '-96.79', '214-555', 'call me', 'customer-1', 'driver-1', '1 Main']) assert.ok(!all.includes(secret), `leaked ${secret}`);
    for (const event of [...customer.events, ...driver.events]) {
      for (const key of Object.keys(event.data || {})) assert.ok(['bookingId', 'reason', 'heartbeatSeconds', 'maxStreamSeconds'].includes(key), key);
    }
  } finally { streams.forEach((s) => s.close()); await close(); }
});

test('every write path emits its event', async () => {
  const { app, bookings, repository } = harness({ status: 'searching' });
  bookings.delete(JOB);
  const { base, close } = await listen(app);
  const streams = [];
  try {
    const customer = await connect(base, 'customerToken'); streams.push(customer);
    const driver = await connect(base, 'driverToken'); streams.push(driver);
    // Drivers learn their position from the request list (or from the stored one when the stream opens).
    await call(base, 'driverToken', `/api/drivers/requests?lat=${DALLAS.lat}&lng=${DALLAS.lng}`);

    // create
    const created = await call(base, 'customerToken', '/api/bookings', 'POST', { serviceType: 'battery_jump', location: { ...DALLAS, address: '5 Elm' } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual((await customer.next('booking')).data, { bookingId: OPEN, reason: 'created' });
    await driver.next('requests');
    // accept
    assert.equal((await call(base, 'driverToken', `/api/bookings/${OPEN}/accept`, 'POST', {})).status, 200);
    assert.deepEqual((await customer.next('booking')).data, { bookingId: OPEN, reason: 'accepted' });
    await driver.next('requests');
    // status changes through completion (+ ratings now pending for both)
    for (const status of ['en_route', 'arrived', 'in_progress', 'completed']) {
      assert.equal((await call(base, 'driverToken', `/api/bookings/${OPEN}/status`, 'PATCH', { status })).status, 200, status);
      assert.equal((await customer.next('booking')).data.reason, 'status');
    }
    await customer.next('ratings');
    await driver.next('ratings');
    // rating
    assert.equal((await call(base, 'customerToken', `/api/bookings/${OPEN}/rating`, 'POST', { stars: 5 })).status, 201);
    await customer.next('ratings');
    // expiry (lazy, on the next read) of another open request
    bookings.set(JOB, { id: JOB, customerId: 'customer-1', status: 'searching', service: { id: 'battery_jump' }, location: { ...DALLAS, address: '1 Main' } });
    repository.expireResult = { expired: [JOB], released: [] };
    await call(base, 'customerToken', '/api/bookings/active');
    assert.deepEqual((await customer.next('booking')).data, { bookingId: JOB, reason: 'expired' });
    await driver.next('requests');
  } finally { streams.forEach((s) => s.close()); await close(); }
});

test('cancel, chat read and block emit to both parties', async () => {
  const { app, bookings } = harness({ status: 'en_route' });
  const { base, close } = await listen(app);
  const streams = [];
  try {
    const customer = await connect(base, 'customerToken'); streams.push(customer);
    const driver = await connect(base, 'driverToken'); streams.push(driver);
    assert.equal((await call(base, 'driverToken', `/api/bookings/${JOB}/messages/read`, 'POST', {})).status, 200);
    assert.deepEqual((await customer.next('chat')).data, { bookingId: JOB });
    assert.equal((await call(base, 'customerToken', `/api/bookings/${JOB}/block`, 'POST', {})).status, 201);
    assert.equal((await driver.next('booking')).data.reason, 'block');
    await driver.next('chat');
    await driver.next('requests');
    bookings.get(JOB).status = 'en_route';
    assert.equal((await call(base, 'customerToken', `/api/bookings/${JOB}/status`, 'PATCH', { status: 'cancelled' })).status, 200);
    assert.deepEqual((await driver.next('booking')).data, { bookingId: JOB, reason: 'cancelled' });
  } finally { streams.forEach((s) => s.close()); await close(); }
});

test('requests:changed goes only to online drivers who can do the job within the radius', async () => {
  const { app, bookings, hub } = harness();
  bookings.delete(JOB);
  const { base, close } = await listen(app);
  const streams = [];
  try {
    const near = await connect(base, 'nearDriverToken'); streams.push(near);
    const far = await connect(base, 'farDriverToken'); streams.push(far);
    const offline = await connect(base, 'offlineDriverToken'); streams.push(offline);
    const customer = await connect(base, 'customerToken'); streams.push(customer);
    await call(base, 'customerToken', '/api/bookings', 'POST', { serviceType: 'battery_jump', location: { ...DALLAS, address: '5 Elm' } });
    assert.deepEqual((await near.next('requests')).data, {});
    assert.deepEqual(await far.none('requests'), [], 'Houston driver is 200+ miles away');
    assert.deepEqual(await offline.none('requests'), [], 'offline driver');
    assert.deepEqual(await customer.none('requests'), [], 'customers never get request signals');
    // The request disappears (customer cancels): the same nearby driver re-fetches.
    assert.equal((await call(base, 'customerToken', `/api/bookings/${OPEN}/status`, 'PATCH', { status: 'cancelled' })).status, 200);
    await near.next('requests');
    assert.deepEqual(await far.none('requests'), []);
    // A tow needs a tow truck: the light-duty driver nearby isn't told.
    hub.requestsChanged({ id: JOB, customerId: 'customer-1', serviceType: 'towing', pickup: DALLAS });
    assert.deepEqual(await near.none('requests'), []);
  } finally { streams.forEach((s) => s.close()); await close(); }
});

test('connection cap per user, cleanup on disconnect, rotation after the max stream time', async () => {
  const { app, hub } = harness({ hubOptions: { maxConnectionsPerUser: 2, maxStreamMs: 300, heartbeatMs: 100 } });
  const { base, close } = await listen(app);
  try {
    const one = await connect(base, 'customerToken');
    const two = await connect(base, 'customerToken');
    assert.equal(hub.countFor('customer-1'), 2);
    const refused = await call(base, 'customerToken', '/api/realtime/ticket', 'POST', {});
    assert.equal(refused.status, 429);
    assert.equal(refused.body.code, 'too_many_streams');
    // Another person is unaffected by this user's cap.
    const other = await connect(base, 'driverToken');
    other.close();
    one.close();
    await one.ended;
    await new Promise((done) => setTimeout(done, 50));
    assert.equal(hub.countFor('customer-1'), 1, 'closed stream removed');
    // heartbeat, then reauth + server close at maxStreamMs
    await two.next('ping', 1000);
    await two.next('reauth', 1000);
    await two.ended;
    await new Promise((done) => setTimeout(done, 20));
    assert.deepEqual({ open: hub.stats().open, users: hub.stats().users }, { open: 0, users: 0 });
  } finally { await close(); }
});

test('stream and ticket endpoints are rate limited per user', async () => {
  const { app } = harness();
  const { base, close } = await listen(app);
  try {
    let last;
    for (let i = 0; i < 61; i += 1) last = await call(base, 'customerToken', '/api/realtime/ticket', 'POST', {});
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'rate_limited');
  } finally { await close(); }
});

test('expiry sweep notifies through the hub; notifyEnded sends expired + released', async () => {
  const sent = [];
  const hub = { bookingChanged: (t, r) => sent.push(['booking', t.id, r]), requestsChanged: (t) => sent.push(['requests', t.id]) };
  const repository = {
    async expireStaleBookings() { return { expired: ['a'], released: ['b'] }; },
    async getRealtimeTargets(ids) { return ids.map((id) => ({ id, customerId: 'c', driverId: id === 'b' ? 'd' : null, pickup: DALLAS })); },
  };
  const sweep = startExpirySweep({ repository, intervalMs: 60_000, logger: { log() {}, error() {} }, onExpired: (result) => notifyEnded(hub, repository, result) });
  await sweep.tick();
  sweep.stop();
  assert.deepEqual(sent, [['booking', 'a', 'expired'], ['requests', 'a'], ['booking', 'b', 'released']]);
});

test('getRealtimeTargets SQL loads parties and pickup for the given ids', async () => {
  const calls = [];
  const pool = { query: async (text, values) => { calls.push({ text, values }); return { rows: [{ id: JOB, customer_id: 'c', driver_id: null, service_type: 'towing', location_lat: 1, location_lng: 2, vehicle_is_electric: true }] }; } };
  const repository = new PostgresRepository(pool);
  assert.deepEqual(await repository.getRealtimeTargets([]), []);
  const [target] = await repository.getRealtimeTargets([JOB]);
  assert.match(calls[0].text, /where b\.id = any\(\$1::uuid\[\]\)/);
  assert.deepEqual(target, { id: JOB, customerId: 'c', driverId: null, serviceType: 'towing', vehicleIsElectric: true, pickup: { lat: 1, lng: 2 } });
});

// E3 + B11: with live updates on, the apps poll every 30 s (safety net), re-fetch on each event and
// rotate the stream every 30 min. One hour of that for both apps on one IP never trips a limit.
test('an hour of realtime use (stream + event-driven refetch + 30 s safety polling) never hits a rate limit', { timeout: 120000 }, async () => {
  let now = Date.now();
  const { app, hub } = harness({ clock: () => now, status: 'en_route', hubOptions: { heartbeatMs: 3_600_000, maxStreamMs: 3_600_000 } });
  const { base, close } = await listen(app);
  const statuses = [];
  const track = async (promise) => { const answer = await promise; statuses.push(answer.status); return answer; };
  let streams = [];
  try {
    for (let second = 0; second < 3600; second += 1) {
      const calls = [];
      if (second % 1800 === 0) {
        // Stream rotation (reauth) every 30 min: new ticket + stream for both apps.
        streams.forEach((s) => s.close());
        streams = await Promise.all(['customerToken', 'driverToken'].map(async (token) => {
          const ticket = await track(call(base, token, '/api/realtime/ticket', 'POST', {}));
          return openStream(base, ticket.body.ticket);
        }));
        statuses.push(...streams.map((s) => s.status));
      }
      if (second % 5 === 0) {
        // Driver location every 5 s → customer gets an event and re-fetches the booking.
        calls.push(track(call(base, 'driverToken', `/api/bookings/${JOB}/driver-location`, 'PATCH', { location: DALLAS })));
        calls.push(track(call(base, 'customerToken', `/api/bookings/${JOB}`)));
      }
      if (second % 30 === 0) {
        // Safety-net polls while connected.
        calls.push(track(call(base, 'customerToken', `/api/bookings/${JOB}`)));
        calls.push(track(call(base, 'driverToken', '/api/bookings/active')));
        calls.push(track(call(base, 'customerToken', `/api/bookings/${JOB}/messages`)));
        calls.push(track(call(base, 'driverToken', `/api/bookings/${JOB}/messages`)));
      }
      if (second % 20 === 0) {
        // A chat message every 20 s, which the driver's app re-fetches and marks read.
        calls.push(track(call(base, 'customerToken', `/api/bookings/${JOB}/messages`, 'POST', { body: 'ok', clientId: `client-${second}` })));
        calls.push(track(call(base, 'driverToken', `/api/bookings/${JOB}/messages`)));
        calls.push(track(call(base, 'driverToken', `/api/bookings/${JOB}/messages/read`, 'POST', {})));
      }
      await Promise.all(calls);
      now += 1000;
    }
    assert.ok(hub.stats().delivered > 700, `${hub.stats().delivered} events delivered`);
  } finally {
    streams.forEach((s) => s.close());
    await close();
  }
  assert.ok(statuses.length > 2000, `${statuses.length} requests`);
  assert.deepEqual(statuses.filter((status) => status === 429), [], 'nothing was rate limited');
  assert.deepEqual(statuses.filter((status) => status >= 400), [], 'every request succeeded (no 429, no errors)');
});
