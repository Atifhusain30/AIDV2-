// B12: chat between a job's customer and driver, and blocking — rules, API (participants only,
// job state, read-only window, rate limit, privacy, block effects on dispatch, admin thread view) and
// the repository SQL that repeats the rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const { PostgresRepository } = require('../repository');
const {
  MESSAGE_MAX, MESSAGES_PER_MINUTE, READ_ONLY_HOURS, OPEN_STATUSES,
  chatState, cleanMessage, parseCursor, readOnlyUntil, blockGuidance, sendRefusal,
} = require('../chat');

const JOB = '11111111-1111-4111-8111-111111111111';
const SEARCHING = '22222222-2222-4222-8222-222222222222';
const OTHER_REQUEST = '44444444-4444-4444-8444-444444444444';
const REPORT = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-10-22T19:00:00Z');
const VAN = { make: 'Ford', model: 'Transit', year: 2021, color: 'White', plate: 'VAN-1', plateState: 'TX', equipmentType: 'flatbed' };
const DRIVER = { role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: true, driverVehicle: VAN };
const USERS = {
  customerToken: { id: 'customer-1', role: 'customer', status: 'active', phone: '+12145550100', email: 'casey@example.com' },
  otherCustomerToken: { id: 'customer-2', role: 'customer', status: 'active' },
  driverToken: { id: 'driver-1', ...DRIVER, phone: '+12145550199', email: 'dana@example.com' },
  otherDriverToken: { id: 'driver-2', ...DRIVER },
  adminToken: { id: 'admin-1', role: 'admin', status: 'active' },
};
const DALLAS = { lat: 32.7767, lng: -96.797 };

function harness({ status = 'en_route', perMinute, now = NOW } = {}) {
  const bookings = new Map([
    [JOB, { id: JOB, customerId: 'customer-1', driverId: 'driver-1', status, service: { id: 'battery_jump' }, location: { ...DALLAS, address: '1 Main' } }],
    [SEARCHING, { id: SEARCHING, customerId: 'customer-2', driverId: undefined, status: 'searching', service: { id: 'battery_jump' }, location: { ...DALLAS, address: '2 Main' } }],
  ]);
  const messages = [];
  const blocks = [];
  let seq = 0;
  const blocked = (a, b) => blocks.some((x) => (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a));
  const view = (row, viewerId) => ({ id: row.id, seq: String(row.seq), mine: row.senderId === viewerId, senderRole: row.senderRole, body: row.body, createdAt: row.createdAt, readAt: row.readAt });
  const repository = {
    events: [],
    async getProfile(id) { return Object.values(USERS).find((user) => user.id === id) || null; },
    async expireStaleBookings() { return { expired: [], released: [] }; },
    async getBooking(bookingId, userId, role) {
      const booking = bookings.get(bookingId);
      if (!booking) return null;
      if (role === 'customer') return booking.customerId === userId ? booking : null;
      if (role === 'driver') return booking.driverId === userId ? booking : null;
      return null;
    },
    async getActiveBooking(userId, role) {
      const key = role === 'driver' ? 'driverId' : 'customerId';
      return [...bookings.values()].find((b) => b[key] === userId && ['searching', ...OPEN_STATUSES].includes(b.status)) || null;
    },
    async getBlockBetween(userId, otherId) {
      return { byMe: blocks.some((x) => x.blockerId === userId && x.blockedId === otherId), byThem: blocks.some((x) => x.blockerId === otherId && x.blockedId === userId) };
    },
    async getChatSummary(bookingId, userId, otherId) {
      return { unread: messages.filter((m) => m.bookingId === bookingId && !m.readAt && m.senderId !== userId).length, block: await this.getBlockBetween(userId, otherId) };
    },
    async listJobMessages(bookingId, viewerId, after) {
      return messages.filter((m) => m.bookingId === bookingId && (after === null || m.seq > Number(after))).map((m) => view(m, viewerId));
    },
    async countRecentJobMessages(senderId) { return messages.filter((m) => m.senderId === senderId).length; },
    // Mirrors the SQL re-check: own job, open status, no block; clientId retries return the first message.
    async createJobMessage({ bookingId, senderId, senderRole, body, clientId }) {
      const existing = clientId && messages.find((m) => m.senderId === senderId && m.clientId === clientId);
      if (existing) return { message: view(existing, senderId), duplicate: true };
      const booking = bookings.get(bookingId);
      const other = senderRole === 'driver' ? booking.customerId : booking.driverId;
      const own = senderRole === 'driver' ? booking.driverId === senderId : booking.customerId === senderId;
      if (!own || !other || !OPEN_STATUSES.includes(booking.status) || blocked(senderId, other)) return null;
      seq += 1;
      const row = { id: `m${seq}`, seq, bookingId, senderId, senderRole, body, clientId, createdAt: new Date(now).toISOString(), readAt: null };
      messages.push(row);
      return { message: view(row, senderId), duplicate: false };
    },
    async markJobMessagesRead(bookingId, readerId, upTo) {
      let n = 0;
      for (const m of messages) {
        if (m.bookingId === bookingId && !m.readAt && m.senderId !== readerId && (upTo === null || m.seq <= Number(upTo))) { m.readAt = new Date(now).toISOString(); n += 1; }
      }
      return n;
    },
    async blockUser(input) {
      if (blocks.some((x) => x.blockerId === input.blockerId && x.blockedId === input.blockedId)) return { created: false };
      blocks.push(input);
      return { created: true };
    },
    // Dispatch, mirroring the SQL: blocked pairs are filtered out of the list and the atomic accept.
    async getDriverPosition() { return { ...DALLAS, at: new Date() }; },
    async updateDriverPosition() {},
    async listAvailableBookings(_capability, area, driverId) {
      this.listedFor = driverId;
      if (!area) return [];
      return [...bookings.values()].filter((b) => b.status === 'searching' && !b.driverId && !(driverId && blocked(b.customerId, driverId)))
        .map((b) => ({ ...b, pickup: DALLAS }));
    },
    async getAvailableBooking(bookingId) {
      const b = bookings.get(bookingId);
      return b && b.status === 'searching' && !b.driverId ? { id: b.id, customerId: b.customerId, serviceType: b.service.id, vehicleIsElectric: false, pickup: DALLAS } : null;
    },
    async getBookingStatus(bookingId) { return bookings.get(bookingId)?.status ?? null; },
    async acceptBooking(bookingId, driverId) {
      const b = bookings.get(bookingId);
      if (!b || b.status !== 'searching' || b.driverId || blocked(b.customerId, driverId)) return null;
      const accepted = { ...b, status: 'accepted', driverId };
      bookings.set(bookingId, accepted);
      return accepted;
    },
    // Admin report → chat thread.
    async getSupportReportStatus(id) { return id === REPORT ? 'open' : null; },
    async getReportChatForAdmin(id) {
      if (id !== REPORT) return null;
      return {
        bookingId: JOB,
        messages: messages.filter((m) => m.bookingId === JOB).map((m) => ({ id: m.id, senderRole: m.senderRole, senderName: m.senderRole === 'driver' ? 'Dana D' : 'Casey C', body: m.body, createdAt: m.createdAt, readAt: m.readAt })),
        blocks: blocks.map((x) => ({ blockerRole: x.blockerRole, blockerName: 'x', sameJob: x.bookingId === JOB, createdAt: new Date(now).toISOString() })),
      };
    },
  };
  const auth = { async getUser(token) { const user = USERS[token]; return user ? { id: user.id, email: user.email, aal: 'aal2' } : null; } };
  const app = createApp({ auth, repository, supportContact: { email: null, phone: null }, clock: () => now, ...(perMinute ? { chatMessagesPerMinute: perMinute } : {}) });
  return { app, repository, bookings, messages, blocks };
}

const as = (token) => ({
  get: (app, path) => request(app).get(path).set('Authorization', `Bearer ${token}`),
  post: (app, path, body) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body),
});
const send = (app, token, body, id = JOB) => as(token).post(app, `/api/bookings/${id}/messages`, typeof body === 'string' ? { body } : body);
const list = (app, token, after, id = JOB) => as(token).get(app, `/api/bookings/${id}/messages${after != null ? `?after=${after}` : ''}`);

// ---- rules ----

test('chat is open only while a driver is on the job; read-only for 24 h after it ends, then hidden', () => {
  const base = { customerId: 'c', driverId: 'd' };
  for (const status of ['accepted', 'en_route', 'arrived', 'in_progress']) assert.equal(chatState({ ...base, status }, {}, NOW), 'open', status);
  assert.equal(chatState({ customerId: 'c', status: 'searching' }, {}, NOW), 'unavailable', 'no driver yet');
  assert.equal(chatState({ ...base, status: 'expired' }, {}, NOW), 'unavailable');
  const ended = new Date(NOW - 2 * 3600000).toISOString();
  assert.equal(chatState({ ...base, status: 'completed', completedAt: ended }, {}, NOW), 'read_only');
  assert.equal(chatState({ ...base, status: 'cancelled', cancelledAt: ended }, {}, NOW), 'read_only');
  assert.equal(readOnlyUntil({ status: 'completed', completedAt: ended }), new Date(NOW + 22 * 3600000).toISOString());
  const old = new Date(NOW - (READ_ONLY_HOURS * 3600000 + 1)).toISOString();
  assert.equal(chatState({ ...base, status: 'completed', completedAt: old }, {}, NOW), 'closed');
  assert.equal(chatState({ ...base, status: 'completed', completedAt: old }, { byMe: true }, NOW), 'closed', 'hidden wins over blocked');
  assert.equal(chatState({ ...base, status: 'arrived' }, { byThem: true }, NOW), 'blocked');
  assert.equal(sendRefusal('open'), null);
  assert.equal(sendRefusal('read_only').code, 'chat_read_only');
});

test('messages: text only, trimmed, control characters removed, 1–1000 characters', () => {
  assert.equal(cleanMessage({}).ok, false);
  assert.equal(cleanMessage({ body: '   ' }).ok, false);
  assert.equal(cleanMessage({ body: { a: 1 } }).ok, false);
  assert.equal(cleanMessage({ body: 'x'.repeat(MESSAGE_MAX + 1) }).ok, false);
  assert.equal(cleanMessage({ body: 'x'.repeat(MESSAGE_MAX) }).ok, true);
  assert.equal(cleanMessage({ body: ' Hi\u0000 there\u202E\r\n\n\n\nGate is open ' }).body, 'Hi there\n\nGate is open');
  assert.equal(cleanMessage({ body: 'ok', clientId: 'bad id!' }).ok, false);
  assert.equal(cleanMessage({ body: 'ok', clientId: 'c-1234567890' }).clientId, 'c-1234567890');
  assert.deepEqual(parseCursor('12'), { ok: true, after: '12' });
  assert.deepEqual(parseCursor(undefined), { ok: true, after: null });
  assert.equal(parseCursor('-1').ok, false);
  assert.equal(parseCursor('1; drop').ok, false);
  assert.equal(MESSAGES_PER_MINUTE, 30);
});

test('block guidance points to the B10 cancel rules and support, never auto-cancel', () => {
  assert.match(blockGuidance('customer', 'en_route'), /cancel the request until your driver arrives/);
  assert.match(blockGuidance('customer', 'arrived'), /can't be cancelled in the app/);
  assert.match(blockGuidance('driver', 'accepted'), /cancel it with a reason before service starts/);
  assert.match(blockGuidance('driver', 'in_progress'), /can't be cancelled/);
  assert.equal(blockGuidance('driver', 'completed'), null);
});

// ---- API ----

test('the customer and the assigned driver can message each other; nobody else can read or send', async () => {
  const { app, messages } = harness();
  assert.equal((await request(app).get(`/api/bookings/${JOB}/messages`)).status, 401);
  const first = await send(app, 'customerToken', { body: 'Gate code is 4411', senderId: 'driver-1', senderRole: 'driver' });
  assert.equal(first.status, 201);
  assert.equal(first.body.mine, true);
  assert.equal(messages[0].senderId, 'customer-1', 'sender comes from the token, not the body');
  assert.equal(messages[0].senderRole, 'customer');
  assert.equal((await send(app, 'driverToken', 'On my way, 10 min')).status, 201);
  for (const token of ['otherCustomerToken', 'otherDriverToken']) {
    assert.equal((await list(app, token)).status, 404, `${token} cannot read`);
    assert.equal((await send(app, token, 'hello')).status, 404, `${token} cannot send`);
    assert.equal((await as(token).post(app, `/api/bookings/${JOB}/block`)).status, 404, `${token} cannot block`);
  }
  assert.equal((await list(app, 'adminToken')).status, 403, 'admins read chats only through a report');
  assert.equal((await list(app, 'customerToken', undefined, 'not-a-uuid')).status, 404);
  assert.equal(messages.length, 2);
});

test('polling: newest page, then only messages after the cursor; unread count rides on the booking', async () => {
  const { app } = harness();
  await send(app, 'customerToken', 'One');
  await send(app, 'customerToken', 'Two');
  const page = await list(app, 'driverToken');
  assert.equal(page.status, 200);
  assert.deepEqual(page.body.messages.map((m) => [m.body, m.mine, m.senderRole]), [['One', false, 'customer'], ['Two', false, 'customer']]);
  assert.equal(page.body.state, 'open');
  assert.equal(page.body.unread, 2);
  assert.equal(page.body.maxLength, 1000);
  const cursor = page.body.cursor;
  assert.deepEqual((await list(app, 'driverToken', cursor)).body.messages, []);
  assert.equal((await list(app, 'driverToken', cursor)).body.cursor, cursor, 'cursor stays when nothing is new');
  await send(app, 'customerToken', 'Three');
  assert.deepEqual((await list(app, 'driverToken', cursor)).body.messages.map((m) => m.body), ['Three']);
  assert.equal((await list(app, 'driverToken', 'abc')).status, 400);

  // The driver's job poll carries the badge count; reading clears it, and the sender sees "read".
  assert.deepEqual((await as('driverToken').get(app, `/api/bookings/${JOB}`)).body.chat, { state: 'open', unread: 3, blockedByMe: false, readOnlyUntil: null });
  assert.equal((await as('driverToken').post(app, `/api/bookings/${JOB}/messages/read`, { upTo: '2' })).body.marked, 2);
  assert.equal((await as('driverToken').get(app, `/api/bookings/active`)).body.chat.unread, 1);
  assert.equal((await as('driverToken').post(app, `/api/bookings/${JOB}/messages/read`, {})).body.marked, 1);
  assert.equal((await as('driverToken').get(app, `/api/bookings/${JOB}`)).body.chat.unread, 0);
  assert.equal((await as('customerToken').get(app, `/api/bookings/${JOB}`)).body.chat.unread, 0, "your own messages are never unread for you");
  const mine = (await list(app, 'customerToken')).body.messages;
  assert.ok(mine.every((m) => m.mine && m.readAt), 'the sender sees when they were read');
});

test('privacy: messages never carry either person’s id, phone or email', async () => {
  const { app } = harness();
  await send(app, 'customerToken', 'Hi');
  await send(app, 'driverToken', 'Hello');
  for (const token of ['customerToken', 'driverToken']) {
    const body = JSON.stringify((await list(app, token)).body);
    for (const secret of ['customer-1', 'driver-1', '+12145550100', '+12145550199', 'casey@example.com', 'dana@example.com']) {
      assert.equal(body.includes(secret), false, `${token} chat leaked ${secret}`);
    }
    assert.deepEqual(Object.keys((await list(app, token)).body.messages[0]).sort(), ['body', 'createdAt', 'id', 'mine', 'readAt', 'senderRole', 'seq']);
  }
});

test('wrong state: no chat before a driver accepts; read-only for 24 h after the job ends, then hidden', async () => {
  const searching = harness();
  assert.equal((await list(searching.app, 'otherCustomerToken', undefined, SEARCHING)).status, 409);
  const refused = await send(searching.app, 'otherCustomerToken', 'anyone?', SEARCHING);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'chat_not_open');
  assert.deepEqual((await as('otherCustomerToken').get(searching.app, `/api/bookings/${SEARCHING}`)).body.chat.state, 'unavailable');

  const { app, bookings } = harness();
  await send(app, 'customerToken', 'Thanks!');
  bookings.set(JOB, { ...bookings.get(JOB), status: 'completed', completedAt: new Date(NOW - 3600000).toISOString() });
  const readOnly = await list(app, 'driverToken');
  assert.equal(readOnly.status, 200);
  assert.equal(readOnly.body.state, 'read_only');
  assert.equal(readOnly.body.readOnlyUntil, new Date(NOW + 23 * 3600000).toISOString());
  assert.equal(readOnly.body.messages.length, 1, 'history is still readable');
  const late = await send(app, 'driverToken', 'You too');
  assert.equal(late.status, 409);
  assert.equal(late.body.code, 'chat_read_only');

  bookings.set(JOB, { ...bookings.get(JOB), completedAt: new Date(NOW - 25 * 3600000).toISOString() });
  const hidden = await list(app, 'customerToken');
  assert.equal(hidden.status, 410);
  assert.equal(hidden.body.code, 'chat_closed');
  assert.equal(hidden.body.messages, undefined);
  assert.equal((await send(app, 'customerToken', 'hello?')).status, 410);
  assert.deepEqual((await as('customerToken').get(app, `/api/bookings/${JOB}`)).body.chat, { state: 'closed', unread: 0, blockedByMe: false, readOnlyUntil: new Date(NOW - 1 * 3600000).toISOString() });

  const cancelled = harness();
  cancelled.bookings.set(JOB, { ...cancelled.bookings.get(JOB), status: 'cancelled', cancelledAt: new Date(NOW - 60000).toISOString() });
  assert.equal((await list(cancelled.app, 'customerToken')).body.state, 'read_only');
});

test('validation and rate limit: empty or over-long messages are refused; 30 a minute per person', async () => {
  const { app, messages } = harness({ perMinute: 3 });
  assert.equal((await send(app, 'customerToken', '   ')).status, 400);
  assert.equal((await send(app, 'customerToken', 'x'.repeat(1001))).status, 400);
  for (let i = 0; i < 3; i += 1) assert.equal((await send(app, 'customerToken', `m${i}`)).status, 201);
  const limited = await send(app, 'customerToken', 'one more');
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, 'chat_rate_limited');
  assert.equal(limited.headers['retry-after'], '60', 'the app is told when it can send again');
  assert.equal((await send(app, 'driverToken', 'driver has their own limit')).status, 201);
  assert.equal(messages.length, 4);
});

test('a retried send with the same client id is stored once', async () => {
  const { app, messages } = harness();
  const first = await send(app, 'customerToken', { body: 'Are you close?', clientId: 'retry-abcdef12' });
  const again = await send(app, 'customerToken', { body: 'Are you close?', clientId: 'retry-abcdef12' });
  assert.equal(first.status, 201);
  assert.equal(again.status, 200);
  assert.equal(again.body.id, first.body.id);
  assert.equal(messages.length, 1);
});

test('blocking closes the chat for both, does not cancel the job, and gives guidance', async () => {
  const { app, bookings, blocks } = harness({ status: 'en_route' });
  await send(app, 'driverToken', 'Almost there');
  const blocked = await as('customerToken').post(app, `/api/bookings/${JOB}/block`, { blockedId: 'someone-else' });
  assert.equal(blocked.status, 201);
  assert.equal(blocked.body.blocked, true);
  assert.equal(blocked.body.chat.state, 'blocked');
  assert.equal(blocked.body.chat.blockedByMe, true);
  assert.match(blocked.body.guidance, /doesn't cancel this job/);
  assert.deepEqual(blocks[0], { blockerId: 'customer-1', blockerRole: 'customer', blockedId: 'driver-1', bookingId: JOB, bookingStatus: 'en_route' }, 'the other party comes from the job, not the body');
  assert.equal(bookings.get(JOB).status, 'en_route', 'the job is not cancelled');
  assert.equal((await as('customerToken').post(app, `/api/bookings/${JOB}/block`)).status, 200, 'blocking again is harmless');
  for (const token of ['customerToken', 'driverToken']) {
    const refused = await send(app, token, 'hello?');
    assert.equal(refused.status, 409, token);
    assert.equal(refused.body.code, 'chat_blocked');
  }
  const driverView = await list(app, 'driverToken');
  assert.equal(driverView.body.state, 'blocked');
  assert.equal(driverView.body.blockedByMe, false, 'the driver is not told who blocked');
  assert.equal(driverView.body.messages.length, 1, 'history stays readable (and for reports)');

  const noDriver = await as('otherCustomerToken').post(app, `/api/bookings/${SEARCHING}/block`);
  assert.equal(noDriver.status, 409, 'nobody to block before a driver accepts');
});

test('a block keeps the pair apart in dispatch: hidden from the request list and accept refused', async () => {
  const { app, bookings } = harness({ status: 'completed' });
  bookings.get(JOB).completedAt = new Date(NOW - 3600000).toISOString();
  // Customer-1 makes a new request; driver-1 sees it before the block.
  bookings.set(OTHER_REQUEST, { id: OTHER_REQUEST, customerId: 'customer-1', status: 'searching', service: { id: 'battery_jump' }, location: { ...DALLAS, address: '9 Elm' } });
  const before = await as('driverToken').get(app, '/api/drivers/requests');
  assert.deepEqual(before.body.requests.map((r) => r.id).sort(), [SEARCHING, OTHER_REQUEST].sort());

  // The driver blocks the customer from the finished job (a block works after the job too).
  assert.equal((await as('driverToken').post(app, `/api/bookings/${JOB}/block`)).status, 201);
  const after = await as('driverToken').get(app, '/api/drivers/requests');
  assert.deepEqual(after.body.requests.map((r) => r.id), [SEARCHING], "the blocked customer's request is hidden; others still show");
  const accept = await as('driverToken').post(app, `/api/bookings/${OTHER_REQUEST}/accept`);
  assert.equal(accept.status, 409);
  assert.equal(accept.body.error, 'Booking is no longer available', 'same answer as a taken request');
  assert.equal(bookings.get(OTHER_REQUEST).status, 'searching', 'the request stays open for other drivers');
  // Another driver can still take it.
  assert.ok((await as('otherDriverToken').get(app, '/api/drivers/requests')).body.requests.some((r) => r.id === OTHER_REQUEST));
  assert.equal((await as('otherDriverToken').post(app, `/api/bookings/${OTHER_REQUEST}/accept`)).status, 200);
});

test('a block by the customer also keeps that driver away', async () => {
  const { app, bookings } = harness({ status: 'in_progress' });
  assert.equal((await as('customerToken').post(app, `/api/bookings/${JOB}/block`)).status, 201);
  assert.match((await as('customerToken').post(app, `/api/bookings/${JOB}/block`)).body.guidance, /can't be cancelled in the app/);
  bookings.set(JOB, { ...bookings.get(JOB), status: 'completed', completedAt: new Date(NOW).toISOString() });
  bookings.set(OTHER_REQUEST, { id: OTHER_REQUEST, customerId: 'customer-1', status: 'searching', service: { id: 'battery_jump' }, location: { ...DALLAS, address: '9 Elm' } });
  assert.equal((await as('driverToken').get(app, '/api/drivers/requests')).body.requests.some((r) => r.id === OTHER_REQUEST), false);
  assert.equal((await as('driverToken').post(app, `/api/bookings/${OTHER_REQUEST}/accept`)).status, 409);
});

test('admins see the thread of a reported job (with names) — only admins, only through a report', async () => {
  const { app } = harness();
  await send(app, 'customerToken', 'Please hurry');
  await send(app, 'driverToken', 'Stuck in traffic');
  for (const token of ['customerToken', 'driverToken']) assert.equal((await as(token).get(app, `/api/admin/reports/${REPORT}/messages`)).status, 403);
  const thread = await as('adminToken').get(app, `/api/admin/reports/${REPORT}/messages`);
  assert.equal(thread.status, 200);
  assert.deepEqual(thread.body.messages.map((m) => [m.senderRole, m.senderName, m.body]), [['customer', 'Casey C', 'Please hurry'], ['driver', 'Dana D', 'Stuck in traffic']]);
  assert.equal((await as('adminToken').get(app, '/api/admin/reports/55555555-5555-4555-8555-555555555555/messages')).status, 404);
});

// ---- repository SQL ----

const poolWith = (handler) => ({ query: handler });

test('the message insert re-checks participant, job state and blocks in SQL, locking the job row', async () => {
  const calls = [];
  const repository = new PostgresRepository(poolWith(async (text, values) => { calls.push({ text, values }); return { rows: [] }; }));
  assert.equal(await repository.createJobMessage({ bookingId: JOB, senderId: 'customer-1', senderRole: 'customer', body: 'hi', clientId: null }), null);
  const { text, values } = calls[0];
  assert.match(text, /b\.customer_id = \$2::uuid and b\.driver_id is not null and b\.status = any\(\$6::text\[\]\)/);
  assert.match(text, /not exists \(select 1 from public\.user_blocks ub/);
  assert.match(text, /for update of b/);
  assert.match(text, /on conflict \(sender_id, client_id\) where client_id is not null do nothing/);
  assert.deepEqual(values[5], ['accepted', 'en_route', 'arrived', 'in_progress']);
  await repository.createJobMessage({ bookingId: JOB, senderId: 'driver-1', senderRole: 'driver', body: 'hi' });
  assert.match(calls[1].text, /b\.driver_id = \$2::uuid and b\.customer_id is not null/);
});

test('dispatch SQL filters blocked pairs in the list and in the atomic accept', async () => {
  const calls = [];
  const repository = new PostgresRepository(poolWith(async (text, values) => { calls.push({ text, values }); return { rows: [] }; }));
  await repository.listAvailableBookings({ serviceTypes: ['battery_jump'], electricTowing: false }, { minLat: 32, maxLat: 33, minLng: -97, maxLng: -96 }, 'driver-1');
  assert.match(calls[0].text, /\$10::uuid is null or not exists \(select 1 from public\.user_blocks ub where \(ub\.blocker_id = b\.customer_id and ub\.blocked_id = \$10::uuid\) or \(ub\.blocker_id = \$10::uuid and ub\.blocked_id = b\.customer_id\)\)/);
  assert.equal(calls[0].values[9], 'driver-1');
  await repository.acceptBooking(JOB, 'driver-1', { serviceTypes: ['battery_jump'], electricTowing: false });
  assert.match(calls[1].text, /and not exists \(select 1 from public\.user_blocks ub where \(ub\.blocker_id = b\.customer_id and ub\.blocked_id = \$2::uuid\)/);
});

test('participant message rows map to mine/theirs only — no sender id', async () => {
  const row = { id: 'm1', seq: '7', booking_id: JOB, sender_id: 'driver-1', sender_role: 'driver', body: 'Hi', client_id: 'c', created_at: new Date(NOW), read_at: null };
  const repository = new PostgresRepository(poolWith(async () => ({ rows: [row] })));
  const [message] = await repository.listJobMessages(JOB, 'customer-1', '6');
  assert.deepEqual(message, { id: 'm1', seq: '7', mine: false, senderRole: 'driver', body: 'Hi', createdAt: new Date(NOW).toISOString(), readAt: null });
});

// E3: the shared route limits must never trip during normal use. Both apps on one IP (e.g. a
// household or carrier NAT) for a full hour with the chat open, at the apps' real intervals.
test('an hour of normal polling by the customer and driver on one IP never hits a rate limit', { timeout: 120000 }, async () => {
  let now = NOW;
  const h = harness();
  h.repository.updateDriverLocation = async (bookingId) => h.bookings.get(bookingId);
  const { createApp: build } = require('../app');
  const auth = { async getUser(token) { const user = USERS[token]; return user ? { id: user.id, email: user.email, aal: 'aal2' } : null; } };
  const app = build({ auth, repository: h.repository, supportContact: { email: null, phone: null }, clock: () => now });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (token, path, method = 'GET', body) => fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  }).then(async (response) => { await response.arrayBuffer(); return response.status; });
  const statuses = [];
  try {
    for (let second = 0; second < 3600; second += 1) {
      const calls = [];
      if (second % 4 === 0) calls.push(call('customerToken', '/api/bookings/active')); // BOOKING_POLL_MS
      if (second % 5 === 0) calls.push(call('driverToken', '/api/bookings/active')); // DRIVER_JOB_POLL_MS
      if (second % 5 === 0) calls.push(call('driverToken', `/api/bookings/${JOB}/driver-location`, 'PATCH', { location: DALLAS })); // jobLocationSharing min interval
      if (second % 3 === 0) calls.push(call('customerToken', `/api/bookings/${JOB}/messages`)); // CHAT_POLL_MS
      if (second % 3 === 0) calls.push(call('driverToken', `/api/bookings/${JOB}/messages`));
      if (second % 30 === 0) calls.push(call('driverToken', `/api/drivers/requests?lat=${DALLAS.lat}&lng=${DALLAS.lng}`)); // request list
      if (second % 60 === 0) calls.push(call('customerToken', `/api/bookings/${JOB}/messages/read`, 'POST', {}));
      if (second % 120 === 0) calls.push(call('customerToken', `/api/bookings/${JOB}/messages`, 'POST', { body: 'Still coming?', clientId: `c-${second}` }));
      statuses.push(...await Promise.all(calls));
      now += 1000;
    }
  } finally {
    server.close();
  }
  assert.ok(statuses.length > 4000, `${statuses.length} requests`);
  assert.deepEqual(statuses.filter((status) => status === 429), [], 'nothing was rate limited');
  assert.deepEqual(statuses.filter((status) => status >= 500), [], 'no server errors');
});
