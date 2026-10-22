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
