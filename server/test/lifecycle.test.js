const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedFrom, checkTransition, DRIVER_STEPS, CUSTOMER_CANCELLABLE, DRIVER_CANCELLABLE } = require('../lifecycle');

const STATUSES = ['pending', 'searching', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled'];

test('the driver path is exactly accepted → en_route → arrived → in_progress → completed', () => {
  assert.deepEqual(DRIVER_STEPS, { accepted: 'en_route', en_route: 'arrived', arrived: 'in_progress', in_progress: 'completed' });
  assert.deepEqual(allowedFrom('driver', 'en_route'), ['accepted']);
  assert.deepEqual(allowedFrom('driver', 'completed'), ['in_progress']);
  assert.equal(allowedFrom('driver', 'accepted'), null, 'accepting is its own endpoint');
  assert.equal(allowedFrom('driver', 'searching'), null);
});

test('cancel windows: customer before arrival, driver before service starts', () => {
  assert.deepEqual(CUSTOMER_CANCELLABLE, ['pending', 'searching', 'accepted', 'en_route']);
  assert.deepEqual(DRIVER_CANCELLABLE, ['accepted', 'en_route', 'arrived']);
  assert.equal(allowedFrom('customer', 'completed'), null);
  assert.equal(allowedFrom('admin', 'cancelled'), null);
});

test('every (role, from, to) combination agrees with the table', () => {
  const allowed = new Set([
    'driver:accepted:en_route', 'driver:en_route:arrived', 'driver:arrived:in_progress', 'driver:in_progress:completed',
    'driver:accepted:cancelled', 'driver:en_route:cancelled', 'driver:arrived:cancelled',
    'customer:pending:cancelled', 'customer:searching:cancelled', 'customer:accepted:cancelled', 'customer:en_route:cancelled',
  ]);
  for (const role of ['driver', 'customer', 'admin']) {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const verdict = checkTransition({ role, booking: { status: from }, next: to, reason: role === 'driver' ? 'other' : null });
        assert.equal(verdict.ok, allowed.has(`${role}:${from}:${to}`), `${role} ${from} → ${to}`);
      }
    }
  }
});

test('rejections explain what to do instead', () => {
  const skip = checkTransition({ role: 'driver', booking: { status: 'accepted' }, next: 'arrived' });
  assert.equal(skip.status, 409);
  assert.match(skip.error, /next step is on the way/);
  const late = checkTransition({ role: 'driver', booking: { status: 'in_progress' }, next: 'cancelled', reason: 'other' });
  assert.match(late.error, /Complete it or report an issue/);
  const done = checkTransition({ role: 'customer', booking: { status: 'completed' }, next: 'cancelled' });
  assert.match(done.error, /already completed/);
  assert.equal(checkTransition({ role: 'driver', booking: null, next: 'en_route' }).status, 404);
});

// ---- E4: the server ends stale work on its own ----
const { TERMINAL, EXPIRABLE, STALE_RELEASABLE, ACTIVE_STATUSES, expiryConfigFromEnv } = require('../lifecycle');

test('expired is terminal: nobody can move or cancel an expired request', () => {
  assert.ok(TERMINAL.has('expired'));
  assert.deepEqual(EXPIRABLE, ['pending', 'searching'], 'only requests no driver has accepted expire');
  assert.deepEqual(STALE_RELEASABLE, ['accepted', 'en_route'], 'arrived/in_progress are never ended automatically');
  assert.deepEqual(ACTIVE_STATUSES, ['pending', 'searching', 'accepted', 'en_route', 'arrived', 'in_progress']);
  const booking = { status: 'expired' };
  const cancel = checkTransition({ role: 'customer', booking, next: 'cancelled' });
  assert.equal(cancel.status, 409);
  assert.match(cancel.error, /expired because no driver accepted it in time/);
  assert.equal(checkTransition({ role: 'driver', booking, next: 'en_route' }).status, 409);
});

test('expiry timing comes from the environment with safe defaults', () => {
  assert.deepEqual(expiryConfigFromEnv({}), { requestExpiryMinutes: 15, staleJobMinutes: 60, sweepSeconds: 60 });
  assert.deepEqual(expiryConfigFromEnv({ REQUEST_EXPIRY_MINUTES: '10', STALE_JOB_MINUTES: '30', EXPIRY_SWEEP_SECONDS: '15' }),
    { requestExpiryMinutes: 10, staleJobMinutes: 30, sweepSeconds: 15 });
  // Nonsense falls back to the default instead of expiring everything (or nothing).
  assert.deepEqual(expiryConfigFromEnv({ REQUEST_EXPIRY_MINUTES: '0', STALE_JOB_MINUTES: '5', EXPIRY_SWEEP_SECONDS: 'abc' }),
    { requestExpiryMinutes: 15, staleJobMinutes: 60, sweepSeconds: 60 });
  assert.equal(expiryConfigFromEnv({ REQUEST_EXPIRY_MINUTES: '2.5' }).requestExpiryMinutes, 15);
});
