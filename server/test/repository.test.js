const test = require('node:test');
const assert = require('node:assert/strict');
const { PostgresRepository } = require('../repository');

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

  const [booking] = await repository.listAvailableBookings();
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
