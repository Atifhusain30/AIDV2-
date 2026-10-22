// E6 / E1: every role-specific route refuses the other roles, using the role from the server's
// profile (profiles table) — never a role the client claims in its sign-in metadata.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');

const VEHICLE = { make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed' };

// Each token's sign-in metadata claims a role it does not have; the profile is what counts.
const accounts = {
  customerToken: { identity: { id: 'c1', user_metadata: { role: 'admin' } }, profile: { id: 'c1', role: 'customer', status: 'active' } },
  driverToken: {
    identity: { id: 'd1', user_metadata: { role: 'admin' } },
    profile: { id: 'd1', role: 'driver', status: 'active', verificationStatus: 'verified', credentialsValidUntil: '2099-01-01', isOnline: true, driverVehicle: VEHICLE },
  },
  adminToken: { identity: { id: 'a1', user_metadata: { role: 'customer' } }, profile: { id: 'a1', role: 'admin', status: 'active' } },
  suspendedToken: { identity: { id: 's1', user_metadata: { role: 'customer' } }, profile: { id: 's1', role: 'customer', status: 'suspended' } },
};

function harness() {
  const repository = {
    async getProfile(id) { return Object.values(accounts).find((account) => account.profile.id === id)?.profile || null; },
    async expireStaleBookings() { return { expired: [], released: [] }; },
  };
  const auth = { async getUser(token) { const account = accounts[token]; return account ? { email: `${account.identity.id}@aid.test`, ...account.identity } : null; } };
  return createApp({ auth, repository, stripe: null, accountAdmin: null });
}

const send = (app, method, path, token) => {
  const call = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  return method === 'get' || method === 'delete' ? call : call.send({});
};

const CUSTOMER_ONLY = [
  ['get', '/api/vehicles'], ['post', '/api/vehicles'], ['patch', '/api/vehicles/v1'], ['delete', '/api/vehicles/v1'],
  ['post', '/api/quotes'], ['post', '/api/bookings'], ['post', '/api/payments/create-intent'],
];
const DRIVER_ONLY = [
  ['patch', '/api/drivers/me/online'], ['patch', '/api/drivers/me/vehicle'], ['get', '/api/drivers/me/documents'],
  ['post', '/api/drivers/me/documents'], ['delete', '/api/drivers/me/documents/doc-1'], ['get', '/api/drivers/me/verification'],
  ['post', '/api/drivers/me/verification/submit'],
];
const VERIFIED_DRIVER_ONLY = [
  ['get', '/api/drivers/requests?lat=32.7&lng=-96.8'], ['post', '/api/bookings/00000000-0000-4000-8000-000000000001/accept'],
  ['patch', '/api/bookings/00000000-0000-4000-8000-000000000001/driver-location'],
];
const ADMIN_ONLY = [
  ['get', '/api/admin/drivers'], ['get', '/api/admin/drivers/d1'], ['post', '/api/admin/documents/doc-1/review'],
  ['post', '/api/admin/drivers/d1/decision'], ['get', '/api/admin/reports'], ['get', '/api/admin/reports/r1'],
  ['get', '/api/admin/reports/r1/messages'], ['patch', '/api/admin/reports/r1'],
];

test('customer-only routes refuse drivers and admins (even when their metadata claims otherwise)', async () => {
  const app = harness();
  for (const [method, path] of CUSTOMER_ONLY) {
    for (const token of ['driverToken', 'adminToken']) {
      const response = await send(app, method, path, token);
      assert.equal(response.status, 403, `${token} ${method} ${path}`);
      assert.equal(response.body.error, 'customer account required', `${token} ${method} ${path}`);
    }
  }
});

test('driver-only routes refuse customers and admins', async () => {
  const app = harness();
  for (const [method, path] of DRIVER_ONLY) {
    for (const token of ['customerToken', 'adminToken']) {
      const response = await send(app, method, path, token);
      assert.equal(response.status, 403, `${token} ${method} ${path}`);
      assert.equal(response.body.error, 'driver account required', `${token} ${method} ${path}`);
    }
  }
  for (const [method, path] of VERIFIED_DRIVER_ONLY) {
    for (const token of ['customerToken', 'adminToken']) {
      const response = await send(app, method, path, token);
      assert.equal(response.status, 403, `${token} ${method} ${path}`);
      assert.equal(response.body.error, 'Verified driver account required', `${token} ${method} ${path}`);
    }
  }
});

test('admin-only routes refuse customers and drivers — a metadata role of "admin" grants nothing', async () => {
  const app = harness();
  for (const [method, path] of ADMIN_ONLY) {
    for (const token of ['customerToken', 'driverToken']) {
      const response = await send(app, method, path, token);
      assert.equal(response.status, 403, `${token} ${method} ${path}`);
      assert.equal(response.body.error, 'admin account required', `${token} ${method} ${path}`);
    }
  }
});

test('live updates are only for customers and drivers', async () => {
  const response = await send(harness(), 'post', '/api/realtime/ticket', 'adminToken');
  assert.equal(response.status, 403);
});

test('GET /api/me returns the profile role (what the apps route on), not the sign-in metadata role', async () => {
  const app = harness();
  for (const [token, role] of [['customerToken', 'customer'], ['driverToken', 'driver'], ['adminToken', 'admin']]) {
    const response = await send(app, 'get', '/api/me', token);
    assert.equal(response.status, 200, token);
    assert.equal(response.body.role, role, token);
  }
});

test('an invalid session gets 401 (the apps sign out); an inactive account gets 403 everywhere', async () => {
  const app = harness();
  const invalid = await send(app, 'get', '/api/me', 'not-a-real-token');
  assert.equal(invalid.status, 401);
  const missing = await request(app).get('/api/me');
  assert.equal(missing.status, 401);
  for (const path of ['/api/me', '/api/vehicles', '/api/bookings']) {
    const suspended = await send(app, 'get', path, 'suspendedToken');
    assert.equal(suspended.status, 403, path);
    assert.equal(suspended.body.error, 'Account is not active', path);
  }
});
