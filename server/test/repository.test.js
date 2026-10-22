const test = require('node:test');
const assert = require('node:assert/strict');
const { PostgresRepository, ActiveBookingExistsError, mapProfile } = require('../repository');

function poolWith(handler) {
  return { query: handler };
}

test('repository persists server-normalized bookings in cents', async () => {
  let captured;
  const repository = new PostgresRepository(poolWith(async (text, values) => {
    captured = { text, values };
    return { rows: [{
      id: 'booking-1', customer_id: values[0], service_type: values[2], service_name: values[3], status: 'searching',
      location_address: values[4], location_lat: values[5], location_lng: values[6], estimated_price_cents: values[10],
      payment_status: 'pending', created_at: new Date('2026-01-01T00:00:00Z'),
    }] };
  }));

  const booking = await repository.createBooking({
    customerId: 'customer-1', vehicleId: null,
    service: { id: 'towing', name: 'Towing', basePrice: 125, estimatedTime: 60 },
    location: { address: '100 Main St', lat: 32.77, lng: -96.79 }, dropoffLocation: null,
    estimatedPrice: 125, notes: null,
  });

  assert.match(captured.text, /insert into public\.bookings/i);
  assert.equal(captured.values[10], 12500);
  assert.equal(booking.estimatedPrice, 125);
  assert.equal(booking.location.address, '100 Main St');
});

test('available-booking listings hide customer identity and precise pickup details until acceptance', async () => {
  const repository = new PostgresRepository(poolWith(async () => ({ rows: [{
    id: 'booking-1', customer_id: 'customer-1', service_type: 'towing', service_name: 'Towing', status: 'searching',
    location_address: '100 Main St, Dallas, TX', location_lat: 32.77671, location_lng: -96.79701,
    dropoff_address: '200 Private St, Dallas, TX', dropoff_lat: 32.8, dropoff_lng: -96.81,
    estimated_price_cents: 12500, payment_status: 'pending', notes: 'Gate code 1234', created_at: new Date('2026-01-01T00:00:00Z'),
    customer_name: 'Private Customer', customer_phone: '555-0100',
  }] })));

  const [booking] = await repository.listAvailableBookings({ serviceTypes: ['towing'] }, { minLat: 32, maxLat: 33, minLng: -97, maxLng: -96 });
  assert.deepEqual(booking.pickup, { lat: 32.77671, lng: -96.79701 }, 'exact pickup only for the API distance check (stripped before sending)');
  assert.equal(booking.customerName, undefined);
  assert.equal(booking.customerPhone, undefined);
  assert.equal(booking.customerId, undefined);
  assert.equal(booking.vehicle?.plate, undefined);
  assert.equal(booking.dropoffLocation, undefined);
  assert.equal(booking.notes, undefined);
  assert.equal(booking.location.address, 'Approximate pickup area');
  assert.equal(booking.location.lat, 32.78);
  assert.equal(booking.location.lng, -96.8);
  assert.ok(booking.expiresAt instanceof Date);
  assert.equal(Number.isNaN(booking.expiresAt.getTime()), false);
});

test('payment status cannot be downgraded after success', async () => {
  let captured;
  const repository = new PostgresRepository(poolWith(async (text, values) => {
    captured = { text, values };
    return { rows: [] };
  }));

  await repository.updatePaymentStatus('pi_1', 'processing');

  assert.match(captured.text, /payment_status <> 'succeeded'/i);
});

test('booking acceptance uses a conditional update to prevent double assignment', async () => {
  let sql = '';
  const repository = new PostgresRepository(poolWith(async (text) => {
    sql = text;
    return { rows: [] };
  }));
  const result = await repository.acceptBooking('booking-1', 'driver-1');
  assert.equal(result, null);
  assert.match(sql, /status = 'searching'/i);
  assert.match(sql, /driver_id is null/i);
});

test('account deletion removes user-owned marketplace data in a transaction', async () => {
  const queries = [];
  const client = {
    async query(text, values) {
      queries.push({ text, values });
      if (/select storage_path/i.test(text)) return { rows: [{ storage_path: 'driver/docs/license.png' }] };
      return { rows: [] };
    },
    release() {},
  };
  const repository = new PostgresRepository({ connect: async () => client });

  const result = await repository.prepareAccountDeletion('user-1');

  assert.deepEqual(result.storagePaths, ['driver/docs/license.png']);
  assert.equal(queries[0].text, 'begin');
  assert.match(queries.map((query) => query.text).join('\n'), /delete from public\.bookings where customer_id=\$1'?$/im);
  assert.doesNotMatch(queries.map((query) => query.text).join('\n'), /delete from public\.bookings[^\n]*driver_id/i);
  assert.match(queries.map((query) => query.text).join('\n'), /update public\.bookings set driver_id=null/i);
  assert.match(queries.map((query) => query.text).join('\n'), /delete from public\.vehicles/i);
  assert.equal(queries.at(-1).text, 'commit');
});

const PARTY_ROW = {
  id: 'booking-9', customer_id: 'customer-1', driver_id: 'driver-1', service_type: 'towing', service_name: 'Towing', status: 'en_route',
  location_address: '500 Elm St', location_lat: 33.21, location_lng: -97.13,
  dropoff_address: "Joe's Garage", dropoff_lat: 33.05, dropoff_lng: -96.99,
  estimated_price_cents: 15215, payment_status: 'pending', notes: 'Hazards on', created_at: new Date('2026-01-01T00:00:00Z'),
  vehicle_id: 'veh-1', vehicle_label: '2020 Honda Civic', vehicle_plate: 'ABC123', vehicle_color: 'Blue',
  driver_lat: 33.1, driver_lng: -97.0, driver_location_at: new Date('2026-01-01T00:05:00Z'),
  party_customer_first_name: 'Casey', party_customer_last_name: 'Customer', party_customer_phone: '555-0100',
  party_driver_first_name: 'Marcus', party_driver_last_name: 'Thompson', party_driver_phone: '555-0199',
  party_driver_rating: '4.90', party_driver_total_jobs: 212,
  party_driver_vehicle_make: 'Ford', party_driver_vehicle_model: 'F-550 Flatbed', party_driver_vehicle_color: 'White', party_driver_vehicle_plate: 'TOW-77',
};

test('customer sees the assigned driver, their vehicle and live location during a job', async () => {
  let sql = '';
  const repository = new PostgresRepository(poolWith(async (text) => { sql = text; return { rows: [PARTY_ROW] }; }));
  const booking = await repository.getBooking('booking-9', 'customer-1', 'customer');
  assert.match(sql, /left join public\.profiles d on d\.id ?= ?b\.driver_id/i);
  assert.deepEqual(booking.driver, {
    id: 'driver-1', name: 'Marcus T.', firstName: 'Marcus', phone: '555-0199', rating: 4.9, totalJobs: 212,
    vehicle: { make: 'Ford', model: 'F-550 Flatbed', color: 'White', plate: 'TOW-77' },
  });
  assert.deepEqual(booking.driverLocation, { lat: 33.1, lng: -97.0, updatedAt: '2026-01-01T00:05:00.000Z' });
  assert.equal(booking.customer, undefined, 'customer does not need their own contact card');
});

test('driver sees the customer contact, notes, tow destination and plate during a job', async () => {
  const repository = new PostgresRepository(poolWith(async () => ({ rows: [PARTY_ROW] })));
  const booking = await repository.getActiveBooking('driver-1', 'driver');
  assert.deepEqual(booking.customer, { name: 'Casey C.', firstName: 'Casey', phone: '555-0100' });
  assert.equal(booking.notes, 'Hazards on');
  assert.equal(booking.dropoffLocation.address, "Joe's Garage");
  assert.equal(booking.vehicle.plate, 'ABC123');
  assert.equal(booking.vehicle.color, 'Blue');
  assert.equal(booking.driver, undefined);
});

test('phone numbers and live location are hidden once a job is over', async () => {
  const repository = new PostgresRepository(poolWith(async () => ({ rows: [{ ...PARTY_ROW, status: 'completed' }] })));
  const forCustomer = await repository.getBooking('booking-9', 'customer-1', 'customer');
  assert.equal(forCustomer.driver.name, 'Marcus T.');
  assert.equal(forCustomer.driver.phone, undefined);
  assert.equal(forCustomer.driverLocation, undefined);
  const forDriver = await repository.getBooking('booking-9', 'driver-1', 'driver');
  assert.equal(forDriver.customer.phone, undefined);
});

test('no driver card is shown before a driver accepts', async () => {
  const row = { ...PARTY_ROW, status: 'searching', driver_id: null, party_driver_first_name: null, party_driver_last_name: null, party_driver_phone: null, party_driver_rating: null, party_driver_total_jobs: null, party_driver_vehicle_make: null, driver_lat: null, driver_lng: null, driver_location_at: null };
  const repository = new PostgresRepository(poolWith(async () => ({ rows: [row] })));
  const booking = await repository.getBooking('booking-9', 'customer-1', 'customer');
  assert.equal(booking.driver, undefined);
  assert.equal(booking.driverLocation, undefined);
});

test('accepting and status changes return the booking with both parties', async () => {
  const queries = [];
  const repository = new PostgresRepository(poolWith(async (text) => { queries.push(text); return { rows: [PARTY_ROW] }; }));
  const accepted = await repository.acceptBooking('booking-9', 'driver-1');
  assert.equal(accepted.customer.phone, '555-0100');
  const updated = await repository.updateBookingStatus('booking-9', 'customer-1', 'customer', 'cancelled', ['accepted']);
  assert.equal(updated.driver.name, 'Marcus T.');
});

test('status changes are compare-and-set, timestamped, audited and stop location sharing when the job ends', async () => {
  const calls = [];
  const repository = new PostgresRepository(poolWith(async (text, values) => { calls.push({ text, values }); return { rows: [PARTY_ROW] }; }));
  await repository.updateBookingStatus('booking-9', 'driver-1', 'driver', 'cancelled', ['arrived'], { reason: 'cannot_reach_customer' });
  const { text, values } = calls[0];
  assert.match(text, /driver_id=\$2 and status=any\(\$4::text\[\]\) for update/);
  assert.match(text, /cancelled_at=case when \$3='cancelled' then now\(\)/);
  assert.match(text, /arrived_at=case when \$3='arrived' then now\(\)/);
  assert.match(text, /driver_lat=case when \$3 in \('completed','cancelled'\) then null/);
  assert.match(text, /insert into public\.booking_events \(booking_id, actor_id, event_type, from_status, to_status, metadata\)/);
  assert.match(text, /select id, \$2, 'status_changed', from_status, \$3, \$5::jsonb from upd/);
  assert.deepEqual(values, ['booking-9', 'driver-1', 'cancelled', ['arrived'], JSON.stringify({ role: 'driver', reason: 'cannot_reach_customer' })]);

  await repository.updateBookingStatus('booking-9', 'customer-1', 'customer', 'cancelled', ['accepted']);
  assert.match(calls[2].text, /customer_id=\$2/);
  assert.equal(calls[2].values[4], JSON.stringify({ role: 'customer' }));
});

test('a driver with an unfinished job cannot accept another, and accepting is audited', async () => {
  const calls = [];
  const repository = new PostgresRepository(poolWith(async (text, values) => { calls.push({ text, values }); return { rows: [] }; }));
  assert.equal(await repository.acceptBooking('booking-9', 'driver-1'), null);
  assert.match(calls[0].text, /not exists \(select 1 from public\.bookings o where o\.driver_id=\$2 and o\.status = any\(\$3::text\[\]\)\)/);
  assert.deepEqual(calls[0].values[2], ['accepted', 'en_route', 'arrived', 'in_progress']);
  assert.match(calls[0].text, /'status_changed', 'searching', 'accepted'/);
});

test('bookings expose each lifecycle timestamp and who cancelled', async () => {
  const row = { ...PARTY_ROW, status: 'cancelled', arrived_at: new Date('2026-01-01T00:20:00Z'), cancelled_at: new Date('2026-01-01T00:25:00Z'), cancelled_by: 'driver' };
  const repository = new PostgresRepository(poolWith(async () => ({ rows: [row] })));
  const booking = await repository.getBooking('booking-9', 'customer-1', 'customer');
  assert.equal(booking.cancelledBy, 'driver');
  assert.equal(booking.arrivedAt.toISOString(), '2026-01-01T00:20:00.000Z');
  assert.equal(booking.cancelledAt.toISOString(), '2026-01-01T00:25:00.000Z');
});

test('issue reports are stored on the booking audit trail', async () => {
  let captured;
  const repository = new PostgresRepository(poolWith(async (text, values) => { captured = { text, values }; return { rows: [{ id: 41, created_at: new Date('2026-01-01T01:00:00Z') }] }; }));
  const issue = await repository.reportBookingIssue('booking-9', 'driver-1', { role: 'driver', category: 'safety', details: '', status: 'in_progress' });
  assert.match(captured.text, /'issue_reported'/);
  assert.deepEqual(captured.values, ['booking-9', 'driver-1', 'in_progress', JSON.stringify({ role: 'driver', category: 'safety', details: null })]);
  assert.deepEqual(issue, { id: '41', bookingId: 'booking-9', category: 'safety', status: 'in_progress', createdAt: '2026-01-01T01:00:00.000Z' });
});

test('driver location updates record when the location was taken', async () => {
  const queries = [];
  const repository = new PostgresRepository(poolWith(async (text) => { queries.push(text); return { rows: [PARTY_ROW] }; }));
  await repository.updateDriverLocation('booking-9', 'driver-1', { lat: 33.1, lng: -97.0 });
  assert.match(queries.join('\n'), /driver_location_at\s*=\s*now\(\)/i);
  assert.match(queries.join('\n'), /status\s*=\s*any/i);
});

test('drivers can save the vehicle customers should look for', async () => {
  let captured;
  const repository = new PostgresRepository(poolWith(async (text, values) => {
    captured = { text, values };
    return { rows: [{ vehicle_make: 'Ford', vehicle_model: 'F-550', vehicle_year: 2021, vehicle_color: 'White', vehicle_plate: 'TOW-77', vehicle_plate_state: 'TX', vehicle_equipment_type: 'flatbed' }] };
  }));
  const vehicle = await repository.updateDriverVehicle('driver-1', { make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed' });
  assert.match(captured.text, /update public\.driver_profiles set vehicle_make/i);
  assert.deepEqual(captured.values, ['driver-1', 'Ford', 'F-550', 2021, 'White', 'TOW-77', 'TX', 'flatbed']);
  assert.deepEqual(vehicle, { make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed' });
});

test('driver profile includes the full service vehicle, or null before it is added', async () => {
  const base = { id: 'driver-1', role: 'driver', status: 'active', verification_status: 'verified', is_online: false };
  const withVehicle = mapProfile({ ...base, vehicle_make: 'Ford', vehicle_model: 'F-550', vehicle_year: 2021, vehicle_color: 'White', vehicle_plate: 'TOW-77', vehicle_plate_state: 'TX', vehicle_equipment_type: 'wheel_lift' });
  assert.deepEqual(withVehicle.driverVehicle, { make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'wheel_lift' });
  // Vehicles saved before D5 have no year/state/equipment yet: returned as incomplete, not invented.
  const legacy = mapProfile({ ...base, vehicle_make: 'Ford', vehicle_model: 'F-550', vehicle_year: null, vehicle_color: 'White', vehicle_plate: 'TOW-77', vehicle_plate_state: '', vehicle_equipment_type: '' });
  assert.deepEqual(legacy.driverVehicle, { make: 'Ford', model: 'F-550', year: null, color: 'White', plate: 'TOW-77', plateState: '', equipmentType: '' });
  assert.equal(mapProfile({ ...base, vehicle_make: '' }).driverVehicle, null);
});

test('customer gets an approximate ETA from the driver\'s last shared position while they head over', async () => {
  const repository = new PostgresRepository(poolWith(async () => ({ rows: [PARTY_ROW] })));
  const booking = await repository.getBooking('booking-9', 'customer-1', 'customer');
  // 33.1,-97.0 -> pickup 33.21,-97.13 ≈ 13.4 road miles at 30 mph
  assert.deepEqual(booking.driverEta, { miles: 13.4, minutes: 27, approximate: true, fromLocationAt: '2026-01-01T00:05:00.000Z' });
});

test('no ETA before the driver shares a location, after they arrive, or once the job is over', async () => {
  const rows = [
    { ...PARTY_ROW, status: 'accepted', driver_lat: null, driver_lng: null, driver_location_at: null },
    { ...PARTY_ROW, status: 'arrived' },
    { ...PARTY_ROW, status: 'in_progress' },
    { ...PARTY_ROW, status: 'cancelled' },
  ];
  for (const row of rows) {
    const repository = new PostgresRepository(poolWith(async () => ({ rows: [row] })));
    const booking = await repository.getBooking('booking-9', 'customer-1', 'customer');
    assert.equal(booking.driverEta, undefined, row.status);
  }
});

test('open requests and accepts are limited to what the driver equipment can perform', async () => {
  const calls = [];
  const repository = new PostgresRepository(poolWith(async (text, values) => {
    calls.push({ text, values });
    return { rows: /select b\.id, b\.service_type/.test(text) ? [{ id: 'booking-9', service_type: 'towing', vehicle_is_electric: true, location_lat: 32.7, location_lng: -96.8 }] : [] };
  }));
  const capability = { serviceTypes: ['battery_jump', 'towing'], electricTowing: false };
  const area = { minLat: 32, maxLat: 33, minLng: -97, maxLng: -96 };
  await repository.listAvailableBookings(capability, area);
  assert.match(calls[0].text, /b\.service_type = any\(\$1::text\[\]\)/);
  assert.match(calls[0].text, /\$2::boolean or b\.service_type <> 'towing' or not coalesce\(v\.is_electric, false\)/);
  assert.match(calls[0].text, /b\.location_lat between \$3 and \$4 and b\.location_lng between \$5 and \$6/);
  assert.deepEqual(calls[0].values, [['battery_jump', 'towing'], false, 32, 33, -97, -96, 32.5, -96.5, 15]);
  assert.match(calls[0].text, /b\.created_at > now\(\) - make_interval\(mins => \$9::int\)/, 'requests past the expiry window are never listed');

  await repository.listAvailableBookings(undefined, area);
  assert.deepEqual(calls[1].values.slice(0, 2), [[], false], 'no capability means no requests');
  assert.deepEqual(await repository.listAvailableBookings(capability), [], 'no area (driver position) means no requests');
  assert.equal(calls.length, 2, 'and no query is run');

  assert.deepEqual(await repository.getAvailableBooking('booking-9'), { id: 'booking-9', serviceType: 'towing', vehicleIsElectric: true, pickup: { lat: 32.7, lng: -96.8 } });
  assert.match(calls[2].text, /b\.status='searching' and b\.driver_id is null/);

  assert.equal(await repository.acceptBooking('booking-9', 'driver-1', capability), null);
  assert.match(calls[3].text, /b\.service_type = any\(\$4::text\[\]\)/);
  assert.match(calls[3].text, /\$5::boolean or b\.service_type <> 'towing'\s+or not exists \(select 1 from public\.vehicles v where v\.id = b\.vehicle_id and v\.is_electric\)/);
  assert.deepEqual(calls[3].values.slice(3), [['battery_jump', 'towing'], false, 15]);
  assert.match(calls[2].text, /b\.created_at > now\(\) - make_interval\(mins => \$2::int\)/);
  assert.match(calls[3].text, /b\.created_at > now\(\) - make_interval\(mins => \$6::int\)/, 'an overdue request can never be accepted');
});

// ---- E4: one active request per customer; stale work ends on its own ----

test('a second active request hitting the unique index becomes ActiveBookingExistsError', async () => {
  const repository = new PostgresRepository(poolWith(async () => {
    throw Object.assign(new Error('duplicate key value violates unique constraint "bookings_one_active_per_customer"'), {
      code: '23505', constraint: 'bookings_one_active_per_customer',
    });
  }));
  const input = {
    customerId: 'customer-1', vehicleId: null, service: { id: 'battery_jump', name: "Won't start" },
    location: { address: '1 Main', lat: 32.7, lng: -96.8 }, dropoffLocation: null, estimatedPrice: 69, notes: null,
  };
  await assert.rejects(repository.createBooking(input), (error) => error instanceof ActiveBookingExistsError && error.code === 'active_request_exists');
  const other = new PostgresRepository(poolWith(async () => { throw Object.assign(new Error('other unique'), { code: '23505', constraint: 'bookings_pkey' }); }));
  await assert.rejects(other.createBooking(input), (error) => !(error instanceof ActiveBookingExistsError), 'other conflicts are not hidden');
});

test('a racing second accept by the same driver (driver unique index) is "not accepted", not a crash', async () => {
  const repository = new PostgresRepository(poolWith(async () => {
    throw Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'bookings_one_active_job_per_driver' });
  }));
  assert.equal(await repository.acceptBooking('booking-1', 'driver-1', { serviceTypes: ['battery_jump'] }), null);
  const broken = new PostgresRepository(poolWith(async () => { throw Object.assign(new Error('boom'), { code: '57014' }); }));
  await assert.rejects(broken.acceptBooking('booking-1', 'driver-1', { serviceTypes: ['battery_jump'] }), /boom/);
});

test('expiry sweep: one audited statement, configurable windows, optional scope', async () => {
  const calls = [];
  const repository = new PostgresRepository(poolWith(async (text, values) => {
    calls.push({ text, values });
    return { rows: [{ kind: 'expired', id: 'b-1' }, { kind: 'released', id: 'b-2' }] };
  }), { requestExpiryMinutes: 7, staleJobMinutes: 45 });
  assert.deepEqual(await repository.expireStaleBookings({ customerId: 'customer-1' }), { expired: ['b-1'], released: ['b-2'] });
  const [{ text, values }] = calls;
  assert.deepEqual(values, ['customer-1', null, null, ['pending', 'searching'], ['accepted', 'en_route'], 7, 45]);
  assert.match(text, /set status='expired', expired_at=now\(\)/);
  assert.match(text, /b\.created_at <= now\(\) - make_interval\(mins => \$6::int\)/);
  assert.match(text, /set status='cancelled', cancelled_at=now\(\), driver_lat=null, driver_lng=null/);
  assert.match(text, /greatest\(b\.accepted_at, b\.driver_location_at,/, 'silent = no location and no status change');
  assert.match(text, /for update skip locked/);
  assert.match(text, /'role', 'system', 'reason', 'no_driver_found'/);
  assert.match(text, /'role', 'system', 'reason', 'driver_unresponsive'/);
  await repository.expireStaleBookings();
  assert.deepEqual(calls[1].values.slice(0, 3), [null, null, null], 'the interval sweep is unscoped');
});

test('open requests carry their expiry time; system endings say why', async () => {
  const created = new Date('2026-10-22T12:00:00Z');
  const repository = new PostgresRepository(poolWith(async () => ({ rows: [{
    ...PARTY_ROW, status: 'searching', driver_id: null, created_at: created,
  }] })), { requestExpiryMinutes: 15 });
  const open = await repository.getBooking('booking-1', 'customer-1', 'customer');
  assert.equal(open.expiresAt, '2026-10-22T12:15:00.000Z');

  const ended = new PostgresRepository(poolWith(async () => ({ rows: [{
    ...PARTY_ROW, status: 'expired', driver_id: null, created_at: created, expired_at: new Date('2026-10-22T12:15:30Z'), system_end_reason: 'no_driver_found',
  }] })));
  const expired = await ended.getBooking('booking-1', 'customer-1', 'customer');
  assert.equal(expired.status, 'expired');
  assert.equal(expired.endReason, 'no_driver_found');
  assert.ok(expired.expiredAt);
  assert.equal(expired.expiresAt, undefined);
});

test('driver position: stored with a timestamp, ignored when stale, forgotten when going offline', async () => {
  const calls = [];
  const repository = new PostgresRepository(poolWith(async (text, values) => {
    calls.push({ text, values });
    return { rows: /select current_lat/.test(text) ? [{ current_lat: 32.7, current_lng: -96.8, current_location_at: new Date() }] : [{ id: 'x' }] };
  }));
  await repository.updateDriverPosition('driver-1', { lat: 32.7, lng: -96.8 });
  assert.match(calls[0].text, /current_lat=\$2, current_lng=\$3, current_location_at=now\(\)/);
  const position = await repository.getDriverPosition('driver-1', 10);
  assert.deepEqual([position.lat, position.lng], [32.7, -96.8]);
  assert.match(calls[1].text, /current_location_at > now\(\) - make_interval\(mins => \$2::int\)/);
  assert.deepEqual(calls[1].values, ['driver-1', 10]);
  await repository.updateDriverOnlineStatus('driver-1', false);
  assert.match(calls[2].text, /current_lat = case when \$2 then current_lat end/);
  assert.match(calls[2].text, /current_location_at = case when \$2 then current_location_at end/);
});
