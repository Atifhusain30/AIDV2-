const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseSslConfig } = require('../config');

test('database TLS verifies certificates by default', () => {
  assert.deepEqual(databaseSslConfig({}), { rejectUnauthorized: true });
});

test('database TLS can be explicitly disabled for local development', () => {
  assert.equal(databaseSslConfig({ DATABASE_SSL: 'false' }), false);
});

test('database TLS accepts an explicit CA with escaped newlines', () => {
  assert.deepEqual(databaseSslConfig({ DATABASE_CA: 'line1\\nline2' }), {
    rejectUnauthorized: true,
    ca: 'line1\nline2',
  });
});