// B18: help & support reports — rules, API (participant check, categories, rate limit, admin-only
// access, status transitions) and repository SQL shape.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const { PostgresRepository } = require('../repository');
const {
  CATEGORIES, ALL_CATEGORIES, TRANSITIONS, MESSAGE_MAX, REPORTS_PER_HOUR, LEGACY_ISSUE_CATEGORIES,
  cleanReport, checkAdminUpdate, supportContactFromEnv, categoriesFor,
} = require('../support');

const JOB = '11111111-1111-4111-8111-111111111111';
const OTHER_JOB = '22222222-2222-4222-8222-222222222222';
const REPORT = '33333333-3333-4333-8333-333333333333';
const USERS = {
  customerToken: { id: 'customer-1', role: 'customer', status: 'active' },
  otherCustomerToken: { id: 'customer-2', role: 'customer', status: 'active' },
  driverToken: { id: 'driver-1', role: 'driver', status: 'active', verificationStatus: 'verified' },
  pendingDriverToken: { id: 'driver-2', role: 'driver', status: 'active', verificationStatus: 'pending' },
  adminToken: { id: 'admin-1', role: 'admin', status: 'active' },
};

function harness({ contact } = {}) {
  const bookings = new Map([
    [JOB, { id: JOB, customerId: 'customer-1', driverId: 'driver-1', status: 'in_progress' }],
    [OTHER_JOB, { id: OTHER_JOB, customerId: 'customer-2', driverId: null, status: 'completed' }],
  ]);
  const reports = [];
  const repository = {
    async getProfile(id) { return Object.values(USERS).find((user) => user.id === id) || null; },
    async getBooking(bookingId, userId, role) {
      const booking = bookings.get(bookingId);
      if (!booking) return null;
      if (role === 'customer') return booking.customerId === userId ? booking : null;
      if (role === 'driver') return booking.driverId === userId ? booking : null;
      return null;
    },
    async countRecentSupportReports(userId) { return reports.filter((r) => r.reporterId === userId).length; },
    async createSupportReport(input) {
      const report = { id: `r${reports.length + 1}`, status: 'open', ...input };
      reports.push(report);
      return { id: report.id, category: input.category, message: input.message, status: 'open', booking: input.bookingId ? { id: input.bookingId } : null };
    },
    async listMySupportReports(userId) { return reports.filter((r) => r.reporterId === userId); },
    async listSupportReportsForAdmin(filter) { this.lastFilter = filter; return { reports: reports.filter((r) => filter.statuses.includes(r.status)), counts: {} }; },
    async getSupportReportStatus(id) { return reports.find((r) => r.id === id)?.status ?? null; },
    async getSupportReportForAdmin(id) { return reports.find((r) => r.id === id) || null; },
    async updateSupportReport(id, adminId, change) {
      const report = reports.find((r) => r.id === id);
      if (!report || report.status !== change.fromStatus) return null;
      this.updates.push({ id, adminId, ...change });
      if (change.status) report.status = change.status;
      return report;
    },
    updates: [],
  };
  const auth = { async getUser(token) { const user = USERS[token]; return user ? { id: user.id } : null; } };
  return { app: createApp({ auth, repository, supportContact: contact || { email: null, phone: null } }), repository, reports, bookings };
}

const send = (app, token, body) => request(app).post('/api/support/reports').set('Authorization', `Bearer ${token}`).send(body);

// ---- rules ----

test('each role reports from its own fixed category list', () => {
  assert.deepEqual(Object.keys(CATEGORIES.customer), ['driver_behaviour', 'vehicle_damage', 'pricing', 'service_problem', 'app_problem', 'safety', 'other']);
  assert.deepEqual(Object.keys(CATEGORIES.driver), ['customer_behaviour', 'payment', 'vehicle_damage', 'service_problem', 'app_problem', 'safety', 'other']);
  assert.match(CATEGORIES.customer.safety, /non-emergency/);
  assert.equal(cleanReport({ category: 'customer_behaviour', message: 'x' }, 'customer').ok, false, 'drivers-only category');
  assert.equal(cleanReport({ category: 'driver_behaviour', message: 'x' }, 'driver').ok, false, 'customers-only category');
  assert.equal(cleanReport({ category: 'nope', message: 'x' }, 'customer').field, 'category');
  assert.equal(cleanReport({ category: 'app_problem', message: 'x' }, 'admin').status, 403);
  assert.deepEqual(categoriesFor('admin'), []);
  // Every legacy B10 code maps to a category the new table accepts for that role (same as the migration).
  for (const role of ['customer', 'driver']) {
    for (const mapped of Object.values(LEGACY_ISSUE_CATEGORIES[role])) assert.ok(Object.hasOwn(CATEGORIES[role], mapped), `${role}: ${mapped}`);
  }
  assert.ok(ALL_CATEGORIES.includes('payment') && ALL_CATEGORIES.includes('pricing'));
});

test('messages: required for general reports and "Other", trimmed, at most 2000 characters', () => {
  assert.equal(cleanReport({ category: 'app_problem' }, 'customer').field, 'message');
  assert.equal(cleanReport({ category: 'app_problem', message: '   ' }, 'customer').field, 'message');
  assert.equal(cleanReport({ category: 'safety', bookingId: JOB }, 'customer').ok, true, 'a job-linked report can be just a category');
  assert.equal(cleanReport({ category: 'other', bookingId: JOB }, 'customer').ok, false, '"Other" always needs words');
  assert.equal(cleanReport({ category: 'app_problem', message: 'x'.repeat(MESSAGE_MAX + 1) }, 'customer').ok, false);
  assert.equal(cleanReport({ category: 'app_problem', message: { a: 1 } }, 'customer').ok, false);
  assert.deepEqual(cleanReport({ category: 'app_problem', message: '  Map froze  ' }, 'driver').report, { category: 'app_problem', message: 'Map froze', bookingId: null });
});

test('status transitions: open → in review → resolved, reopen from resolved; notes on any status', () => {
  assert.deepEqual(TRANSITIONS, { open: ['in_review', 'resolved'], in_review: ['open', 'resolved'], resolved: ['in_review'] });
  assert.deepEqual(checkAdminUpdate({ status: 'in_review' }, 'open'), { ok: true, status: 'in_review', note: null });
  assert.equal(checkAdminUpdate({ status: 'open' }, 'resolved').status, 409, 'reopen goes to in review');
  assert.equal(checkAdminUpdate({ status: 'resolved' }, 'resolved').status, 409, 'already resolved');
  assert.deepEqual(checkAdminUpdate({ status: 'resolved', note: ' Called both ' }, 'resolved'), { ok: true, status: null, note: 'Called both' }, 'same status + note = note only');
  assert.equal(checkAdminUpdate({ status: 'closed' }, 'open').status, 400);
  assert.equal(checkAdminUpdate({}, 'open').status, 400, 'nothing to do');
  assert.deepEqual(checkAdminUpdate({ note: 'Asked the driver' }, 'resolved'), { ok: true, status: null, note: 'Asked the driver' });
  assert.equal(checkAdminUpdate({ note: 'x'.repeat(2001) }, 'open').status, 400);
});

test('support contact comes only from config; unset or placeholder values stay hidden', () => {
  assert.deepEqual(supportContactFromEnv({}), { email: null, phone: null });
  assert.deepEqual(supportContactFromEnv({ SUPPORT_EMAIL: 'support@example.com', SUPPORT_PHONE: 'call us' }), { email: null, phone: null });
  assert.deepEqual(supportContactFromEnv({ SUPPORT_EMAIL: 'help@aidroadside.com', SUPPORT_PHONE: '+1 (214) 555-0100' }), { email: 'help@aidroadside.com', phone: '+1 (214) 555-0100' });
});

// ---- API ----

test('config is public and never invents a contact', async () => {
  const { app } = harness();
  const response = await request(app).get('/api/support/config');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.contact, { email: null, phone: null });
  assert.equal(response.body.categories.customer.length, 7);
  assert.equal(response.body.reportsPerHour, REPORTS_PER_HOUR);
  const configured = harness({ contact: { email: 'help@aidroadside.com', phone: null } });
  assert.equal((await request(configured.app).get('/api/support/config')).body.contact.email, 'help@aidroadside.com');
});

test('reports need a signed-in customer or driver; identity comes from the token', async () => {
  const { app, reports } = harness();
  assert.equal((await request(app).post('/api/support/reports').send({ category: 'app_problem', message: 'x' })).status, 401);
  assert.equal((await send(app, 'adminToken', { category: 'app_problem', message: 'x' })).status, 403);
  const created = await send(app, 'customerToken', { category: 'app_problem', message: 'Map froze', reporterId: 'someone-else', status: 'resolved' });
  assert.equal(created.status, 201);
  assert.deepEqual(reports[0], { id: 'r1', status: 'open', reporterId: 'customer-1', role: 'customer', bookingId: null, bookingStatus: null, category: 'app_problem', message: 'Map froze' });
  // Unverified drivers can still report app problems (e.g. trouble during sign-up).
  assert.equal((await send(app, 'pendingDriverToken', { category: 'app_problem', message: 'Upload fails' })).status, 201);
  assert.equal((await send(app, 'driverToken', { category: 'driver_behaviour', message: 'x' })).status, 400, 'wrong list for role');
});

test('a job can be attached only by its own customer or driver', async () => {
  const { app, reports } = harness();
  const customer = await send(app, 'customerToken', { category: 'vehicle_damage', bookingId: JOB, message: 'Scratched bumper' });
  assert.equal(customer.status, 201);
  assert.equal(reports[0].bookingStatus, 'in_progress', 'the job status when reported is kept');
  assert.equal((await send(app, 'driverToken', { category: 'safety', bookingId: JOB })).status, 201);
  const stranger = await send(app, 'otherCustomerToken', { category: 'safety', bookingId: JOB, message: 'x' });
  assert.equal(stranger.status, 404, "someone else's job looks like it doesn't exist");
  assert.equal(stranger.body.field, 'bookingId');
  assert.equal((await send(app, 'driverToken', { category: 'safety', bookingId: OTHER_JOB, message: 'x' })).status, 404, 'not this driver’s job');
  assert.equal((await send(app, 'customerToken', { category: 'safety', bookingId: 'not-a-uuid', message: 'x' })).status, 404);
  assert.equal(reports.length, 2);
});

test(`rate limit: ${REPORTS_PER_HOUR} reports per person per hour`, async () => {
  const { app, reports } = harness();
  for (let i = 0; i < REPORTS_PER_HOUR; i += 1) assert.equal((await send(app, 'customerToken', { category: 'other', message: `n${i}` })).status, 201);
  const blocked = await send(app, 'customerToken', { category: 'other', message: 'one more' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'report_rate_limited');
  assert.match(blocked.body.error, /911/);
  assert.equal(reports.length, REPORTS_PER_HOUR);
  assert.equal((await send(app, 'driverToken', { category: 'other', message: 'separate person' })).status, 201, 'counted per person');
});

test('people list only their own reports', async () => {
  const { app } = harness();
  await send(app, 'customerToken', { category: 'app_problem', message: 'mine' });
  await send(app, 'otherCustomerToken', { category: 'app_problem', message: 'theirs' });
  const mine = await request(app).get('/api/support/reports').set('Authorization', 'Bearer customerToken');
  assert.deepEqual(mine.body.map((r) => r.message), ['mine']);
  assert.deepEqual((await request(app).get('/api/support/reports').set('Authorization', 'Bearer adminToken')).body, []);
});

test('admin inbox is admin-only, with validated filters', async () => {
  const { app, repository } = harness();
  for (const token of ['customerToken', 'driverToken']) {
    assert.equal((await request(app).get('/api/admin/reports').set('Authorization', `Bearer ${token}`)).status, 403);
    assert.equal((await request(app).get(`/api/admin/reports/${REPORT}`).set('Authorization', `Bearer ${token}`)).status, 403);
    assert.equal((await request(app).patch(`/api/admin/reports/${REPORT}`).set('Authorization', `Bearer ${token}`).send({ status: 'resolved' })).status, 403);
  }
  assert.equal((await request(app).get('/api/admin/reports')).status, 401);
  assert.equal((await request(app).get('/api/admin/reports').set('Authorization', 'Bearer adminToken')).status, 200);
  assert.deepEqual(repository.lastFilter, { statuses: ['open', 'in_review'], category: null }, 'default: everything not resolved');
  await request(app).get('/api/admin/reports?status=resolved&category=safety').set('Authorization', 'Bearer adminToken');
  assert.deepEqual(repository.lastFilter, { statuses: ['resolved'], category: 'safety' });
  assert.equal((await request(app).get('/api/admin/reports?status=closed').set('Authorization', 'Bearer adminToken')).status, 400);
  assert.equal((await request(app).get('/api/admin/reports?category=bogus').set('Authorization', 'Bearer adminToken')).status, 400);
  assert.equal((await request(app).get('/api/admin/reports/not-a-uuid').set('Authorization', 'Bearer adminToken')).status, 404);
});

test('admin moves a report through its statuses and adds internal notes', async () => {
  const { app, reports, repository } = harness();
  await send(app, 'customerToken', { category: 'safety', bookingId: JOB, message: 'Driver was driving recklessly' });
  reports[0].id = REPORT;
  const patch = (body) => request(app).patch(`/api/admin/reports/${REPORT}`).set('Authorization', 'Bearer adminToken').send(body);
  assert.equal((await patch({ status: 'in_review', note: 'Calling the customer' })).status, 200);
  assert.deepEqual(repository.updates[0], { id: REPORT, adminId: 'admin-1', fromStatus: 'open', status: 'in_review', note: 'Calling the customer' });
  assert.equal((await patch({ status: 'resolved' })).status, 200);
  const again = await patch({ status: 'resolved' });
  assert.equal(again.status, 409);
  assert.equal(again.body.currentStatus, 'resolved');
  assert.equal((await patch({ status: 'open' })).status, 409, 'resolved → open is not a step');
  assert.equal((await patch({ note: 'Driver suspended pending review' })).status, 200, 'notes after resolving');
  assert.equal((await patch({ status: 'in_review' })).status, 200, 'reopen');
  assert.equal((await patch({})).status, 400);
  // Someone else changed it between the check and the write: 409, never a skipped rule.
  repository.updateSupportReport = async () => null;
  assert.equal((await patch({ status: 'resolved' })).status, 409);
  assert.equal((await request(app).patch('/api/admin/reports/44444444-4444-4444-8444-444444444444').set('Authorization', 'Bearer adminToken').send({ status: 'resolved' })).status, 404);
});

test('the old B10 issue route is gone (one flow, one table)', async () => {
  const { app } = harness();
  assert.equal((await request(app).post(`/api/bookings/${JOB}/issues`).set('Authorization', 'Bearer customerToken').send({ category: 'safety' })).status, 404);
});

// ---- repository ----

test('repository: a job-linked report also leaves an audit event on the job, pointing at the report', async () => {
  let captured;
  const repository = new PostgresRepository({ query: async (text, values) => {
    captured = { text, values };
    return { rows: [{ id: REPORT, reporter_role: 'driver', category: 'customer_behaviour', message: 'Rude', status: 'open', booking_id: JOB, service_name: 'Towing', created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z'), resolved_at: null }] };
  } });
  const report = await repository.createSupportReport({ reporterId: 'driver-1', role: 'driver', bookingId: JOB, bookingStatus: 'arrived', category: 'customer_behaviour', message: 'Rude' });
  assert.match(captured.text, /insert into public\.support_reports/);
  assert.match(captured.text, /'issue_reported'/);
  assert.match(captured.text, /'reportId', id/);
  assert.deepEqual(captured.values, ['driver-1', 'driver', JOB, 'arrived', 'customer_behaviour', 'Rude']);
  assert.deepEqual(report, {
    id: REPORT, category: 'customer_behaviour', categoryLabel: 'Customer behaviour', message: 'Rude', status: 'open',
    booking: { id: JOB, serviceName: 'Towing' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', resolvedAt: null,
  });
  assert.equal(Object.hasOwn(report, 'events'), false, 'reporters never see the admin trail');
});

test('repository: status change is a compare-and-set and records resolver + trail', async () => {
  const queries = [];
  const repository = new PostgresRepository({ query: async (text, values) => { queries.push({ text, values }); return { rows: [] }; } });
  assert.equal(await repository.updateSupportReport(REPORT, 'admin-1', { fromStatus: 'open', status: 'resolved', note: 'Refunded' }), null);
  const { text, values } = queries[0];
  assert.match(text, /where r\.id = \$1::uuid and r\.status = \$4::text/);
  assert.match(text, /resolved_by = case when \$3::text = 'resolved' then \$2::uuid/);
  assert.match(text, /'status_changed'/);
  assert.match(text, /'note_added'/);
  assert.deepEqual(values, [REPORT, 'admin-1', 'resolved', 'open', 'Refunded']);
});
