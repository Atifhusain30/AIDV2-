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

const { SERVICE_EQUIPMENT, equipmentCapability, canPerformService } = require('../driverVehicle');

test('capability map: towing needs a tow truck, every equipment type does the on-the-spot services', () => {
  assert.deepEqual(equipmentCapability('flatbed'), {
    serviceTypes: ['battery_jump', 'flat_tire', 'lockout', 'fuel_delivery', 'ev_charging', 'oil_change', 'towing'], electricTowing: true,
  });
  assert.deepEqual(equipmentCapability('wheel_lift'), {
    serviceTypes: ['battery_jump', 'flat_tire', 'lockout', 'fuel_delivery', 'ev_charging', 'oil_change', 'towing'], electricTowing: false,
  });
  assert.deepEqual(equipmentCapability('light_duty'), {
    serviceTypes: ['battery_jump', 'flat_tire', 'lockout', 'fuel_delivery', 'ev_charging', 'oil_change'], electricTowing: false,
  });
  assert.deepEqual(equipmentCapability(''), { serviceTypes: [], electricTowing: false }, 'no equipment, no work');
  for (const types of Object.values(SERVICE_EQUIPMENT)) for (const type of types) assert.ok(EQUIPMENT_TYPES.includes(type));
});

test('canPerformService explains why a job does not fit', () => {
  assert.deepEqual(canPerformService('flatbed', { serviceType: 'towing', vehicleIsElectric: true }), { ok: true });
  assert.deepEqual(canPerformService('wheel_lift', { serviceType: 'towing', vehicleIsElectric: false }), { ok: true });
  assert.deepEqual(canPerformService('light_duty', { serviceType: 'lockout' }), { ok: true });
  assert.match(canPerformService('light_duty', { serviceType: 'towing' }).error, /^Towing needs a flatbed or wheel-lift tow truck\. Your light-duty service vehicle can't take this job\.$/);
  assert.match(canPerformService('wheel_lift', { serviceType: 'towing', vehicleIsElectric: true }).error, /electric vehicle, so it has to go on a flatbed/);
  assert.equal(canPerformService('flatbed', { serviceType: 'detailing' }).ok, false, 'services not in the map go to no one');
  assert.equal(canPerformService('flatbed', { serviceType: 'constructor' }).ok, false);
  assert.equal(canPerformService('helicopter', { serviceType: 'lockout' }).ok, false);
});
