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

// Which services each equipment type can perform (keyed by the service ids in SERVICE_CATALOG,
// app.js). Towing needs a tow truck: a flatbed / rollback or a wheel-lift. Every equipment type
// can do the on-the-spot services (a tow truck carries the same jump pack, jack and lockout kit as
// a light-duty service vehicle). Services not listed here — including the scheduled services not
// offered at launch — go to no one, so a new service must be added here before drivers see it.
const ALL_EQUIPMENT = EQUIPMENT_TYPES;
const TOW_TRUCKS = Object.freeze(['flatbed', 'wheel_lift']);
const SERVICE_EQUIPMENT = Object.freeze({
  battery_jump: ALL_EQUIPMENT,
  flat_tire: ALL_EQUIPMENT,
  lockout: ALL_EQUIPMENT,
  fuel_delivery: ALL_EQUIPMENT,
  ev_charging: ALL_EQUIPMENT,
  oil_change: ALL_EQUIPMENT,
  towing: TOW_TRUCKS,
});
// A car the customer marked as electric goes on a flatbed only: lifting an EV by two wheels and
// rolling it on the others can damage its motors.
const ELECTRIC_TOW_EQUIPMENT = Object.freeze(['flatbed']);

const EQUIPMENT_NAMES = Object.freeze({ flatbed: 'flatbed / rollback', wheel_lift: 'wheel-lift tow truck', light_duty: 'light-duty service vehicle' });
const EQUIPMENT_MISMATCH_CODE = 'equipment_mismatch';

/** Service ids this equipment can perform, plus whether it may tow an electric vehicle. */
function equipmentCapability(equipmentType) {
  return {
    serviceTypes: Object.keys(SERVICE_EQUIPMENT).filter((service) => SERVICE_EQUIPMENT[service].includes(equipmentType)),
    electricTowing: ELECTRIC_TOW_EQUIPMENT.includes(equipmentType),
  };
}

/**
 * Can a driver with this equipment take this job? `job` is { serviceType, vehicleIsElectric }.
 * Returns { ok: true } or { ok: false, error } with a message the driver can act on.
 */
function canPerformService(equipmentType, job) {
  const serviceType = job && job.serviceType;
  const allowed = Object.hasOwn(SERVICE_EQUIPMENT, serviceType || '') ? SERVICE_EQUIPMENT[serviceType] : null;
  const yours = Object.hasOwn(EQUIPMENT_NAMES, equipmentType || '') ? `Your ${EQUIPMENT_NAMES[equipmentType]}` : 'Your equipment';
  if (!allowed || !allowed.includes(equipmentType)) {
    if (serviceType === 'towing') return { ok: false, error: `Towing needs a flatbed or wheel-lift tow truck. ${yours} can't take this job.` };
    return { ok: false, error: `${yours} can't take this job.` };
  }
  if (serviceType === 'towing' && job.vehicleIsElectric && !ELECTRIC_TOW_EQUIPMENT.includes(equipmentType)) {
    return { ok: false, error: `This is an electric vehicle, so it has to go on a flatbed. ${yours} can't take this job.` };
  }
  return { ok: true };
}

module.exports = {
  EQUIPMENT_TYPES, US_STATES, MIN_YEAR, maxYear, cleanDriverVehicle, driverVehicleComplete, VEHICLE_REQUIRED_MESSAGE,
  SERVICE_EQUIPMENT, ELECTRIC_TOW_EQUIPMENT, EQUIPMENT_MISMATCH_CODE, equipmentCapability, canPerformService,
};
