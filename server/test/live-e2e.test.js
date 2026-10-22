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
  let secondBookingId;

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
    const reviewer = await createUser(`e2e-admin-${suffix}@example.com`, 'customer');
    await pool.query("update public.profiles set role='admin' where id=$1", [reviewer.id]);

    // Individual-provider onboarding: upload every required document, submit, admin reviews.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    for (const [type, expiresOn] of [['drivers_license', '2099-01-31'], ['identification', null], ['insurance', '2098-06-30'], ['vehicle_registration', '2099-01-31']]) {
      const form = new FormData();
      form.append('type', type);
      if (expiresOn) form.append('expiresOn', expiresOn);
      form.append('file', new Blob([png], { type: 'image/png' }), `${type}.png`);
      assert.equal((await api('/drivers/me/documents', driver.token, { method: 'POST', body: form })).status, 201, `upload ${type}`);
    }
    assert.equal((await api('/drivers/requests', driver.token)).status, 403, 'unverified drivers cannot see jobs');
    assert.equal((await api('/drivers/me/verification/submit', driver.token, { method: 'POST' })).status, 200);
    assert.equal((await api('/admin/drivers', driver.token)).status, 403, 'drivers cannot use admin endpoints');
    const queue = await (await api('/admin/drivers?status=under_review', reviewer.token)).json();
    assert.ok(queue.some((item) => item.id === driver.id && item.email === driverEmail));
    const detail = await (await api(`/admin/drivers/${driver.id}`, reviewer.token)).json();
    assert.equal(detail.documents.length, 4);
    assert.match(detail.documents[0].fileUrl, /^https:/);
    for (const doc of detail.documents) {
      const review = await api(`/admin/documents/${doc.id}/review`, reviewer.token, { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
      assert.equal(review.status, 200);
    }
    const verified = await api(`/admin/drivers/${driver.id}/decision`, reviewer.token, { method: 'POST', body: JSON.stringify({ decision: 'verify' }) });
    assert.equal(verified.status, 200);
    assert.equal((await verified.json()).credentialsValidUntil, '2098-06-30');
    const audit = await (await api(`/admin/drivers/${driver.id}`, reviewer.token)).json();
    assert.deepEqual(audit.events.map((event) => event.action).slice(0, 2), ['verified', 'document_approved']);

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
    assert.equal(booking.estimatedPrice, 95); // short tow: hook-up fee covers the first 5 miles

    // D5: a verified driver still needs vehicle + equipment details before going online; offline always works.
    const blockedOnline = await api('/drivers/me/online', driver.token, { method: 'PATCH', body: JSON.stringify({ isOnline: true }) });
    assert.equal(blockedOnline.status, 403);
    assert.equal((await blockedOnline.json()).code, 'vehicle_required');
    assert.equal((await api('/drivers/me/online', driver.token, { method: 'PATCH', body: JSON.stringify({ isOnline: false }) })).status, 200);
    const badVehicle = await api('/drivers/me/vehicle', driver.token, { method: 'PATCH', body: JSON.stringify({ make: 'Ford', model: 'F-550 Flatbed', year: 1970, color: 'White', plate: 'e2e-1', plateState: 'TX', equipmentType: 'flatbed' }) });
    assert.equal(badVehicle.status, 400);
    assert.equal((await badVehicle.json()).field, 'year');
    const driverVehicleResponse = await api('/drivers/me/vehicle', driver.token, { method: 'PATCH', body: JSON.stringify({ make: 'Ford', model: 'F-550 Flatbed', year: 2021, color: 'White', plate: 'e2e-1', plateState: 'tx', equipmentType: 'flatbed' }) });
    assert.equal(driverVehicleResponse.status, 200);
    const savedVehicle = { make: 'Ford', model: 'F-550 Flatbed', year: 2021, color: 'White', plate: 'E2E-1', plateState: 'TX', equipmentType: 'flatbed' };
    assert.deepEqual(await driverVehicleResponse.json(), savedVehicle);
    assert.deepEqual((await (await api('/me', driver.token)).json()).driverVehicle, savedVehicle, 'vehicle persists on the driver profile');

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
    assert.ok(accepted.customer?.firstName !== undefined, 'driver sees the customer card after accepting');

    assert.equal((await api(`/bookings/${bookingId}/status`, driver.token, { method: 'PATCH', body: JSON.stringify({ status: 'en_route' }) })).status, 200);
    const locationResponse = await api(`/bookings/${bookingId}/driver-location`, driver.token, { method: 'PATCH', body: JSON.stringify({ location: { lat: 32.79, lng: -96.81 } }) });
    assert.equal(locationResponse.status, 200);
    const tracking = await (await api('/bookings/active', customer.token)).json();
    assert.equal(tracking.id, bookingId);
    assert.deepEqual(tracking.driver.vehicle, { make: 'Ford', model: 'F-550 Flatbed', color: 'White', plate: 'E2E-1' });
    assert.equal(tracking.driverLocation.lat, 32.79);
    assert.ok(Date.now() - new Date(tracking.driverLocation.updatedAt).getTime() < 120000, 'location timestamp is fresh');

    for (const status of ['arrived', 'in_progress', 'completed']) {
      const response = await api(`/bookings/${bookingId}/status`, driver.token, { method: 'PATCH', body: JSON.stringify({ status }) });
      assert.equal(response.status, 200, `transition to ${status}`);
    }
    const customerBooking = await (await api(`/bookings/${bookingId}`, customer.token)).json();
    assert.equal(customerBooking.status, 'completed');
    assert.equal(customerBooking.driver.phone, undefined, 'driver phone is hidden after the job');
    assert.equal(customerBooking.driverLocation, undefined, 'live location is hidden after the job');
    assert.ok(customerBooking.arrivedAt && customerBooking.startedAt && customerBooking.completedAt, 'each step is timestamped');
    const trail = await pool.query('select actor_id, from_status, to_status from public.booking_events where booking_id=$1 and event_type=$2 order by id', [bookingId, 'status_changed']);
    assert.deepEqual(trail.rows.map((row) => `${row.from_status}→${row.to_status}`),
      ['searching→accepted', 'accepted→en_route', 'en_route→arrived', 'arrived→in_progress', 'in_progress→completed']);
    assert.ok(trail.rows.every((row) => row.actor_id === driver.id));
    const stored = await pool.query('select driver_lat from public.bookings where id=$1', [bookingId]);
    assert.equal(stored.rows[0].driver_lat, null, 'last shared position is cleared when the job ends');

    // B10 cancel rules against the real database.
    const secondResponse = await api('/bookings', customer.token, { method: 'POST', body: JSON.stringify({ serviceType: 'battery_jump', location: { address: '300 Main Street', lat: 32.7767, lng: -96.797 } }) });
    assert.equal(secondResponse.status, 201);
    secondBookingId = (await secondResponse.json()).id;
    assert.equal((await api(`/bookings/${secondBookingId}/accept`, driver.token, { method: 'POST' })).status, 200);
    const skipped = await api(`/bookings/${secondBookingId}/status`, driver.token, { method: 'PATCH', body: JSON.stringify({ status: 'in_progress' }) });
    assert.equal(skipped.status, 409, 'cannot skip steps');
    assert.equal((await skipped.json()).currentStatus, 'accepted');
    assert.equal((await api(`/bookings/${secondBookingId}/status`, customer.token, { method: 'PATCH', body: JSON.stringify({ status: 'en_route' }) })).status, 400, 'customers cannot move the job');
    for (const status of ['en_route', 'arrived']) {
      assert.equal((await api(`/bookings/${secondBookingId}/status`, driver.token, { method: 'PATCH', body: JSON.stringify({ status }) })).status, 200);
    }
    assert.equal((await api(`/bookings/${secondBookingId}/status`, customer.token, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })).status, 409, 'customer cannot cancel after arrival');
    assert.equal((await api(`/bookings/${secondBookingId}/status`, driver.token, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })).status, 400, 'driver needs a reason');
    const issue = await api(`/bookings/${secondBookingId}/issues`, customer.token, { method: 'POST', body: JSON.stringify({ category: 'other', details: 'E2E issue report' }) });
    assert.equal(issue.status, 201);
    const driverCancel = await api(`/bookings/${secondBookingId}/status`, driver.token, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', reason: 'cannot_reach_customer' }) });
    assert.equal(driverCancel.status, 200);
    const cancelled = await (await api(`/bookings/${secondBookingId}`, customer.token)).json();
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelledBy, 'driver');
    assert.ok(cancelled.cancelledAt);
    assert.equal(await (await api('/bookings/active', driver.token)).json(), null, 'driver is free after cancelling');
    assert.equal((await api(`/bookings/${secondBookingId}/driver-location`, driver.token, { method: 'PATCH', body: JSON.stringify({ location: { lat: 32.79, lng: -96.81 } }) })).status, 404, 'location sharing stops');
    const cancelEvent = await pool.query("select metadata from public.booking_events where booking_id=$1 and to_status='cancelled' and event_type='status_changed'", [secondBookingId]);
    assert.deepEqual(cancelEvent.rows[0].metadata, { role: 'driver', reason: 'cannot_reach_customer' });
    const issueEvent = await pool.query("select actor_id, metadata from public.booking_events where booking_id=$1 and event_type='issue_reported'", [secondBookingId]);
    assert.equal(issueEvent.rows[0].actor_id, customer.id);
    assert.equal(issueEvent.rows[0].metadata.details, 'E2E issue report');

    const form = new FormData();
    form.append('type', 'identification');
    form.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])], { type: 'image/png' }), 'license.png');
    const documentResponse = await api('/drivers/me/documents', driver.token, { method: 'POST', body: form });
    assert.equal(documentResponse.status, 201);
    const document = await documentResponse.json();
    assert.match(document.fileUrl, /^https:/);
    const documentsResponse = await api('/drivers/me/documents', driver.token);
    assert.ok((await documentsResponse.json()).some((item) => item.id === document.id));
    assert.equal((await api(`/drivers/me/documents/${document.id}`, driver.token, { method: 'DELETE' })).status, 204);
  } finally {
    const stored = await pool.query('select storage_path from public.driver_documents where driver_id = any($1::uuid[])', [createdIds]).catch(() => ({ rows: [] }));
    // A fresh service client: `supabase` above now carries the last test user's session.
    const storageAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    if (stored.rows.length) {
      const { data: removed } = await storageAdmin.storage.from('driver-documents').remove(stored.rows.map((row) => row.storage_path));
      assert.equal(removed?.length, stored.rows.length, 'every uploaded test document must be removed from storage');
    }
    if (bookingId) await pool.query('delete from public.bookings where id=$1', [bookingId]).catch(() => {});
    if (secondBookingId) await pool.query('delete from public.bookings where id=$1', [secondBookingId]).catch(() => {});
    for (const id of createdIds.reverse()) await supabase.auth.admin.deleteUser(id).catch(() => {});
    await pool.end();
  }
});
