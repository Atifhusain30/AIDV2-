// The driver's service vehicle and equipment. Pure functions only: HTTP handling lives in
// app.js and SQL lives in repository.js. The client mirrors these rules in
// src/lib/driverVehicle.ts for inline guidance; the server is authoritative.

const EQUIPMENT_TYPES = Object.freeze(['flatbed', 'wheel_lift', 'light_duty']);
const US_STATES = Object.freeze([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR',
  'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);
const STATE_SET = new Set(US_STATES);
const EQUIPMENT_SET = new Set(EQUIPMENT_TYPES);
const MIN_YEAR = 1980;
const maxYear = (now = new Date()) => now.getUTCFullYear() + 1;

// 1–8 letters/digits, single spaces or hyphens allowed between them (e.g. "TOW-77", "ABC 1234").
const PLATE_PATTERN = /^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$/;

const text = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/**
 * Validate and clean a driver vehicle payload.
 * Returns { ok: true, vehicle } or { ok: false, field, error } for the first problem found.
 */
function cleanDriverVehicle(body, now = new Date()) {
  const input = body && typeof body === 'object' ? body : {};
  const yearValue = typeof input.year === 'string' && /^\d{4}$/.test(input.year.trim()) ? Number(input.year.trim()) : input.year;
  const vehicle = {
    make: text(input.make, 40),
    model: text(input.model, 60),
    year: Number.isInteger(yearValue) ? yearValue : null,
    color: text(input.color, 30),
    plate: text(input.plate, 12).toUpperCase(),
    plateState: text(input.plateState, 2).toUpperCase(),
    equipmentType: typeof input.equipmentType === 'string' ? input.equipmentType : '',
  };
  const fail = (field, error) => ({ ok: false, field, error });
  if (!vehicle.make) return fail('make', 'Enter the vehicle make');
  if (!vehicle.model) return fail('model', 'Enter the vehicle model');
  if (vehicle.year === null || vehicle.year < MIN_YEAR || vehicle.year > maxYear(now)) {
    return fail('year', `Enter a year between ${MIN_YEAR} and ${maxYear(now)}`);
  }
  if (!vehicle.color) return fail('color', 'Enter the vehicle color');
  const plateChars = vehicle.plate.replace(/[ -]/g, '').length;
  if (!vehicle.plate) return fail('plate', 'Enter the license plate');
  if (!PLATE_PATTERN.test(vehicle.plate) || plateChars < 2 || plateChars > 8) {
    return fail('plate', 'Plates use 2–8 letters or numbers (spaces or dashes allowed)');
  }
  if (!STATE_SET.has(vehicle.plateState)) return fail('plateState', 'Choose the state the plate is registered in');
  if (!EQUIPMENT_SET.has(vehicle.equipmentType)) return fail('equipmentType', 'Choose your equipment type');
  return { ok: true, vehicle };
}

/** True when every field a driver needs before going online is present. */
function driverVehicleComplete(vehicle) {
  return Boolean(vehicle && vehicle.make && vehicle.model && Number.isInteger(vehicle.year) && vehicle.color &&
    vehicle.plate && STATE_SET.has(vehicle.plateState) && EQUIPMENT_SET.has(vehicle.equipmentType));
}

const VEHICLE_REQUIRED_MESSAGE = 'Add your vehicle and equipment details before going online.';

module.exports = { EQUIPMENT_TYPES, US_STATES, MIN_YEAR, maxYear, cleanDriverVehicle, driverVehicleComplete, VEHICLE_REQUIRED_MESSAGE };
