const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const runLive = process.env.LIVE_E2E === '1';

test('live Supabase customer → verified driver → document → completed booking flow', { skip: !runLive, timeout: 120000 }, async () => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const suffix = randomUUID();
  const password = `Aid-${randomUUID()}-aA1!`;
  const customerEmail = `e2e-customer-${suffix}@example.com`;
  const driverEmail = `e2e-driver-${suffix}@example.com`;
  const createdIds = [];
  let bookingId;
  let secondBookingId;
  let farBookingId;
  const e4BookingIds = [];

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
    const otherCustomer = await createUser(`e2e-customer2-${suffix}@example.com`, 'customer');
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
    assert.ok(booking.expiresAt, 'an open request says when it expires');

    // E4: one active request per customer — a second one is refused and points at the first.
    const duplicate = await api('/bookings', customer.token, { method: 'POST', body: JSON.stringify({ serviceType: 'battery_jump', location: { address: '1 Elm', lat: 32.7767, lng: -96.797 } }) });
    assert.equal(duplicate.status, 409);
    const duplicateBody = await duplicate.json();
    assert.equal(duplicateBody.code, 'active_request_exists');
    assert.equal(duplicateBody.booking.id, bookingId);
    // The database itself refuses a second active row, even bypassing the API's pre-check.
    await assert.rejects(pool.query(`insert into public.bookings (customer_id, service_type, service_name, location_address, location_lat, location_lng, estimated_price_cents)
      values ($1, 'battery_jump', 'x', 'x', 32.7, -96.8, 6900)`, [customer.id]), (error) => error.code === '23505' && error.constraint === 'bookings_one_active_per_customer');

    // D5: a verified driver still needs vehicle + equipment details before going online; offline always works.
    const blockedOnline = await api('/drivers/me/online', driver.token, { method: 'PATCH', body: JSON.stringify({ isOnline: true }) });
    assert.equal(blockedOnline.status, 403);
    assert.equal((await blockedOnline.json()).code, 'vehicle_required');
    assert.equal((await api('/drivers/me/online', driver.token, { method: 'PATCH', body: JSON.stringify({ isOnline: false }) })).status, 200);
    const badVehicle = await api('/drivers/me/vehicle', driver.token, { method: 'PATCH', body: JSON.stringify({ make: 'Ford', model: 'F-550 Flatbed', year: 1970, color: 'White', plate: 'e2e-1', plateState: 'TX', equipmentType: 'flatbed' }) });
    assert.equal(badVehicle.status, 400);
    assert.equal((await badVehicle.json()).field, 'year');

    // Equipment decides which jobs a driver sees and can accept (the open request is a tow).
    const setEquipment = async (equipmentType) => assert.equal((await api('/drivers/me/vehicle', driver.token, {
      method: 'PATCH', body: JSON.stringify({ make: 'Ford', model: 'Transit', year: 2021, color: 'White', plate: 'e2e-1', plateState: 'TX', equipmentType }),
    })).status, 200, `save ${equipmentType}`);
    const NEAR = 'lat=32.7767&lng=-96.797'; // the driver is parked at the pickup
    const seesTow = async () => (await (await api(`/drivers/requests?${NEAR}`, driver.token)).json()).requests.some((item) => item.id === bookingId);
    await setEquipment('light_duty');
    assert.equal((await api('/drivers/me/online', driver.token, { method: 'PATCH', body: JSON.stringify({ isOnline: true }) })).status, 200);
    assert.equal(await seesTow(), false, 'a light-duty vehicle is not offered tows');
    const refusedTow = await api(`/bookings/${bookingId}/accept`, driver.token, { method: 'POST' });
    assert.equal(refusedTow.status, 403);
    const refusedBody = await refusedTow.json();
    assert.equal(refusedBody.code, 'equipment_mismatch');
    assert.equal(refusedBody.error, "Towing needs a flatbed or wheel-lift tow truck. Your light-duty service vehicle can't take this job.");
    assert.deepEqual((await pool.query('select status, driver_id from public.bookings where id=$1', [bookingId])).rows[0], { status: 'searching', driver_id: null }, 'refused accept leaves the request open');
    await setEquipment('wheel_lift');
    assert.equal(await seesTow(), true, 'a wheel-lift sees a regular tow');
    await pool.query('update public.vehicles set is_electric=true where id=$1', [vehicle.id]);
    assert.equal(await seesTow(), false, 'electric cars are not offered to wheel-lifts');
    const refusedEv = await api(`/bookings/${bookingId}/accept`, driver.token, { method: 'POST' });
    assert.equal(refusedEv.status, 403);
    assert.match((await refusedEv.json()).error, /electric vehicle, so it has to go on a flatbed/);
    await setEquipment('flatbed');
    assert.equal(await seesTow(), true, 'a flatbed sees the electric tow');
    await pool.query('update public.vehicles set is_electric=false where id=$1', [vehicle.id]);
    assert.equal((await api('/drivers/me/online', driver.token, { method: 'PATCH', body: JSON.stringify({ isOnline: false }) })).status, 200);

    const driverVehicleResponse = await api('/drivers/me/vehicle', driver.token, { method: 'PATCH', body: JSON.stringify({ make: 'Ford', model: 'F-550 Flatbed', year: 2021, color: 'White', plate: 'e2e-1', plateState: 'tx', equipmentType: 'flatbed' }) });
    assert.equal(driverVehicleResponse.status, 200);
    const savedVehicle = { make: 'Ford', model: 'F-550 Flatbed', year: 2021, color: 'White', plate: 'E2E-1', plateState: 'TX', equipmentType: 'flatbed' };
    assert.deepEqual(await driverVehicleResponse.json(), savedVehicle);
    assert.deepEqual((await (await api('/me', driver.token)).json()).driverVehicle, savedVehicle, 'vehicle persists on the driver profile');

    assert.equal((await pool.query('select current_lat from public.driver_profiles where profile_id=$1', [driver.id])).rows[0].current_lat, null, 'going offline forgets the position');
    assert.equal((await api('/drivers/me/online', driver.token, { method: 'PATCH', body: JSON.stringify({ isOnline: true }) })).status, 200);

    // B8: nearby only. No position yet → "location required", never every open request.
    const noPosition = await (await api('/drivers/requests', driver.token)).json();
    assert.equal(noPosition.status, 'location_required');
    assert.deepEqual(noPosition.requests, []);
    assert.equal((await api(`/bookings/${bookingId}/accept`, driver.token, { method: 'POST' })).status, 409, 'accept needs a known position');
    assert.equal((await api('/drivers/requests?lat=999&lng=-96.8', driver.token)).status, 400, 'absurd coordinates are refused');
    // A far request (Austin, ~180 mi away) is hidden and can't be accepted; the near one is listed with its distance.
    // (Another customer: the first customer's tow is still open, and one active request each — E4.)
    const farResponse = await api('/bookings', otherCustomer.token, { method: 'POST', body: JSON.stringify({ serviceType: 'battery_jump', location: { address: '1 Congress Ave, Austin', lat: 30.2672, lng: -97.7431 } }) });
    assert.equal(farResponse.status, 201);
    farBookingId = (await farResponse.json()).id;
    const requestsResponse = await api(`/drivers/requests?lat=32.78&lng=-96.8`, driver.token);
    assert.equal(requestsResponse.status, 200);
    const nearby = await requestsResponse.json();
    assert.equal(nearby.status, 'ok');
    assert.equal(nearby.radiusMiles, 25);
    assert.ok(nearby.requests.every((item) => item.distanceMiles <= 25), 'nothing beyond the radius');
    assert.deepEqual(nearby.requests.map((item) => item.distanceMiles), [...nearby.requests.map((item) => item.distanceMiles)].sort((a, b) => a - b), 'nearest first');
    assert.equal(nearby.requests.some((item) => item.id === farBookingId), false, 'far request hidden');
    const farAccept = await api(`/bookings/${farBookingId}/accept`, driver.token, { method: 'POST' });
    assert.equal(farAccept.status, 403);
    assert.equal((await farAccept.json()).code, 'out_of_range');
    const fromAustin = await (await api('/drivers/requests?lat=30.27&lng=-97.74', driver.token)).json();
    assert.ok(fromAustin.requests.some((item) => item.id === farBookingId), 'the same request is visible to a driver near it');
    assert.equal(fromAustin.requests.some((item) => item.id === bookingId), false, 'and the Dallas one is not');
    await pool.query('delete from public.bookings where id=$1', [farBookingId]);
    const back = await (await api('/drivers/requests?lat=32.78&lng=-96.8', driver.token)).json();
    const available = back.requests.find((item) => item.id === bookingId);
    assert.ok(available);
    assert.ok(available.distanceMiles >= 0 && available.distanceMiles < 1, `near request shows its distance (${available.distanceMiles} mi)`);
    assert.equal(available.pickup, undefined, 'exact pickup not sent');
    const storedPosition = await pool.query('select current_lat, current_location_at from public.driver_profiles where profile_id=$1', [driver.id]);
    assert.equal(storedPosition.rows[0].current_lat, 32.78);
    assert.ok(Date.now() - new Date(storedPosition.rows[0].current_location_at).getTime() < 120000, 'position timestamp is fresh');
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

    // ---- B15: ratings both directions against the real database ----
    const rateJob = (token, id, body) => api(`/bookings/${id}/rating`, token, { method: 'POST', body: JSON.stringify(body) });
    const PRIVATE = `E2E-private-${suffix}`;
    const pendingBefore = await (await api('/ratings/pending', customer.token)).json();
    const waiting = pendingBefore.find((item) => item.bookingId === bookingId);
    assert.ok(waiting, 'the completed job waits for the customer to rate it');
    assert.equal(waiting.rateeRole, 'driver');
    assert.deepEqual(waiting.tags.map((tag) => tag.label), ['On time', 'Professional', 'Careful with vehicle', 'Friendly']);
    assert.equal((await rateJob(otherCustomer.token, bookingId, { stars: 1 })).status, 404, 'non-participants cannot rate');
    assert.equal((await rateJob(customer.token, bookingId, { stars: 9 })).status, 400, 'stars are 1–5');
    assert.equal((await rateJob(customer.token, bookingId, { stars: 5, tags: ['respectful'] })).status, 400, 'tags are per direction');
    assert.equal((await rateJob(customer.token, bookingId, { stars: 5, tags: ['on_time', 'careful_with_vehicle'], comment: PRIVATE })).status, 201);
    const twice = await rateJob(customer.token, bookingId, { stars: 1 });
    assert.equal(twice.status, 409, 'once per job');
    assert.equal((await twice.json()).code, 'already_rated');
    assert.equal((await rateJob(driver.token, bookingId, { stars: 4, tags: ['clear_location'] })).status, 201, 'the driver rates the customer');
    assert.equal((await (await api('/ratings/pending', customer.token)).json()).some((item) => item.bookingId === bookingId), false, 'no longer pending once rated');
    assert.equal((await (await api('/ratings/pending', driver.token)).json()).some((item) => item.bookingId === bookingId), false);
    const storedRatings = await pool.query('select rater_role, rater_id, ratee_id, stars, tags, comment from public.ratings where booking_id=$1 order by rater_role', [bookingId]);
    assert.deepEqual(storedRatings.rows, [
      { rater_role: 'customer', rater_id: customer.id, ratee_id: driver.id, stars: 5, tags: ['on_time', 'careful_with_vehicle'], comment: PRIVATE },
      { rater_role: 'driver', rater_id: driver.id, ratee_id: customer.id, stars: 4, tags: ['clear_location'], comment: null },
    ]);
    await assert.rejects(pool.query('insert into public.ratings (booking_id, rater_id, rater_role, ratee_id, stars) values ($1,$2,$3,$4,5)', [bookingId, customer.id, 'customer', driver.id]),
      (error) => error.code === '23505' && error.constraint === 'ratings_one_per_rater', 'the database refuses a second rating too');
    // One rating: the count is real but the average stays hidden ("New on AID") until there are 3.
    const afterOne = await (await api(`/bookings/${bookingId}`, customer.token)).json();
    assert.deepEqual([afterOne.driver.rating, afterOne.driver.ratingCount, afterOne.driver.totalJobs], [null, 1, 1]);
    // Two more completed jobs for this driver (made directly), rated 2 (with a comment) and 5 → (5+2+5)/3 = 4.0.
    const extraJobs = [];
    for (const [who, stars, comment] of [[otherCustomer, 2, `${PRIVATE}-low`], [customer, 5, null]]) {
      const extra = await pool.query(`insert into public.bookings (customer_id, driver_id, service_type, service_name, status, location_address, location_lat, location_lng, estimated_price_cents, completed_at)
        values ($1, $2, 'battery_jump', 'Won''t start', 'completed', 'E2E rating job', 32.7, -96.8, 6900, now()) returning id`, [who.id, driver.id]);
      extraJobs.push(extra.rows[0].id);
      e4BookingIds.push(extra.rows[0].id);
      assert.equal((await rateJob(who.token, extra.rows[0].id, { stars, comment })).status, 201);
    }
    const afterThree = await (await api(`/bookings/${bookingId}`, customer.token)).json();
    assert.deepEqual([afterThree.driver.rating, afterThree.driver.ratingCount, afterThree.driver.totalJobs], [4, 3, 3], 'real average shows from 3 ratings');
    const driverMe = await (await api('/me', driver.token)).json();
    assert.deepEqual([driverMe.rating, driverMe.ratingCount, driverMe.totalJobs], [4, 3, 3], 'the driver sees the same on Today');
    const driverView = await (await api(`/bookings/${bookingId}`, driver.token)).json();
    assert.deepEqual([driverView.customer.rating, driverView.customer.ratingCount], [null, 1], 'customer aggregate, same minimum');
    // Comments are private: never in anything the customer or driver can fetch; admins see them.
    for (const body of [afterThree, driverMe, driverView, await (await api('/bookings', driver.token)).json(), await (await api('/bookings', customer.token)).json(),
      await (await api('/ratings/pending', driver.token)).json(), await (await api('/me', customer.token)).json()]) {
      assert.doesNotMatch(JSON.stringify(body), new RegExp(PRIVATE), 'comment leaked to a participant');
    }
    const adminDetail = await (await api(`/admin/drivers/${driver.id}`, reviewer.token)).json();
    assert.equal(adminDetail.driver.rating, 4);
    assert.equal(adminDetail.ratings.count, 3);
    assert.deepEqual(adminDetail.ratings.recentLow.map((item) => [item.stars, item.comment]), [[2, `${PRIVATE}-low`]]);
    // The 7-day window: a job completed 8 days ago can no longer be rated or prompted.
    await pool.query("update public.bookings set completed_at = now() - interval '8 days' where id=$1", [extraJobs[0]]);
    const late = await rateJob(driver.token, extraJobs[0], { stars: 5 });
    assert.equal(late.status, 409);
    assert.equal((await late.json()).code, 'rating_window_closed');
    assert.equal((await (await api('/ratings/pending', driver.token)).json()).some((item) => item.bookingId === extraJobs[0]), false);
    assert.ok((await (await api('/ratings/pending', driver.token)).json()).some((item) => item.bookingId === extraJobs[1]), 'the recent one still waits for the driver');

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
    // B18: Report an issue on the job goes to support_reports (job participants only).
    const issue = await api('/support/reports', customer.token, { method: 'POST', body: JSON.stringify({ category: 'other', bookingId: secondBookingId, message: 'E2E issue report' }) });
    assert.equal(issue.status, 201);
    const issueReport = await issue.json();
    assert.equal(issueReport.booking.id, secondBookingId);
    const strangerReport = await api('/support/reports', otherCustomer.token, { method: 'POST', body: JSON.stringify({ category: 'safety', bookingId: secondBookingId, message: 'not my job' }) });
    assert.equal(strangerReport.status, 404, "a non-participant can't attach someone else's job");
    const driverCancel = await api(`/bookings/${secondBookingId}/status`, driver.token, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', reason: 'cannot_reach_customer' }) });
    assert.equal(driverCancel.status, 200);
    const cancelled = await (await api(`/bookings/${secondBookingId}`, customer.token)).json();
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelledBy, 'driver');
    assert.ok(cancelled.cancelledAt);
    const ratedCancelled = await api(`/bookings/${secondBookingId}/rating`, customer.token, { method: 'POST', body: JSON.stringify({ stars: 1 }) });
    assert.equal(ratedCancelled.status, 409, 'a cancelled job cannot be rated');
    assert.equal((await ratedCancelled.json()).code, 'rating_not_completed');
    assert.equal(await (await api('/bookings/active', driver.token)).json(), null, 'driver is free after cancelling');
    assert.equal((await api(`/bookings/${secondBookingId}/driver-location`, driver.token, { method: 'PATCH', body: JSON.stringify({ location: { lat: 32.79, lng: -96.81 } }) })).status, 404, 'location sharing stops');
    const cancelEvent = await pool.query("select metadata from public.booking_events where booking_id=$1 and to_status='cancelled' and event_type='status_changed'", [secondBookingId]);
    assert.deepEqual(cancelEvent.rows[0].metadata, { role: 'driver', reason: 'cannot_reach_customer' });
    const issueEvent = await pool.query("select actor_id, from_status, metadata from public.booking_events where booking_id=$1 and event_type='issue_reported'", [secondBookingId]);
    assert.equal(issueEvent.rows[0].actor_id, customer.id);
    assert.deepEqual(issueEvent.rows[0].metadata, { role: 'customer', category: 'other', reportId: issueReport.id });
    assert.equal(issueEvent.rows[0].from_status, 'arrived');

    // ---- B18: help & support reports and the admin inbox, against the real database ----
    const general = await api('/support/reports', driver.token, { method: 'POST', body: JSON.stringify({ category: 'app_problem', message: 'E2E map froze' }) });
    assert.equal(general.status, 201);
    const generalReport = await general.json();
    assert.equal((await api('/support/reports', driver.token, { method: 'POST', body: JSON.stringify({ category: 'driver_behaviour', message: 'x' }) })).status, 400, 'customer-only category');
    const customerReports = await (await api('/support/reports', customer.token)).json();
    assert.deepEqual(customerReports.map((r) => r.id), [issueReport.id], 'people see only their own reports');
    assert.deepEqual(await (await api('/support/reports', otherCustomer.token)).json(), []);
    for (const token of [customer.token, driver.token]) assert.equal((await api('/admin/reports', token)).status, 403, 'apps cannot use the admin inbox');
    const inbox = await (await api('/admin/reports?status=open', reviewer.token)).json();
    assert.ok(inbox.reports.some((r) => r.id === issueReport.id) && inbox.reports.some((r) => r.id === generalReport.id));
    assert.ok(inbox.counts.open >= 2);
    const reportDetail = await (await api(`/admin/reports/${issueReport.id}`, reviewer.token)).json();
    assert.equal(reportDetail.reporter.id, customer.id);
    assert.equal(reportDetail.booking.customer.id, customer.id);
    assert.equal(reportDetail.booking.driver.id, driver.id);
    assert.equal(reportDetail.booking.statusWhenReported, 'arrived');
    const review = await api(`/admin/reports/${issueReport.id}`, reviewer.token, { method: 'PATCH', body: JSON.stringify({ status: 'in_review', note: 'E2E internal note' }) });
    assert.equal(review.status, 200);
    const resolved = await api(`/admin/reports/${issueReport.id}`, reviewer.token, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
    assert.equal(resolved.status, 200);
    const resolvedBody = await resolved.json();
    assert.equal(resolvedBody.status, 'resolved');
    assert.equal(resolvedBody.resolvedBy.id, reviewer.id);
    assert.deepEqual(resolvedBody.events.map((e) => e.action).sort(), ['note_added', 'status_changed', 'status_changed']);
    assert.equal((await api(`/admin/reports/${issueReport.id}`, reviewer.token, { method: 'PATCH', body: JSON.stringify({ status: 'open' }) })).status, 409, 'resolved → open is not allowed');
    const seenByCustomer = (await (await api('/support/reports', customer.token)).json())[0];
    assert.equal(seenByCustomer.status, 'resolved');
    assert.ok(seenByCustomer.resolvedAt);
    assert.equal(JSON.stringify(seenByCustomer).includes('E2E internal note'), false, 'internal notes never reach the reporter');

    // ---- E4 against the real database ----
    const jump = (address) => JSON.stringify({ serviceType: 'battery_jump', location: { address, lat: 32.7767, lng: -96.797 } });
    // Two simultaneous requests from one customer: exactly one is created.
    const racing = await Promise.all([1, 2].map((n) => api('/bookings', customer.token, { method: 'POST', body: jump(`E4 race ${n}`) })));
    assert.deepEqual(racing.map((response) => response.status).sort(), [201, 409]);
    const raceBodies = await Promise.all(racing.map((response) => response.json()));
    const expiring = raceBodies.find((body) => body.id);
    e4BookingIds.push(expiring.id);
    assert.equal(raceBodies.find((body) => body.code).code, 'active_request_exists');
    assert.equal((await pool.query("select count(*)::int as n from public.bookings where customer_id=$1 and status='searching'", [customer.id])).rows[0].n, 1);

    // Past the 15-minute window (created_at moved back): drivers no longer see it, even before anything
    // marks it expired, and accepting it says it expired.
    await pool.query("update public.bookings set created_at = now() - interval '16 minutes' where id=$1", [expiring.id]);
    const afterWindow = await (await api('/drivers/requests?lat=32.78&lng=-96.8', driver.token)).json();
    assert.equal(afterWindow.requests.some((item) => item.id === expiring.id), false, 'an overdue request is not listed');
    const lateAccept = await api(`/bookings/${expiring.id}/accept`, driver.token, { method: 'POST' });
    assert.equal(lateAccept.status, 409);
    assert.equal((await lateAccept.json()).code, 'request_expired');
    const expiredView = await (await api(`/bookings/${expiring.id}`, customer.token)).json();
    assert.equal(expiredView.status, 'expired');
    assert.equal(expiredView.endReason, 'no_driver_found');
    assert.ok(expiredView.expiredAt);
    assert.equal(await (await api('/bookings/active', customer.token)).json(), null, 'the customer is free to request again');
    const expiryEvent = await pool.query("select actor_id, from_status, metadata from public.booking_events where booking_id=$1 and to_status='expired'", [expiring.id]);
    assert.equal(expiryEvent.rowCount, 1);
    assert.deepEqual(expiryEvent.rows[0], { actor_id: null, from_status: 'searching', metadata: { role: 'system', reason: 'no_driver_found', afterMinutes: 15 } });
    assert.equal((await api(`/bookings/${expiring.id}/status`, customer.token, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })).status, 409, 'an expired request cannot be cancelled');

    // Lazy check on create: an overdue request never blocks a new one.
    const overdueResponse = await api('/bookings', customer.token, { method: 'POST', body: jump('E4 overdue') });
    assert.equal(overdueResponse.status, 201);
    const overdue = await overdueResponse.json();
    e4BookingIds.push(overdue.id);
    await pool.query("update public.bookings set created_at = now() - interval '16 minutes' where id=$1", [overdue.id]);
    const replacement = await api('/bookings', customer.token, { method: 'POST', body: jump('E4 replacement') });
    assert.equal(replacement.status, 201);
    const replacementBooking = await replacement.json();
    e4BookingIds.push(replacementBooking.id);
    assert.equal((await pool.query('select status from public.bookings where id=$1', [overdue.id])).rows[0].status, 'expired');

    // The interval sweep's statement, with a per-test 1-minute window: no read needed.
    const { PostgresRepository } = require('../repository');
    await pool.query("update public.bookings set created_at = now() - interval '2 minutes' where id=$1", [replacementBooking.id]);
    const swept = await new PostgresRepository(pool, { requestExpiryMinutes: 1 }).expireStaleBookings();
    assert.ok(swept.expired.includes(replacementBooking.id), 'the sweep expires it');
    assert.equal((await pool.query('select status from public.bookings where id=$1', [replacementBooking.id])).rows[0].status, 'expired');

    // A job whose driver went silent for over an hour is released, audited as the system.
    const silentResponse = await api('/bookings', customer.token, { method: 'POST', body: jump('E4 silent driver') });
    assert.equal(silentResponse.status, 201);
    const silentId = (await silentResponse.json()).id;
    e4BookingIds.push(silentId);
    assert.equal((await api(`/drivers/requests?lat=32.78&lng=-96.8`, driver.token)).status, 200);
    assert.equal((await api(`/bookings/${silentId}/accept`, driver.token, { method: 'POST' })).status, 200);
    await pool.query("update public.bookings set accepted_at = now() - interval '61 minutes', driver_location_at = null where id=$1", [silentId]);
    await pool.query("update public.booking_events set created_at = now() - interval '61 minutes' where booking_id=$1", [silentId]);
    const released = await (await api(`/bookings/${silentId}`, customer.token)).json();
    assert.equal(released.status, 'cancelled');
    assert.equal(released.cancelledBy, 'system');
    assert.equal(released.endReason, 'driver_unresponsive');
    assert.equal(await (await api('/bookings/active', driver.token)).json(), null, 'the driver no longer holds the job');
    const releaseEvent = await pool.query("select actor_id, from_status, metadata from public.booking_events where booking_id=$1 and to_status='cancelled'", [silentId]);
    assert.deepEqual(releaseEvent.rows[0], { actor_id: null, from_status: 'accepted', metadata: { role: 'system', reason: 'driver_unresponsive', afterMinutes: 60 } });

    // One job per driver, guaranteed by the database too: a second job can't be attached, even directly.
    const holdResponse = await api('/bookings', otherCustomer.token, { method: 'POST', body: jump('E4 driver hold') });
    const holdId = (await holdResponse.json()).id;
    e4BookingIds.push(holdId);
    const spareResponse = await api('/bookings', customer.token, { method: 'POST', body: jump('E4 spare') });
    const spareId = (await spareResponse.json()).id;
    e4BookingIds.push(spareId);
    assert.equal((await api(`/bookings/${holdId}/accept`, driver.token, { method: 'POST' })).status, 200);
    const busy = await api(`/bookings/${spareId}/accept`, driver.token, { method: 'POST' });
    assert.equal(busy.status, 409);
    assert.equal((await busy.json()).code, 'driver_busy');
    await assert.rejects(pool.query("update public.bookings set driver_id=$1, status='accepted' where id=$2", [driver.id, spareId]),
      (error) => error.code === '23505' && error.constraint === 'bookings_one_active_job_per_driver');

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
    // Reports outlive a deleted account (reporter set null), so remove the test ones explicitly.
    await pool.query('delete from public.support_reports where reporter_id = any($1::uuid[])', [createdIds]).catch(() => {});
    if (bookingId) await pool.query('delete from public.bookings where id=$1', [bookingId]).catch(() => {});
    if (secondBookingId) await pool.query('delete from public.bookings where id=$1', [secondBookingId]).catch(() => {});
    if (farBookingId) await pool.query('delete from public.bookings where id=$1', [farBookingId]).catch(() => {});
    if (e4BookingIds.length) await pool.query('delete from public.bookings where id = any($1::uuid[])', [e4BookingIds]).catch(() => {});
    for (const id of createdIds.reverse()) await supabase.auth.admin.deleteUser(id).catch(() => {});
    await pool.end();
  }
});
