const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');

function harness({ signedUrlError = false } = {}) {
  const saved = [];
  const profiles = {
    'driver-1': { id: 'driver-1', role: 'driver', status: 'active', verificationStatus: 'pending' },
    'customer-1': { id: 'customer-1', role: 'customer', status: 'active' },
  };
  const repository = {
    async getProfile(id) { return profiles[id] || null; },
    async listDriverDocuments(driverId) { return saved.filter((item) => item.driverId === driverId); },
    async createDriverDocument(driverId, input) {
      const item = { id: `doc-${saved.length + 1}`, driverId, status: 'pending', uploadedAt: new Date().toISOString(), ...input };
      saved.push(item);
      return item;
    },
    async getDriverDocument(driverId, documentId) {
      return saved.find((item) => item.id === documentId && item.driverId === driverId) || null;
    },
    async deleteDriverDocument(driverId, documentId) {
      const index = saved.findIndex((item) => item.id === documentId && item.driverId === driverId);
      if (index < 0) return null;
      return saved.splice(index, 1)[0].storagePath;
    },
  };
  const uploads = [];
  const removed = [];
  const documentStorage = {
    async upload(driverId, file) {
      uploads.push({ driverId, file });
      return `${driverId}/generated-${file.originalname}`;
    },
    async signedUrl(path) {
      if (signedUrlError) throw new Error('signed URL unavailable');
      return `https://signed.example/${path}`;
    },
    async remove(path) { removed.push(path); },
  };
  const tokenIds = { driver: 'driver-1', customer: 'customer-1' };
  const auth = { async getUser(token) { return tokenIds[token] ? { id: tokenIds[token], email: `${token}@example.com` } : null; } };
  return { app: createApp({ auth, repository, stripe: null, documentStorage }), uploads, removed, saved };
}

test('driver document endpoints require a driver account', async () => {
  const { app } = harness();
  assert.equal((await request(app).get('/api/drivers/me/documents')).status, 401);
  assert.equal((await request(app).get('/api/drivers/me/documents').set('Authorization', 'Bearer customer')).status, 403);
});

test('authenticated driver uploads a validated document without trusting a supplied driver id', async () => {
  const { app, uploads } = harness();
  const response = await request(app)
    .post('/api/drivers/me/documents')
    .set('Authorization', 'Bearer driver')
    .field('type', 'drivers_license')
    .field('driverId', 'attacker-selected-id')
    .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), { filename: 'license.png', contentType: 'image/png' });
  assert.equal(response.status, 201);
  assert.equal(response.body.driverId, 'driver-1');
  assert.equal(response.body.type, 'drivers_license');
  assert.match(response.body.fileUrl, /^https:\/\/signed\.example\//);
  assert.equal(uploads[0].driverId, 'driver-1');
});

test('driver document upload rejects unsupported content types', async () => {
  const { app } = harness();
  const response = await request(app)
    .post('/api/drivers/me/documents')
    .set('Authorization', 'Bearer driver')
    .field('type', 'identification')
    .attach('file', Buffer.from('script'), { filename: 'payload.js', contentType: 'application/javascript' });
  assert.equal(response.status, 400);
});

test('driver document upload rejects forged PNG content', async () => {
  const { app } = harness();
  const response = await request(app)
    .post('/api/drivers/me/documents')
    .set('Authorization', 'Bearer driver')
    .field('type', 'identification')
    .attach('file', Buffer.from('not-a-png'), { filename: 'fake.png', contentType: 'image/png' });
  assert.equal(response.status, 400);
});

test('driver document upload removes storage without persisting metadata when signed URL creation fails', async () => {
  const { app, removed, saved } = harness({ signedUrlError: true });
  const response = await request(app)
    .post('/api/drivers/me/documents')
    .set('Authorization', 'Bearer driver')
    .field('type', 'drivers_license')
    .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), { filename: 'license.png', contentType: 'image/png' });
  assert.equal(response.status, 500);
  assert.equal(removed.length, 1);
  assert.equal(saved.length, 0);
});

test('driver can delete only an owned document and its storage object', async () => {
  const { app, removed } = harness();
  const upload = await request(app)
    .post('/api/drivers/me/documents')
    .set('Authorization', 'Bearer driver')
    .field('type', 'drivers_license')
    .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), { filename: 'license.png', contentType: 'image/png' });
  const response = await request(app)
    .delete(`/api/drivers/me/documents/${upload.body.id}`)
    .set('Authorization', 'Bearer driver');
  assert.equal(response.status, 204);
  assert.deepEqual(removed, [upload.body.storagePath]);
});
