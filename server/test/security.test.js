// E3 / E8: rate limits, upload and body caps, security headers, CORS allowlist, request logs with
// redaction, and an error handler that never shows internals.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const { MemoryStore, createRateLimiter, rateLimitsFromEnv, DEFAULT_LIMITS } = require('../rateLimit');
const { redact, redactString, roundCoordinate } = require('../redact');
const { trustProxyFromEnv, corsOriginsFromEnv, securityConfigFromEnv, DEFAULT_CORS_ORIGINS } = require('../security');

const customerId = '11111111-1111-4111-8111-111111111111';
const driverId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const users = {
  'customer-token': { id: customerId, email: 'customer@example.com' },
  'driver-token': { id: driverId, email: 'driver@example.com' },
  'admin-token': { id: adminId, email: 'admin@example.com' },
};
const auth = { async getUser(token) { return users[token] || null; } };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function captureLogger() {
  const lines = [];
  const push = (level) => (entry) => lines.push({ level, ...entry });
  return { lines, info: push('info'), warn: push('warn'), error: push('error') };
}

const PROFILES = {
  [customerId]: { id: customerId, role: 'customer', status: 'active', firstName: 'Casey', lastName: 'Customer' },
  [driverId]: {
    id: driverId, role: 'driver', status: 'active', firstName: 'Drew', lastName: 'Driver', verificationStatus: 'verified', isOnline: true,
    credentialsValidUntil: '2099-01-01',
    driverVehicle: { make: 'Ford', model: 'F-150', year: 2022, color: 'White', plate: 'AID123', plateState: 'TX', equipmentType: 'flatbed' },
  },
  [adminId]: { id: adminId, role: 'admin', status: 'active', firstName: 'Ada', lastName: 'Admin' },
};

// Minimal repository: the routes under test only need these; anything else answers null.
function stubRepository() {
  const documents = [];
  const known = {
    requestExpiryMinutes: 15,
    async getProfile(id) { return PROFILES[id] || null; },
    async expireStaleBookings() { return { expired: [], released: [] }; },
    async getActiveBooking() { return null; },
    async createBooking(input) { return { id: '55555555-5555-4555-8555-555555555555', status: 'searching', ...input }; },
    async listDriverDocuments() { return documents; },
    async createDriverDocument(_driverId, input) { const doc = { id: `doc-${documents.length}`, status: 'pending', ...input }; documents.push(doc); return doc; },
    async getDriverPosition() { return null; },
    async updateDriverPosition() {},
  };
  return new Proxy(known, { get: (target, key) => (key in target ? target[key] : async () => null) });
}

function makeApp(options = {}) {
  let now = Date.parse('2026-10-22T12:00:00Z');
  const repository = stubRepository();
  const logger = captureLogger();
  const app = createApp({
    auth, repository, clock: () => now, logger,
    documentStorage: {
      async upload(id, file, type) { return `${id}/${type}/${file.originalname}`; },
      async signedUrl(path) { return `https://storage.example/${path}`; },
      async remove() {},
    },
    corsOrigin: 'capacitor://localhost,https://localhost,http://127.0.0.1:5173',
    ...options.app,
  });
  return { app, repository, logger, advance(ms) { now += ms; } };
}

// ---------- limiter unit ----------

test('memory store counts hits per key inside a fixed window and resets after it', () => {
  let now = 0;
  const store = new MemoryStore({ clock: () => now });
  assert.deepEqual(store.hit('a', 1000), { count: 1, resetAt: 1000 });
  assert.equal(store.hit('a', 1000).count, 2);
  assert.equal(store.hit('b', 1000).count, 1, 'keys are independent');
  now = 1000;
  assert.deepEqual(store.hit('a', 1000), { count: 1, resetAt: 2000 }, 'window rolls over');
  store.sweep();
  assert.equal(store.size(), 1, 'expired keys are swept');
});

test('limiter answers 429 with Retry-After seconds and a JSON error once the limit is passed', async () => {
  let now = 0;
  const express = require('express');
  const app = express();
  app.use(createRateLimiter({ name: 'demo', max: 2, windowMs: 60_000, store: new MemoryStore({ clock: () => now }), clock: () => now }));
  app.get('/', (_req, res) => res.json({ ok: true }));
  assert.equal((await request(app).get('/')).status, 200);
  const second = await request(app).get('/');
  assert.equal(second.status, 200);
  assert.equal(second.headers['ratelimit-limit'], '2');
  assert.equal(second.headers['ratelimit-remaining'], '0');
  now = 15_000;
  const third = await request(app).get('/');
  assert.equal(third.status, 429);
  assert.equal(third.headers['retry-after'], '45');
  assert.equal(third.body.code, 'rate_limited');
  assert.equal(third.body.retryAfterSeconds, 45);
  assert.match(third.body.error, /too many requests/i);
  now = 60_000;
  assert.equal((await request(app).get('/')).status, 200, 'allowed again after the window');
});

test('rate limits are configurable from env with sane fallbacks', () => {
  const limits = rateLimitsFromEnv({ RATE_LIMIT_GLOBAL_PER_MINUTE: '50', RATE_LIMIT_BOOKING_CREATE_PER_HOUR: 'nope' });
  assert.equal(limits.global.max, 50);
  assert.equal(limits.bookingCreate.max, DEFAULT_LIMITS.bookingCreate.max);
  assert.equal(rateLimitsFromEnv({ RATE_LIMITS_ENABLED: 'false' }).enabled, false);
  assert.equal(rateLimitsFromEnv({}).enabled, true);
});

// ---------- per-route limits through the real app ----------

test('booking create is limited per user and answers 429 with Retry-After', async () => {
  const { app } = makeApp({ app: { rateLimits: { ...rateLimitsFromEnv({}), bookingCreate: { max: 2, windowMs: 3_600_000 } } } });
  const body = { serviceType: 'battery_jump', location: { address: '1 Main', lat: 32.7, lng: -96.8 } };
  assert.equal((await request(app).post('/api/bookings').set('Authorization', 'Bearer customer-token').send(body)).status, 201);
  assert.equal((await request(app).post('/api/bookings').set('Authorization', 'Bearer customer-token').send(body)).status, 201);
  const third = await request(app).post('/api/bookings').set('Authorization', 'Bearer customer-token').send(body);
  assert.equal(third.status, 429);
  assert.ok(Number(third.headers['retry-after']) > 0);
  assert.equal(third.body.code, 'rate_limited');
});

test('route limits are per user, not shared across accounts', async () => {
  const { app } = makeApp({ app: { rateLimits: { ...rateLimitsFromEnv({}), ratings: { max: 1, windowMs: 3_600_000 } } } });
  const bookingId = '44444444-4444-4444-8444-444444444444';
  await request(app).post(`/api/bookings/${bookingId}/rating`).set('Authorization', 'Bearer customer-token').send({ stars: 5 });
  assert.equal((await request(app).post(`/api/bookings/${bookingId}/rating`).set('Authorization', 'Bearer customer-token').send({ stars: 5 })).status, 429);
  assert.notEqual((await request(app).post(`/api/bookings/${bookingId}/rating`).set('Authorization', 'Bearer driver-token').send({ stars: 5 })).status, 429);
});

test('global per-IP ceiling applies to unauthenticated requests too', async () => {
  const { app } = makeApp({ app: { rateLimits: { ...rateLimitsFromEnv({}), global: { max: 3, windowMs: 60_000 } } } });
  for (let i = 0; i < 3; i += 1) assert.equal((await request(app).get('/api/services')).status, 200);
  const over = await request(app).get('/api/services');
  assert.equal(over.status, 429);
  assert.ok(over.headers['retry-after']);
  assert.equal((await request(app).get('/health')).status, 200, 'health checks are never limited');
});

// ---------- trust proxy ----------

test('trust proxy is off by default and only set from env', () => {
  assert.equal(trustProxyFromEnv({}), false);
  assert.equal(trustProxyFromEnv({ TRUST_PROXY: 'false' }), false);
  assert.equal(trustProxyFromEnv({ TRUST_PROXY: '1' }), 1);
  assert.equal(trustProxyFromEnv({ TRUST_PROXY: 'true' }), 1, '"true" means one hop, never trust-everything');
  assert.equal(trustProxyFromEnv({ TRUST_PROXY: 'loopback, 10.0.0.0/8' }), 'loopback, 10.0.0.0/8');
});

test('X-Forwarded-For is ignored unless trust proxy is set', async () => {
  const limits = { ...rateLimitsFromEnv({}), global: { max: 1, windowMs: 60_000 } };
  const off = makeApp({ app: { rateLimits: limits } }).app;
  await request(off).get('/api/services').set('X-Forwarded-For', '203.0.113.1');
  assert.equal((await request(off).get('/api/services').set('X-Forwarded-For', '203.0.113.2')).status, 429, 'spoofed header does not dodge the limit');
  const on = makeApp({ app: { rateLimits: limits, trustProxy: 1 } }).app;
  await request(on).get('/api/services').set('X-Forwarded-For', '203.0.113.1');
  assert.equal((await request(on).get('/api/services').set('X-Forwarded-For', '203.0.113.2')).status, 200, 'behind a proxy each client IP has its own budget');
});

// ---------- headers ----------

test('API responses carry strict security headers and no x-powered-by', async () => {
  const { app } = makeApp();
  const response = await request(app).get('/api/services');
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(response.headers['content-security-policy'], "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['cross-origin-opener-policy'], 'same-origin');
  assert.equal(response.headers['cross-origin-resource-policy'], 'same-origin');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['strict-transport-security'], undefined, 'no HSTS unless enabled');
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});

test('HSTS is sent only when enabled for an HTTPS deployment', async () => {
  const { app } = makeApp({ app: { hsts: { enabled: true, maxAgeSeconds: 31536000 } } });
  assert.equal((await request(app).get('/health')).headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
  const config = securityConfigFromEnv({ HSTS_ENABLED: 'true' });
  assert.equal(config.hsts.enabled, true);
  assert.equal(securityConfigFromEnv({}).hsts.enabled, false);
});

// ---------- CORS ----------

test('CORS allows listed origins (native app, admin, dev) and exposes request id + Retry-After', async () => {
  const { app } = makeApp();
  for (const origin of ['capacitor://localhost', 'https://localhost', 'http://127.0.0.1:5173']) {
    const response = await request(app).get('/api/services').set('Origin', origin);
    assert.equal(response.status, 200, origin);
    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.match(response.headers['access-control-expose-headers'], /X-Request-Id/);
    assert.match(response.headers['access-control-expose-headers'], /Retry-After/);
  }
  const preflight = await request(app).options('/api/bookings').set('Origin', 'capacitor://localhost').set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,content-type');
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers['access-control-allow-headers'], /Authorization/);
});

test('CORS rejects unlisted origins with 403 before touching any route', async () => {
  const { app } = makeApp();
  const response = await request(app).post('/api/bookings').set('Origin', 'https://evil.example').set('Authorization', 'Bearer customer-token').send({});
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'origin_not_allowed');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  const preflight = await request(app).options('/api/bookings').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
  assert.equal(preflight.status, 403);
  assert.equal((await request(app).get('/api/services')).status, 200, 'no Origin (native HTTP, curl, Stripe) is allowed');
});

test('default CORS allowlist covers the iOS/Android apps and local dev sites', () => {
  for (const origin of ['capacitor://localhost', 'https://localhost', 'http://localhost', 'ionic://localhost', 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:3000']) {
    assert.ok(DEFAULT_CORS_ORIGINS.includes(origin), origin);
  }
  assert.deepEqual(corsOriginsFromEnv({ CORS_ORIGIN: ' https://admin.aid.app , capacitor://localhost ' }), ['https://admin.aid.app', 'capacitor://localhost']);
  assert.deepEqual(corsOriginsFromEnv({}), DEFAULT_CORS_ORIGINS);
});

// ---------- body / upload caps ----------

test('JSON bodies over the limit get 413 and malformed JSON gets 400, never 500', async () => {
  const { app } = makeApp();
  const big = await request(app).post('/api/bookings').set('Authorization', 'Bearer customer-token').set('Content-Type', 'application/json').send(JSON.stringify({ pad: 'x'.repeat(200 * 1024) }));
  assert.equal(big.status, 413);
  assert.match(big.body.error, /too large/i);
  const broken = await request(app).post('/api/bookings').set('Authorization', 'Bearer customer-token').set('Content-Type', 'application/json').send('{"nope":');
  assert.equal(broken.status, 400);
  assert.match(broken.body.error, /JSON/);
});

test('document uploads over the size cap get 413; wrong type or content gets 400', async () => {
  const { app } = makeApp({ app: { documentMaxBytes: 1024 } });
  const tooBig = await request(app).post('/api/drivers/me/documents').set('Authorization', 'Bearer driver-token')
    .field('type', 'identification').attach('file', Buffer.concat([PNG, Buffer.alloc(2048)]), { filename: 'id.png', contentType: 'image/png' });
  assert.equal(tooBig.status, 413);
  assert.match(tooBig.body.error, /1 KB|too large/i);
  const exe = await request(app).post('/api/drivers/me/documents').set('Authorization', 'Bearer driver-token')
    .field('type', 'identification').attach('file', Buffer.from('MZ\x90\x00'), { filename: 'id.exe', contentType: 'application/octet-stream' });
  assert.equal(exe.status, 400);
  const fake = await request(app).post('/api/drivers/me/documents').set('Authorization', 'Bearer driver-token')
    .field('type', 'identification').attach('file', Buffer.from('not really a png'), { filename: 'id.png', contentType: 'image/png' });
  assert.equal(fake.status, 400, 'magic bytes are checked, not just the declared type');
  const ok = await request(app).post('/api/drivers/me/documents').set('Authorization', 'Bearer driver-token')
    .field('type', 'identification').attach('file', PNG, { filename: 'id.png', contentType: 'image/png' });
  assert.equal(ok.status, 201);
});

test('document uploads are rate limited per driver', async () => {
  const { app } = makeApp({ app: { rateLimits: { ...rateLimitsFromEnv({}), documentUpload: { max: 1, windowMs: 3_600_000 } } } });
  const send = () => request(app).post('/api/drivers/me/documents').set('Authorization', 'Bearer driver-token')
    .field('type', 'identification').attach('file', PNG, { filename: 'id.png', contentType: 'image/png' });
  assert.equal((await send()).status, 201);
  assert.equal((await send()).status, 429);
});

// ---------- redaction ----------

test('redact hides secrets, contact details, message bodies and exact coordinates', () => {
  const out = redact({
    headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc', cookie: 'sb=1' },
    password: 'hunter2', access_token: 'tok', refresh_token: 'r', stripeSignature: 'sig', apiKey: 'k', client_secret: 'pi_secret',
    email: 'a@b.com', phone: '+12145550100',
    body: 'meet me at the gas station', message: 'my number is 214-555-0100', note: 'n', comment: 'c',
    location: { address: '123 Main St', lat: 32.776664, lng: -96.796988 },
    nested: [{ latitude: 30.267153, longitude: -97.743057 }],
    status: 'accepted', count: 3,
  });
  assert.equal(out.headers.authorization, '[REDACTED]');
  assert.equal(out.headers.cookie, '[REDACTED]');
  for (const key of ['password', 'access_token', 'refresh_token', 'stripeSignature', 'apiKey', 'client_secret', 'email', 'phone']) assert.equal(out[key], '[REDACTED]', key);
  for (const key of ['body', 'message', 'note', 'comment']) assert.match(out[key], /^\[REDACTED \d+ chars\]$/, key);
  assert.equal(out.location.address, '[REDACTED]');
  assert.equal(out.location.lat, 32.78);
  assert.equal(out.location.lng, -96.8);
  assert.deepEqual(out.nested[0], { latitude: 30.27, longitude: -97.74 });
  assert.equal(out.status, 'accepted');
  assert.equal(out.count, 3);
});

test('redactString scrubs tokens, emails, phone numbers and coordinate pairs inside free text', () => {
  const text = redactString('duplicate key (email)=(casey@example.com) phone +1 (214) 555-0100 token Bearer abc.def.ghi jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig at 32.776664,-96.796988 booking 44444444-4444-4444-8444-444444444444');
  assert.doesNotMatch(text, /casey@example\.com/);
  assert.doesNotMatch(text, /555-0100/);
  assert.doesNotMatch(text, /abc\.def\.ghi/);
  assert.doesNotMatch(text, /eyJhbGci/);
  assert.doesNotMatch(text, /32\.776664/);
  assert.match(text, /44444444-4444-4444-8444-444444444444/, 'ids stay so logs remain useful');
  assert.equal(roundCoordinate(32.776664), 32.78);
});

// ---------- request logging ----------

test('every request is logged once with method, route pattern, status, duration, request id — and nothing sensitive', async () => {
  const { app, logger } = makeApp();
  const response = await request(app).get('/api/drivers/requests?lat=32.776664&lng=-96.796988&email=a@b.com').set('Authorization', 'Bearer driver-token').set('X-Request-Id', 'client-req-12345');
  assert.equal(response.headers['x-request-id'], 'client-req-12345', 'a sane incoming id is echoed');
  const entry = logger.lines.find((line) => line.msg === 'request');
  assert.ok(entry);
  assert.equal(entry.method, 'GET');
  assert.equal(entry.route, '/api/drivers/requests');
  assert.equal(entry.path, '/api/drivers/requests', 'query string (coordinates, emails) is dropped');
  assert.equal(entry.status, response.status);
  assert.equal(typeof entry.durationMs, 'number');
  assert.equal(entry.requestId, 'client-req-12345');
  assert.equal(entry.userId, driverId);
  const serialized = JSON.stringify(logger.lines);
  for (const secret of ['driver-token', '32.776664', 'a@b.com', 'driver@example.com']) assert.equal(serialized.includes(secret), false, secret);
});

test('route patterns hide ids and a bad incoming request id is replaced', async () => {
  const { app, logger } = makeApp();
  const response = await request(app).get('/api/bookings/44444444-4444-4444-8444-444444444444').set('Authorization', 'Bearer customer-token').set('X-Request-Id', 'bad id <with spaces>');
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/);
  const entry = logger.lines.find((line) => line.msg === 'request');
  assert.equal(entry.route, '/api/bookings/:bookingId');
});

// ---------- error handler ----------

test('unexpected errors return a generic message with the request id; the stack is logged redacted server-side', async () => {
  const { app, repository, logger } = makeApp();
  repository.listVehicles = async () => { const error = new Error('connect ECONNREFUSED db.internal:5432 for casey@example.com'); error.detail = 'Key (phone)=(+12145550100)'; throw error; };
  const response = await request(app).get('/api/vehicles').set('Authorization', 'Bearer customer-token');
  assert.equal(response.status, 500);
  assert.deepEqual(Object.keys(response.body).sort(), ['error', 'requestId']);
  assert.equal(response.body.requestId, response.headers['x-request-id']);
  assert.doesNotMatch(JSON.stringify(response.body), /ECONNREFUSED|db\.internal|stack|casey/);
  const logged = logger.lines.find((line) => line.level === 'error');
  assert.ok(logged, 'error is logged');
  assert.equal(logged.requestId, response.body.requestId);
  assert.match(logged.error.stack, /ECONNREFUSED/);
  assert.doesNotMatch(JSON.stringify(logged), /casey@example\.com|2145550100/);
});

test('unknown routes answer JSON 404 without echoing the path', async () => {
  const { app } = makeApp();
  const response = await request(app).get('/api/nope/<script>');
  assert.equal(response.status, 404);
  assert.deepEqual(Object.keys(response.body).sort(), ['error', 'requestId']);
  assert.doesNotMatch(response.text, /script/);
});
