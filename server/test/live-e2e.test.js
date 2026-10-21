const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const runLive = process.env.LIVE_E2E === '1';

test('live Supabase customer → verified driver → document → completed booking flow', { skip: !runLive, timeout: 60000 }, async () => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const suffix = randomUUID();
  const password = `Aid-${randomUUID()}-aA1!`;
  const customerEmail = `e2e-customer-${suffix}@example.com`;
  const driverEmail = `e2e-driver-${suffix}@example.com`;
  const createdIds = [];
  let bookingId;

  async function createUser(email, role) {
    const { data, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { role, first_name: 'E2E', last_name: role, phone: '+15555550100' },
    });
    if (error) throw error;
    createdIds.push(data.user.id);
    const { data: login, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) throw loginError;
    return { id: data.user.id, token: login.session.access_token };
  }

  async function api(pathname, token, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    return fetch(`http://127.0.0.1:3001/api${pathname}`, { ...options, headers });
  }

  try {
    const customer = await createUser(customerEmail, 'customer');
    const driver = await createUser(driverEmail, 'driver');
    await pool.query("update public.driver_profiles set verification_status='verified' where profile_id=$1", [driver.id]);

    const vehicleResponse = await api('/vehicles', customer.token, {
      method: 'POST', body: JSON.stringify({ make: 'Honda', model: 'Civic', year: 2022, color: 'Black', plate: 'E2E' }),
    });
    assert.equal(vehicleResponse.status, 201);
    const vehicle = await vehicleResponse.json();

    const bookingResponse = await api('/bookings', customer.token, {
      method: 'POST', body: JSON.stringify({
        serviceType: 'towing', vehicleId: vehicle.id,
        location: { address: '100 Main Street', lat: 32.7767, lng: -96.797 },
        dropoffLocation: { address: '200 Main Street', lat: 32.78, lng: -96.8 },
        notes: 'Private E2E gate instructions',
      }),
    });
    assert.equal(bookingResponse.status, 201);
    const booking = await bookingResponse.json();
    bookingId = booking.id;
    assert.equal(booking.estimatedPrice, 125);

    assert.equal((await api('/drivers/me/online', driver.token, { method: 'PATCH', body: JSON.stringify({ isOnline: true }) })).status, 200);
    const requestsResponse = await api('/drivers/requests', driver.token);
    assert.equal(requestsResponse.status, 200);
    const available = (await requestsResponse.json()).find((item) => item.id === bookingId);
    assert.ok(available);
    assert.equal(available.location.address, 'Approximate pickup area');
    assert.equal(available.dropoffLocation, undefined);
    assert.equal(available.notes, undefined);

    const acceptResponse = await api(`/bookings/${bookingId}/accept`, driver.token, { method: 'POST' });
    assert.equal(acceptResponse.status, 200);
    const accepted = await acceptResponse.json();
    assert.equal(accepted.location.address, '100 Main Street');
    assert.equal(accepted.dropoffLocation.address, '200 Main Street');
    assert.equal(accepted.notes, 'Private E2E gate instructions');
    for (const status of ['en_route', 'arrived', 'in_progress', 'completed']) {
      const response = await api(`/bookings/${bookingId}/status`, driver.token, { method: 'PATCH', body: JSON.stringify({ status }) });
      assert.equal(response.status, 200, `transition to ${status}`);
    }
    const customerBooking = await api(`/bookings/${bookingId}`, customer.token);
    assert.equal((await customerBooking.json()).status, 'completed');

    const form = new FormData();
    form.append('type', 'drivers_license');
    form.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])], { type: 'image/png' }), 'license.png');
    const documentResponse = await api('/drivers/me/documents', driver.token, { method: 'POST', body: form });
    assert.equal(documentResponse.status, 201);
    const document = await documentResponse.json();
    assert.match(document.fileUrl, /^https:/);
    const documentsResponse = await api('/drivers/me/documents', driver.token);
    assert.ok((await documentsResponse.json()).some((item) => item.id === document.id));
    assert.equal((await api(`/drivers/me/documents/${document.id}`, driver.token, { method: 'DELETE' })).status, 204);
  } finally {
    if (bookingId) await pool.query('delete from public.bookings where id=$1', [bookingId]).catch(() => {});
    for (const id of createdIds.reverse()) await supabase.auth.admin.deleteUser(id).catch(() => {});
    await pool.end();
  }
});
