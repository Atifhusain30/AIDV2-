const test = require('node:test');
const assert = require('node:assert/strict');
const { startExpirySweep } = require('../expiry');

const quiet = { log() {}, error() {} };

test('the interval sweep ends stale work on a timer, unscoped, without overlapping itself', async () => {
  const calls = [];
  let release;
  const repository = {
    expireStaleBookings(scope) {
      calls.push(scope);
      return new Promise((resolve) => { release = () => resolve({ expired: ['b-1'], released: [] }); });
    },
  };
  const logged = [];
  const sweep = startExpirySweep({ repository, intervalMs: 10, logger: { log: (line) => logged.push(line), error() {} } });
  try {
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(calls.length, 1, 'a slow sweep is not started again while it runs');
    assert.equal(calls[0], undefined, 'the sweep covers every booking (no scope)');
    release();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.ok(calls.length >= 2, 'and the next tick runs once it finishes');
    assert.match(logged[0], /expired 1 unaccepted request/);
  } finally {
    sweep.stop();
    release?.();
  }
});

test('a failing sweep is logged and retried on the next tick', async () => {
  let attempts = 0;
  const errors = [];
  const repository = { async expireStaleBookings() { attempts += 1; if (attempts === 1) throw new Error('db down'); return { expired: [], released: [] }; } };
  const sweep = startExpirySweep({ repository, intervalMs: 1000, logger: { ...quiet, error: (...args) => errors.push(args.join(' ')) } });
  try {
    assert.equal(await sweep.tick(), null);
    assert.match(errors[0], /db down/);
    assert.deepEqual(await sweep.tick(), { expired: [], released: [] });
  } finally {
    sweep.stop();
  }
});
