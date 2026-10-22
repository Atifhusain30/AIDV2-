const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const { verificationReadiness } = require('../verification');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const FUTURE = '2099-01-31';
const SOONER = '2098-06-30';
const PAST = '2001-01-01';

function harness() {
  const profiles = {
    'driver-1': { id: 'driver-1', role: 'driver', status: 'active', firstName: 'Dana', lastName: 'Driver', verificationStatus: 'pending', isOnline: false, credentialsValidUntil: null },
    'customer-1': { id: 'customer-1', role: 'customer', status: 'active' },
    'admin-1': { id: 'admin-1', role: 'admin', status: 'active' },
  };
  const verification = { 'driver-1': { reviewNotes: null, submittedAt: null, reviewedAt: null } };
  const documents = [];
  const events = [];
  let clock = 0;
  const repository = {
    async getProfile(id) { return profiles[id] ? { ...profiles[id] } : null; },
    async listDriverDocuments(driverId) { return documents.filter((d) => d.driverId === driverId).map((d) => ({ ...d })); },
    async createDriverDocument(driverId, input) {
      clock += 1;
      const document = { id: `doc-${documents.length + 1}`, driverId, status: 'pending', reviewNotes: null, uploadedAt: new Date(Date.UTC(2026, 0, 1, 0, clock)).toISOString(), ...input };
      documents.push(document);
      return { ...document };
    },
    async getDriverDocument(driverId, documentId) { return documents.find((d) => d.id === documentId && d.driverId === driverId) || null; },
    async deleteDriverDocument(driverId, documentId) {
      const index = documents.findIndex((d) => d.id === documentId && d.driverId === driverId);
      return index < 0 ? null : documents.splice(index, 1)[0].storagePath;
    },
    async getDriverVerification(driverId) {
      const profile = profiles[driverId];
      return profile ? { status: profile.verificationStatus, credentialsValidUntil: profile.credentialsValidUntil, ...verification[driverId] } : null;
    },
    async submitDriverVerification(driverId) {
      const profile = profiles[driverId];
      if (!['pending', 'rejected'].includes(profile.verificationStatus)) return null;
      profile.verificationStatus = 'under_review';
      verification[driverId].submittedAt = 'now';
      events.push({ driverId, actorId: driverId, action: 'submitted' });
      return this.getDriverVerification(driverId);
    },
    async listDriversForReview(filter) {
      return Object.values(profiles).filter((p) => p.role === 'driver' && (filter === 'all' || p.verificationStatus === filter || filter === 'needs_review'))
        .map((p) => ({ id: p.id, firstName: p.firstName, verificationStatus: p.verificationStatus }));
    },
    async getDriverForReview(driverId) {
      const profile = profiles[driverId];
      if (!profile || profile.role !== 'driver') return null;
      return { driver: { ...profile, email: 'dana@example.com' }, documents: await this.listDriverDocuments(driverId), events: events.filter((e) => e.driverId === driverId) };
    },
    async getDocumentForReview(documentId) { return documents.find((d) => d.id === documentId) || null; },
    async reviewDriverDocument(documentId, adminId, { status, notes, expiresOn }) {
      const document = documents.find((d) => d.id === documentId);
      Object.assign(document, { status, reviewNotes: notes || null, expiresOn: expiresOn || document.expiresOn });
      events.push({ driverId: document.driverId, actorId: adminId, action: status === 'approved' ? 'document_approved' : 'document_rejected', documentId });
      return { ...document };
    },
    async applyDriverDecision(driverId, adminId, { fromStatuses, toStatus, event, notes, credentialsValidUntil }) {
      const profile = profiles[driverId];
      if (!profile || !fromStatuses.includes(profile.verificationStatus)) return null;
      profile.verificationStatus = toStatus;
      if (credentialsValidUntil !== undefined) profile.credentialsValidUntil = credentialsValidUntil;
      if (toStatus !== 'verified') profile.isOnline = false;
      verification[driverId].reviewNotes = notes || null;
      events.push({ driverId, actorId: adminId, action: event, notes });
      return this.getDriverVerification(driverId);
    },
    async setCredentialsValidUntil(driverId, date) { profiles[driverId].credentialsValidUntil = date; },
    async updateDriverOnlineStatus(driverId, isOnline) { profiles[driverId].isOnline = isOnline; },
    async listAvailableBookings() { return []; },
  };
  const documentStorage = {
    async upload(driverId, file, type) { return `${driverId}/${type}/${file.originalname}-${documents.length}`; },
    async signedUrl(path) { return `https://signed.example/${path}`; },
    async remove() {},
  };
  const tokens = { driver: 'driver-1', customer: 'customer-1', admin: 'admin-1' };
  const auth = { async getUser(token) { return tokens[token] ? { id: tokens[token], email: `${token}@example.com` } : null; } };
  return { app: createApp({ auth, repository, documentStorage }), profiles, documents, events };
}

function upload(app, type, expiresOn) {
  const call = request(app).post('/api/drivers/me/documents').set('Authorization', 'Bearer driver').field('type', type);
  if (expiresOn) call.field('expiresOn', expiresOn);
  return call.attach('file', PNG, { filename: `${type}.png`, contentType: 'image/png' });
}

async function uploadAll(app) {
  const ids = {};
  ids.drivers_license = (await upload(app, 'drivers_license', FUTURE)).body.id;
  ids.identification = (await upload(app, 'identification')).body.id;
  ids.insurance = (await upload(app, 'insurance', SOONER)).body.id;
  ids.vehicle_registration = (await upload(app, 'vehicle_registration', FUTURE)).body.id;
  return ids;
}

const admin = (app, method, path) => request(app)[method](path).set('Authorization', 'Bearer admin');

test('expiring documents require a future expiration date', async () => {
  const { app } = harness();
  assert.equal((await upload(app, 'insurance')).status, 400);
  assert.equal((await upload(app, 'insurance', PAST)).status, 400);
  assert.equal((await upload(app, 'insurance', '2099-02-30')).status, 400);
  const ok = await upload(app, 'insurance', FUTURE);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.expiresOn, FUTURE);
  assert.equal((await upload(app, 'identification')).status, 201, 'identification may omit an expiration date');
});

test('driver can submit for review only after every required document is uploaded', async () => {
  const { app, profiles } = harness();
  await upload(app, 'drivers_license', FUTURE);
  const early = await request(app).post('/api/drivers/me/verification/submit').set('Authorization', 'Bearer driver');
  assert.equal(early.status, 409);
  assert.deepEqual(early.body.missing.sort(), ['identification', 'insurance', 'vehicle_registration']);

  await upload(app, 'identification');
  await upload(app, 'insurance', FUTURE);
  await upload(app, 'vehicle_registration', FUTURE);
  const submitted = await request(app).post('/api/drivers/me/verification/submit').set('Authorization', 'Bearer driver');
  assert.equal(submitted.status, 200);
  assert.equal(profiles['driver-1'].verificationStatus, 'under_review');
  assert.equal((await request(app).post('/api/drivers/me/verification/submit').set('Authorization', 'Bearer driver')).status, 409, 'cannot resubmit while under review');
});

test('driver verification summary reports status and missing documents', async () => {
  const { app } = harness();
  await upload(app, 'insurance', FUTURE);
  const response = await request(app).get('/api/drivers/me/verification').set('Authorization', 'Bearer driver');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'pending');
  assert.ok(response.body.readiness.missing.includes('drivers_license'));
  assert.equal(response.body.documents.length, 1);
  assert.equal(response.body.documents[0].storagePath, undefined, 'storage paths stay server-side');
});

test('admin endpoints are restricted to admin accounts', async () => {
  const { app } = harness();
  assert.equal((await request(app).get('/api/admin/drivers')).status, 401);
  assert.equal((await request(app).get('/api/admin/drivers').set('Authorization', 'Bearer driver')).status, 403);
  assert.equal((await request(app).get('/api/admin/drivers').set('Authorization', 'Bearer customer')).status, 403);
  assert.equal((await admin(app, 'get', '/api/admin/drivers')).status, 200);
  assert.equal((await admin(app, 'get', '/api/admin/drivers?status=bogus')).status, 400);
});

test('admin sees driver detail with short-lived document links', async () => {
  const { app } = harness();
  await uploadAll(app);
  const response = await admin(app, 'get', '/api/admin/drivers/driver-1');
  assert.equal(response.status, 200);
  assert.equal(response.body.driver.email, 'dana@example.com');
  assert.equal(response.body.documents.length, 4);
  assert.match(response.body.documents[0].fileUrl, /^https:\/\/signed\.example\//);
  assert.equal(response.body.documents[0].storagePath, undefined);
  assert.equal(response.body.readiness.canVerify, false);
  assert.equal((await admin(app, 'get', '/api/admin/drivers/admin-1')).status, 404, 'non-driver profiles are not reviewable');
});

test('rejecting a document requires a reason and is audited', async () => {
  const { app, events } = harness();
  const ids = await uploadAll(app);
  assert.equal((await admin(app, 'post', `/api/admin/documents/${ids.insurance}/review`).send({ decision: 'reject' })).status, 400);
  assert.equal((await admin(app, 'post', `/api/admin/documents/${ids.insurance}/review`).send({ decision: 'maybe', notes: 'x' })).status, 400);
  const rejected = await admin(app, 'post', `/api/admin/documents/${ids.insurance}/review`).send({ decision: 'reject', notes: 'Policy is personal-use only' });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.status, 'rejected');
  assert.equal(events.at(-1).action, 'document_rejected');
  assert.equal(events.at(-1).actorId, 'admin-1');
  assert.equal((await admin(app, 'post', '/api/admin/documents/missing/review').send({ decision: 'approve' })).status, 404);
});

test('admin cannot verify a driver until every current document is approved and unexpired', async () => {
  const { app, profiles } = harness();
  const ids = await uploadAll(app);
  await request(app).post('/api/drivers/me/verification/submit').set('Authorization', 'Bearer driver');
  await admin(app, 'post', `/api/admin/documents/${ids.drivers_license}/review`).send({ decision: 'approve' });
  const blocked = await admin(app, 'post', '/api/admin/drivers/driver-1/decision').send({ decision: 'verify' });
  assert.equal(blocked.status, 409);
  assert.ok(blocked.body.unapproved.includes('insurance'));

  for (const id of [ids.identification, ids.insurance, ids.vehicle_registration]) {
    await admin(app, 'post', `/api/admin/documents/${id}/review`).send({ decision: 'approve' });
  }
  const verified = await admin(app, 'post', '/api/admin/drivers/driver-1/decision').send({ decision: 'verify' });
  assert.equal(verified.status, 200);
  assert.equal(profiles['driver-1'].verificationStatus, 'verified');
  assert.equal(profiles['driver-1'].credentialsValidUntil, SOONER, 'eligibility ends at the earliest credential expiration');
});

test('suspension requires a reason, takes the driver offline, and blocks dispatch', async () => {
  const { app, profiles } = harness();
  Object.assign(profiles['driver-1'], { verificationStatus: 'verified', credentialsValidUntil: FUTURE, isOnline: true });
  assert.equal((await admin(app, 'post', '/api/admin/drivers/driver-1/decision').send({ decision: 'suspend' })).status, 400);
  const suspended = await admin(app, 'post', '/api/admin/drivers/driver-1/decision').send({ decision: 'suspend', notes: 'Customer safety complaint' });
  assert.equal(suspended.status, 200);
  assert.equal(profiles['driver-1'].isOnline, false);
  assert.equal((await request(app).get('/api/drivers/requests').set('Authorization', 'Bearer driver')).status, 403);
  assert.equal((await request(app).patch('/api/drivers/me/online').set('Authorization', 'Bearer driver').send({ isOnline: true })).status, 403);
  assert.equal((await admin(app, 'post', '/api/admin/drivers/driver-1/decision').send({ decision: 'verify' })).status, 409, 'suspended drivers return only through reinstate');
});

test('verified drivers with lapsed credentials cannot go online or receive jobs', async () => {
  const { app, profiles } = harness();
  Object.assign(profiles['driver-1'], { verificationStatus: 'verified', credentialsValidUntil: PAST, isOnline: true });
  const response = await request(app).get('/api/drivers/requests').set('Authorization', 'Bearer driver');
  assert.equal(response.status, 403);
  assert.match(response.body.error, /expired/i);
  assert.equal((await request(app).patch('/api/drivers/me/online').set('Authorization', 'Bearer driver').send({ isOnline: true })).status, 403);
});

test('approving renewed insurance extends a verified driver\'s eligibility', async () => {
  const { app, profiles } = harness();
  const ids = await uploadAll(app);
  for (const id of Object.values(ids)) await admin(app, 'post', `/api/admin/documents/${id}/review`).send({ decision: 'approve' });
  await admin(app, 'post', '/api/admin/drivers/driver-1/decision').send({ decision: 'verify' });
  assert.equal(profiles['driver-1'].credentialsValidUntil, SOONER);

  const renewal = await upload(app, 'insurance', '2099-12-31');
  assert.equal(profiles['driver-1'].credentialsValidUntil, SOONER, 'a pending upload does not change eligibility');
  await admin(app, 'post', `/api/admin/documents/${renewal.body.id}/review`).send({ decision: 'approve' });
  assert.equal(profiles['driver-1'].credentialsValidUntil, FUTURE, 'eligibility now ends at the next earliest expiration');
});

test('drivers cannot delete approved documents', async () => {
  const { app } = harness();
  const ids = await uploadAll(app);
  await admin(app, 'post', `/api/admin/documents/${ids.insurance}/review`).send({ decision: 'approve' });
  assert.equal((await request(app).delete(`/api/drivers/me/documents/${ids.insurance}`).set('Authorization', 'Bearer driver')).status, 409);
  assert.equal((await request(app).delete(`/api/drivers/me/documents/${ids.identification}`).set('Authorization', 'Bearer driver')).status, 204);
});

test('readiness uses only the newest upload of each document type', () => {
  const docs = [
    { type: 'insurance', status: 'rejected', expiresOn: FUTURE, uploadedAt: '2026-01-01T00:00:00Z' },
    { type: 'insurance', status: 'approved', expiresOn: FUTURE, uploadedAt: '2026-01-02T00:00:00Z' },
    { type: 'drivers_license', status: 'approved', expiresOn: FUTURE, uploadedAt: '2026-01-01T00:00:00Z' },
    { type: 'identification', status: 'approved', uploadedAt: '2026-01-01T00:00:00Z' },
    { type: 'vehicle_registration', status: 'approved', expiresOn: PAST, uploadedAt: '2026-01-01T00:00:00Z' },
  ];
  const readiness = verificationReadiness(docs, new Date('2026-06-01T00:00:00Z'));
  assert.deepEqual(readiness.rejected, []);
  assert.deepEqual(readiness.expired, ['vehicle_registration']);
  assert.equal(readiness.canVerify, false);
});
