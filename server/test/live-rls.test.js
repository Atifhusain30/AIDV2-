// Live attack tests against the real Supabase project using only the public
// (publishable) key that ships in the mobile app. Run with LIVE_E2E=1.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });

const runLive = process.env.LIVE_E2E === '1';

test('signed-in users cannot escalate privileges or tamper with server-owned data via the public key', { skip: !runLive, timeout: 60000 }, async () => {
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const email = `rls-${randomUUID()}@example.com`;
  const password = `Aid-${randomUUID()}-aA1!`;
  let userId;
  try {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'driver', first_name: 'Rls', last_name: 'Probe' } });
    if (error) throw error;
    userId = data.user.id;

    const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: loginError } = await client.auth.signInWithPassword({ email, password });
    if (loginError) throw loginError;

    // Allowed: editing own display fields.
    const ok = await client.from('profiles').update({ first_name: 'Renamed' }).eq('id', userId).select('first_name');
    assert.equal(ok.error, null);
    assert.equal(ok.data[0].first_name, 'Renamed');

    // Forbidden: privilege escalation and server-owned fields.
    for (const patch of [{ role: 'admin' }, { status: 'suspended' }, { session_version: 99 }]) {
      const attempt = await client.from('profiles').update(patch).eq('id', userId);
      assert.ok(attempt.error, `profiles update ${JSON.stringify(patch)} must be rejected`);
    }
    const selfVerify = await client.from('driver_profiles').update({ verification_status: 'verified', credentials_valid_until: '2099-01-01' }).eq('profile_id', userId).select();
    assert.ok(selfVerify.error || selfVerify.data.length === 0, 'drivers must not verify themselves');
    const fakeDoc = await client.from('driver_documents').insert({ driver_id: userId, document_type: 'insurance', storage_path: `${userId}/x`, file_name: 'x', mime_type: 'image/png', file_size: 1, status: 'approved' });
    assert.ok(fakeDoc.error, 'clients must not insert approved documents directly');
    const fakeBooking = await client.from('bookings').insert({ customer_id: userId, service_type: 'towing', service_name: 'x', location_address: 'x', location_lat: 0, location_lng: 0, estimated_price_cents: 1 });
    assert.ok(fakeBooking.error, 'clients must not create bookings (and prices) directly');
    // B15: ratings go through the API only — no direct writes (a fake 5★ for yourself) or reads (private comments).
    const fakeRating = await client.from('ratings').insert({ booking_id: randomUUID(), rater_id: userId, rater_role: 'driver', ratee_id: randomUUID(), stars: 5 });
    assert.ok(fakeRating.error, 'clients must not insert ratings directly');
    const readRatings = await client.from('ratings').select('comment');
    assert.ok(readRatings.error || readRatings.data.length === 0, 'rating comments must not be readable');
    const audit = await client.from('driver_verification_events').select('*');
    assert.ok(audit.error || audit.data.length === 0, 'audit log must not be readable');

    const row = await pool.query('select p.role, p.status, p.session_version, dp.verification_status from public.profiles p join public.driver_profiles dp on dp.profile_id=p.id where p.id=$1', [userId]);
    assert.deepEqual(row.rows[0], { role: 'driver', status: 'active', session_version: 1, verification_status: 'pending' });
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
    await pool.end();
  }
});
