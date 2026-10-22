const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanDriverVehicle, driverVehicleComplete, EQUIPMENT_TYPES, US_STATES } = require('../driverVehicle');

const valid = { make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed' };

test('accepts next model year but not the one after', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  assert.equal(cleanDriverVehicle({ ...valid, year: 2027 }, now).ok, true);
  assert.equal(cleanDriverVehicle({ ...valid, year: 2028 }, now).field, 'year');
  assert.equal(cleanDriverVehicle({ ...valid, year: 1980 }, now).ok, true);
  assert.equal(cleanDriverVehicle({ ...valid, year: 1979 }, now).field, 'year');
});

test('cleans whitespace and casing, truncates long text', () => {
  const result = cleanDriverVehicle({ ...valid, make: '  Ford   Motor ', plate: ' abc  123 ', plateState: ' ca ', model: 'x'.repeat(80) });
  assert.equal(result.ok, true);
  assert.equal(result.vehicle.make, 'Ford Motor');
  assert.equal(result.vehicle.plate, 'ABC 123');
  assert.equal(result.vehicle.plateState, 'CA');
  assert.equal(result.vehicle.model.length, 60);
});

test('rejects non-object bodies without throwing', () => {
  assert.equal(cleanDriverVehicle(null).ok, false);
  assert.equal(cleanDriverVehicle('Ford').field, 'make');
});

test('completeness requires every field, including equipment', () => {
  assert.equal(driverVehicleComplete(valid), true);
  assert.equal(driverVehicleComplete(null), false);
  for (const field of Object.keys(valid)) {
    assert.equal(driverVehicleComplete({ ...valid, [field]: field === 'year' ? null : '' }), false, field);
  }
});

test('equipment types and states are the fixed lists the database allows', () => {
  assert.deepEqual([...EQUIPMENT_TYPES], ['flatbed', 'wheel_lift', 'light_duty']);
  assert.equal(US_STATES.length, 51);
  assert.ok(US_STATES.includes('DC'));
});
