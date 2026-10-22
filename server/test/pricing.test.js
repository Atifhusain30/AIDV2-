const test = require('node:test');
const assert = require('node:assert/strict');
const { quoteService, roadMiles, TOWING } = require('../pricing');

const towing = { id: 'towing', basePrice: 95, requiresDropoff: true };
const jump = { id: 'battery_jump', basePrice: 69 };
const DALLAS = { lat: 32.7767, lng: -96.797 };

test('flat-price services ignore distance', () => {
  assert.deepEqual(quoteService(jump, DALLAS, null), { price: 69, distanceMiles: null });
});

test('road miles approximate driving distance from straight-line distance', () => {
  // Dallas -> Fort Worth is ~30.6 mi straight line; x1.25 ≈ 38 road miles
  const miles = roadMiles(DALLAS, { lat: 32.7555, lng: -97.3308 });
  assert.ok(miles > 36 && miles < 40, `got ${miles}`);
});

test('tows within the included miles cost the hook-up fee', () => {
  const quote = quoteService(towing, DALLAS, { lat: 32.78, lng: -96.8 });
  assert.equal(quote.price, TOWING.hookup);
  assert.ok(quote.distanceMiles < TOWING.includedMiles);
});

test('longer tows add the per-mile rate after the included miles, rounded to cents', () => {
  const dropoff = { lat: 32.7555, lng: -97.3308 };
  const quote = quoteService(towing, DALLAS, dropoff);
  const expected = Math.round((TOWING.hookup + (quote.distanceMiles - TOWING.includedMiles) * TOWING.perMile) * 100) / 100;
  assert.equal(quote.price, expected);
  assert.ok(quote.price > 230 && quote.price < 250, `got ${quote.price}`);
});

test('tows beyond the maximum distance are refused', () => {
  assert.throws(() => quoteService(towing, DALLAS, { lat: 29.7604, lng: -95.3698 }), /longer than 100 miles/);
});

test('towing without a drop-off cannot be quoted', () => {
  assert.throws(() => quoteService(towing, DALLAS, null), /drop-off/);
});
