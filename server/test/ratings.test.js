// B15: ratings both directions — rules, API and repository.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const { PostgresRepository, RatingExistsError, mapParticipantBooking } = require('../repository');
const {
  RATING_WINDOW_DAYS, MIN_RATINGS_TO_SHOW, COMMENT_MAX, RATING_TAGS, cleanRating, checkCanRate, publicRating, ratingDeadline,
} = require('../ratings');

const DAY = 86400000;
const USERS = {
  customerToken: { id: 'customer-1', role: 'customer', status: 'active', firstName: 'Casey' },
  otherCustomerToken: { id: 'customer-2', role: 'customer', status: 'active', firstName: 'Olive' },
  driverToken: { id: 'driver-1', role: 'driver', status: 'active', verificationStatus: 'verified', firstName: 'Marcus' },
  otherDriverToken: { id: 'driver-2', role: 'driver', status: 'active', verificationStatus: 'verified', firstName: 'Dana' },
  adminToken: { id: 'admin-1', role: 'admin', status: 'active', firstName: 'Ada' },
};

function harness({ now = Date.now() } = {}) {
  const bookings = new Map([
    ['done', { id: 'done', customerId: 'customer-1', driverId: 'driver-1', status: 'completed', completedAt: new Date(now - 60000), service: { name: 'Towing' } }],
    ['active', { id: 'active', customerId: 'customer-1', driverId: 'driver-1', status: 'in_progress', service: { name: 'Lockout' } }],
    ['cancelled', { id: 'cancelled', customerId: 'customer-1', driverId: 'driver-1', status: 'cancelled', service: { name: 'Flat tire' } }],
    ['old', { id: 'old', customerId: 'customer-1', driverId: 'driver-1', status: 'completed', completedAt: new Date(now - (RATING_WINDOW_DAYS + 1) * DAY), service: { name: 'Fuel delivery' } }],
    // A driver who deleted their account: the customer keeps the job, but there's no one to rate.
    ['orphan', { id: 'orphan', customerId: 'customer-1', driverId: undefined, status: 'completed', completedAt: new Date(now - 60000), service: { name: 'Battery' } }],
  ]);
  const ratings = [];
  const repository = {
    async getProfile(id) { return Object.values(USERS).find((user) => user.id === id) || null; },
    async getBooking(bookingId, userId, role) {
      const booking = bookings.get(bookingId);
      if (!booking) return null;
      if (role === 'customer') return booking.customerId === userId ? booking : null;
      if (role === 'driver') return booking.driverId === userId ? booking : null;
      return null;
    },
    async hasRated(bookingId, raterId) { return ratings.some((r) => r.bookingId === bookingId && r.raterId === raterId); },
    // Mirrors the unique constraint (booking, rater).
    async createRating(input) {
      if (ratings.some((r) => r.bookingId === input.bookingId && r.raterId === input.raterId)) throw new RatingExistsError();
      ratings.push(input);
      return { bookingId: input.bookingId, role: input.raterRole, stars: input.stars, tags: input.tags, createdAt: new Date(now).toISOString() };
    },
    async listPendingRatings(userId, role) {
      return [...bookings.values()]
        .filter((b) => b.status === 'completed' && (role === 'customer' ? b.customerId === userId && b.driverId : b.driverId === userId && b.customerId))
        .filter((b) => now - b.completedAt.getTime() < RATING_WINDOW_DAYS * DAY)
        .filter((b) => !ratings.some((r) => r.bookingId === b.id && r.raterId === userId))
        .map((b) => ({ bookingId: b.id, serviceName: b.service.name, completedAt: b.completedAt.toISOString(), rateeFirstName: role === 'customer' ? 'Marcus' : 'Casey' }));
    },
  };
  const auth = { async getUser(token) { const user = USERS[token]; return user ? { id: user.id } : null; } };
  return { app: createApp({ auth, repository }), repository, ratings, bookings };
}

const rate = (app, token, bookingId, body) => request(app).post(`/api/bookings/${bookingId}/rating`).set('Authorization', `Bearer ${token}`).send(body);

// ---- rules ----

test('rules: stars must be a whole number 1–5', () => {
  for (const stars of [0, 6, 4.5, '5', null, undefined, -1]) assert.equal(cleanRating({ stars }, 'customer').ok, false, `stars ${stars}`);
  for (const stars of [1, 2, 3, 4, 5]) assert.equal(cleanRating({ stars }, 'customer').ok, true);
  assert.equal(cleanRating({ stars: 5 }, 'customer').rating.comment, null);
});

test('rules: comment is optional, trimmed, and at most 500 characters', () => {
  assert.equal(cleanRating({ stars: 4, comment: '  great  ' }, 'customer').rating.comment, 'great');
  assert.equal(cleanRating({ stars: 4, comment: '   ' }, 'customer').rating.comment, null);
  assert.equal(cleanRating({ stars: 4, comment: 'x'.repeat(COMMENT_MAX) }, 'customer').ok, true);
  const long = cleanRating({ stars: 4, comment: 'x'.repeat(COMMENT_MAX + 1) }, 'customer');
  assert.equal(long.ok, false);
  assert.equal(long.field, 'comment');
  assert.equal(cleanRating({ stars: 4, comment: 42 }, 'customer').ok, false);
});

test('rules: tags come from the fixed list for each direction', () => {
  assert.deepEqual(RATING_TAGS.customer.map((t) => t.label), ['On time', 'Professional', 'Careful with vehicle', 'Friendly']);
  assert.deepEqual(RATING_TAGS.driver.map((t) => t.label), ['Clear location', 'Ready on arrival', 'Respectful']);
  assert.deepEqual(cleanRating({ stars: 5, tags: ['friendly', 'on_time', 'friendly'] }, 'customer').rating.tags, ['on_time', 'friendly'], 'fixed order, no repeats');
  assert.equal(cleanRating({ stars: 5, tags: ['clear_location'] }, 'customer').ok, false, "a driver→customer tag can't describe a driver");
  assert.equal(cleanRating({ stars: 5, tags: ['on_time'] }, 'driver').ok, false);
  assert.deepEqual(cleanRating({ stars: 5, tags: ['respectful'] }, 'driver').rating.tags, ['respectful']);
  assert.equal(cleanRating({ stars: 5, tags: 'on_time' }, 'customer').ok, false);
  assert.equal(cleanRating({ stars: 5, tags: [{}] }, 'customer').ok, false);
  assert.equal(cleanRating({ stars: 5 }, 'admin').ok, false);
});

test('rules: only a participant of a completed job, within the window, never yourself', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const booking = { status: 'completed', customerId: 'c', driverId: 'd', completedAt: new Date(now - DAY) };
  assert.deepEqual(checkCanRate({ role: 'customer', userId: 'c', booking, now }), { ok: true, rateeId: 'd' });
  assert.deepEqual(checkCanRate({ role: 'driver', userId: 'd', booking, now }), { ok: true, rateeId: 'c' });
  assert.equal(checkCanRate({ role: 'customer', userId: 'x', booking, now }).status, 404);
  assert.equal(checkCanRate({ role: 'customer', userId: 'c', booking: null, now }).status, 404);
  assert.equal(checkCanRate({ role: 'customer', userId: 'c', booking: { ...booking, status: 'in_progress' }, now }).code, 'rating_not_completed');
  assert.equal(checkCanRate({ role: 'customer', userId: 'c', booking: { ...booking, completedAt: new Date(now - 8 * DAY) }, now }).code, 'rating_window_closed');
  assert.equal(checkCanRate({ role: 'customer', userId: 'c', booking: { ...booking, completedAt: new Date(now - 7 * DAY + 1000) }, now }).ok, true, 'still open just inside 7 days');
  assert.equal(checkCanRate({ role: 'customer', userId: 'c', booking: { ...booking, completedAt: undefined }, now }).code, 'rating_window_closed');
  assert.equal(checkCanRate({ role: 'customer', userId: 'c', booking: { ...booking, customerId: 'c', driverId: 'c' }, now }).status, 400, 'self');
  assert.equal(checkCanRate({ role: 'admin', userId: 'c', booking, now }).status, 403);
  assert.equal(ratingDeadline('2026-10-01T00:00:00.000Z'), '2026-10-08T00:00:00.000Z');
});

test('aggregates: an average shows only from 3 ratings, rounded to one decimal', () => {
  assert.equal(MIN_RATINGS_TO_SHOW, 3);
  assert.deepEqual(publicRating(null, 0), { rating: null, ratingCount: 0 });
  assert.deepEqual(publicRating('5.0000', 2), { rating: null, ratingCount: 2 });
  assert.deepEqual(publicRating('4.6667', 3), { rating: 4.7, ratingCount: 3 });
  assert.deepEqual(publicRating(4.25, 40), { rating: 4.3, ratingCount: 40 });
  assert.deepEqual(publicRating(undefined, undefined), { rating: null, ratingCount: 0 });
});

// ---- API ----

test('API: customer rates the driver and the driver rates the customer, once each', async () => {
  const { app, ratings } = harness();
  const byCustomer = await rate(app, 'customerToken', 'done', { stars: 5, tags: ['on_time', 'friendly'], comment: 'Quick and kind' });
  assert.equal(byCustomer.status, 201);
  assert.deepEqual(Object.keys(byCustomer.body).sort(), ['bookingId', 'createdAt', 'role', 'stars', 'tags']);
  const byDriver = await rate(app, 'driverToken', 'done', { stars: 4, tags: ['clear_location'] });
  assert.equal(byDriver.status, 201);
  assert.deepEqual(ratings.map((r) => [r.raterId, r.raterRole, r.rateeId, r.stars]), [['customer-1', 'customer', 'driver-1', 5], ['driver-1', 'driver', 'customer-1', 4]]);
  assert.equal(ratings[0].comment, 'Quick and kind');
  assert.equal(ratings[1].comment, null);
});

test('API: a duplicate rating is refused (pre-check and racing submits)', async () => {
  const { app } = harness();
  assert.equal((await rate(app, 'customerToken', 'done', { stars: 5 })).status, 201);
  const again = await rate(app, 'customerToken', 'done', { stars: 1 });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'already_rated');
  // Two submits at once: both pass the pre-check, the unique constraint lets one land.
  const { app: raceApp, ratings } = harness();
  const responses = await Promise.all([rate(raceApp, 'driverToken', 'done', { stars: 5 }), rate(raceApp, 'driverToken', 'done', { stars: 4 })]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal(ratings.length, 1);
});

test('API: non-participants are refused', async () => {
  const { app, ratings } = harness();
  assert.equal((await rate(app, 'otherCustomerToken', 'done', { stars: 1 })).status, 404);
  assert.equal((await rate(app, 'otherDriverToken', 'done', { stars: 1 })).status, 404);
  assert.equal((await rate(app, 'adminToken', 'done', { stars: 1 })).status, 403);
  assert.equal((await rate(app, 'customerToken', 'missing', { stars: 1 })).status, 404);
  assert.equal((await request(app).post('/api/bookings/done/rating').send({ stars: 5 })).status, 401);
  assert.equal(ratings.length, 0);
});

test('API: only completed jobs, only within 7 days, only with someone to rate', async () => {
  const { app, ratings } = harness();
  for (const id of ['active', 'cancelled']) {
    const response = await rate(app, 'customerToken', id, { stars: 3 });
    assert.equal(response.status, 409, id);
    assert.equal(response.body.code, 'rating_not_completed');
  }
  const late = await rate(app, 'customerToken', 'old', { stars: 3 });
  assert.equal(late.status, 409);
  assert.equal(late.body.code, 'rating_window_closed');
  const orphan = await rate(app, 'customerToken', 'orphan', { stars: 3 });
  assert.equal(orphan.status, 409);
  assert.equal(orphan.body.code, 'rating_no_ratee');
  assert.equal(ratings.length, 0);
});

test('API: invalid stars, comment or tags are refused with the field', async () => {
  const { app, ratings } = harness();
  for (const [body, field] of [
    [{ stars: 0 }, 'stars'], [{ stars: 6 }, 'stars'], [{ stars: 3.5 }, 'stars'], [{}, 'stars'],
    [{ stars: 3, comment: 'x'.repeat(501) }, 'comment'], [{ stars: 3, tags: ['respectful'] }, 'tags'], [{ stars: 3, tags: ['made_up'] }, 'tags'],
  ]) {
    const response = await rate(app, 'customerToken', 'done', body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(response.body.field, field);
  }
  assert.equal(ratings.length, 0);
});

test('API: pending ratings list what you can still rate, with your tag choices — and no comments', async () => {
  const { app } = harness();
  const before = await request(app).get('/api/ratings/pending').set('Authorization', 'Bearer customerToken');
  assert.equal(before.status, 200);
  assert.deepEqual(before.body.map((p) => p.bookingId), ['done'], 'not active, cancelled, too old, or with no driver');
  assert.equal(before.body[0].rateeRole, 'driver');
  assert.equal(before.body[0].rateeFirstName, 'Marcus');
  assert.deepEqual(before.body[0].tags, RATING_TAGS.customer);
  assert.equal(before.body[0].commentMaxLength, 500);
  assert.equal(before.body[0].rateBy, ratingDeadline(before.body[0].completedAt));
  const driverSide = await request(app).get('/api/ratings/pending').set('Authorization', 'Bearer driverToken');
  assert.deepEqual(driverSide.body.map((p) => [p.bookingId, p.rateeRole]), [['done', 'customer']]);
  assert.deepEqual(driverSide.body[0].tags, RATING_TAGS.driver);

  await rate(app, 'customerToken', 'done', { stars: 2, comment: 'PRIVATE-NOTE' });
  const after = await request(app).get('/api/ratings/pending').set('Authorization', 'Bearer customerToken');
  assert.deepEqual(after.body, [], 'gone once rated');
  const forDriver = await request(app).get('/api/ratings/pending').set('Authorization', 'Bearer driverToken');
  assert.doesNotMatch(JSON.stringify(forDriver.body), /PRIVATE-NOTE/, 'the person rated never sees the comment');
  assert.deepEqual((await request(app).get('/api/ratings/pending').set('Authorization', 'Bearer adminToken')).body, []);
});

// ---- repository ----

test('repository: the insert re-checks completed + participants + window, and a duplicate is RatingExistsError', async () => {
  const calls = [];
  const repository = new PostgresRepository({ query: async (text, values) => { calls.push({ text, values }); return { rows: [] }; } });
  const input = { bookingId: 'b1', raterId: 'c1', raterRole: 'customer', rateeId: 'd1', stars: 5, comment: null, tags: ['on_time'] };
  assert.equal(await repository.createRating(input), null, 'conditions not met → nothing stored');
  assert.match(calls[0].text, /insert into public\.ratings/);
  assert.match(calls[0].text, /b\.status = 'completed'/);
  assert.match(calls[0].text, /b\.completed_at > now\(\) - make_interval\(days => \$8::int\)/);
  assert.match(calls[0].text, /b\.customer_id = \$2::uuid and b\.driver_id = \$4::uuid/);
  assert.doesNotMatch(calls[0].text, /returning[^;]*comment/, 'the comment is not echoed back');
  assert.deepEqual(calls[0].values, ['b1', 'c1', 'customer', 'd1', 5, null, ['on_time'], 7]);

  const duplicate = new PostgresRepository({ query: async () => { throw Object.assign(new Error('dup'), { code: '23505', constraint: 'ratings_one_per_rater' }); } });
  await assert.rejects(duplicate.createRating(input), RatingExistsError);
});

test('repository: aggregates come from the ratings table; booking views never carry comments', async () => {
  const queries = [];
  const repository = new PostgresRepository({ query: async (text) => { queries.push(text); return { rows: [] }; } });
  await repository.getBooking('b1', 'c1', 'customer');
  await repository.getProfile('d1');
  const sql = queries.join('\n');
  assert.match(sql, /avg\(r\.stars\).*from public\.ratings r where r\.ratee_id = b\.driver_id/);
  assert.match(sql, /from public\.ratings r where r\.ratee_id = b\.customer_id/);
  assert.match(sql, /from public\.ratings r where r\.ratee_id = p\.id/);
  assert.doesNotMatch(sql, /comment/i, 'participant and profile queries never select comments');
  assert.doesNotMatch(sql, /dp\.rating|dp\.total_jobs/, 'the legacy always-zero columns are no longer read');

  const row = {
    id: 'b1', customer_id: 'c1', driver_id: 'd1', status: 'completed', service_type: 'towing', service_name: 'Towing', estimated_price_cents: 9500,
    location_address: 'x', location_lat: 1, location_lng: 1, created_at: new Date(), party_driver_first_name: 'Marcus', party_driver_last_name: 'T',
    party_driver_rating_avg: '4.333', party_driver_rating_count: 3, party_driver_completed_jobs: 9, comment: 'should never appear',
  };
  const view = mapParticipantBooking(row, 'customer');
  assert.equal(view.driver.rating, 4.3);
  assert.equal(view.driver.ratingCount, 3);
  assert.equal(view.driver.totalJobs, 9);
  assert.doesNotMatch(JSON.stringify(view), /should never appear/);
});

test('repository: admins get the true average, the count and recent low ratings with comments', async () => {
  const repository = new PostgresRepository({
    query: async (text, values) => {
      if (/round\(avg\(stars\)/.test(text)) return { rows: [{ average: '2.50', n: 4 }] };
      assert.deepEqual(values, ['d1', 2]);
      return { rows: [{ booking_id: 'b9', stars: 1, comment: 'Scratched my bumper', tags: [], created_at: new Date('2026-10-20T10:00:00Z'), service_name: 'Towing', rater_first_name: 'Casey' }] };
    },
  });
  const summary = await repository.getRatingsForAdmin('d1');
  assert.equal(summary.average, 2.5, 'admins see the average even below the public minimum');
  assert.equal(summary.count, 4);
  assert.equal(summary.recentLow[0].comment, 'Scratched my bumper');
  assert.equal(summary.recentLow[0].createdAt, '2026-10-20T10:00:00.000Z');
});

test('repository: pending ratings exclude rated, old and orphaned jobs in SQL', async () => {
  let captured;
  const repository = new PostgresRepository({ query: async (text, values) => { captured = { text, values }; return { rows: [{ id: 'b1', service_name: 'Towing', completed_at: new Date('2026-10-21T00:00:00Z'), ratee_first_name: 'Marcus' }] }; } });
  const pending = await repository.listPendingRatings('c1', 'customer');
  assert.match(captured.text, /b\.customer_id = \$1 and b\.status = 'completed' and b\.driver_id is not null/);
  assert.match(captured.text, /not exists \(select 1 from public\.ratings r where r\.booking_id = b\.id and r\.rater_id = \$1\)/);
  assert.deepEqual(captured.values, ['c1', 7]);
  assert.deepEqual(pending, [{ bookingId: 'b1', serviceName: 'Towing', completedAt: '2026-10-21T00:00:00.000Z', rateeFirstName: 'Marcus' }]);
});
