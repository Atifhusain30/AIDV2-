// E5 live: admin two-step sign-in against the real Supabase project and the running dev API
// (http://127.0.0.1:3001). Creates a disposable admin, enrolls a TOTP factor with codes computed
// here (test/helpers/totp.js), and checks that only an aal2 session gets admin data. Run with LIVE_E2E=1.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });
const { totp, nextWindow, userClient } = require('./helpers/totp');

const runLive = process.env.LIVE_E2E === '1';
const API = 'http://127.0.0.1:3001/api';
const api = (pathname, token) => fetch(`${API}${pathname}`, { headers: { Authorization: `Bearer ${token}` } });
const claims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

test('live: admin needs password + authenticator code (aal2); aal1 is refused; customers are unaffected', { skip: !runLive, timeout: 150000 }, async () => {
  const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const suffix = randomUUID();
  const password = `Aid-${randomUUID()}-aA1!`;
  const createdIds = [];

  async function createUser(email, role) {
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role, first_name: 'MFA', last_name: 'Test' } });
    if (error) throw error;
    createdIds.push(data.user.id);
    return data.user.id;
  }

  try {
    const adminEmail = `e2e-mfa-admin-${suffix}@example.com`;
    const adminId = await createUser(adminEmail, 'customer');
    await pool.query("update public.profiles set role='admin' where id=$1", [adminId]);
    const customerEmail = `e2e-mfa-customer-${suffix}@example.com`;
    await createUser(customerEmail, 'customer');

    // 1) Password only → aal1: the admin can read its own profile, nothing else.
    const browser = userClient();
    const { data: login, error: loginError } = await browser.auth.signInWithPassword({ email: adminEmail, password });
    if (loginError) throw loginError;
    const aal1Token = login.session.access_token;
    assert.equal(claims(aal1Token).aal, 'aal1');
    const level0 = (await browser.auth.mfa.getAuthenticatorAssuranceLevel()).data;
    assert.equal(level0.currentLevel, 'aal1');
    assert.equal(level0.nextLevel, 'aal1', 'no factor yet → the site shows enrollment');
    const me = await api('/me', aal1Token);
    assert.equal(me.status, 200);
    assert.equal((await me.json()).role, 'admin');
    for (const pathname of ['/admin/drivers', '/admin/reports', '/admin/drivers?status=all']) {
      const refused = await api(pathname, aal1Token);
      assert.equal(refused.status, 403, pathname);
      assert.equal((await refused.json()).code, 'mfa_required', pathname);
    }

    // 2) Enroll a TOTP factor (TOTP is available on this project via the API).
    const { data: enrolled, error: enrollError } = await browser.auth.mfa.enroll({ factorType: 'totp', friendlyName: `AID test ${suffix.slice(0, 8)}` });
    assert.equal(enrollError, null, enrollError && enrollError.message);
    assert.match(enrolled.totp.secret, /^[A-Z2-7]+=*$/);
    assert.match(enrolled.totp.qr_code, /^data:image\/svg\+xml/);
    assert.match(enrolled.totp.uri, /^otpauth:\/\/totp\//);

    // 3) A wrong code is refused with mfa_verification_failed, and the session stays aal1.
    const wrongChallenge = await browser.auth.mfa.challenge({ factorId: enrolled.id });
    assert.equal(wrongChallenge.error, null);
    const correct = totp(enrolled.totp.secret);
    const wrong = correct === '000000' ? '111111' : '000000';
    const wrongVerify = await browser.auth.mfa.verify({ factorId: enrolled.id, challengeId: wrongChallenge.data.id, code: wrong });
    assert.ok(wrongVerify.error, 'wrong code must fail');
    assert.equal(wrongVerify.error.code, 'mfa_verification_failed');
    assert.equal((await api('/admin/drivers', aal1Token)).status, 403);

    // 4) The right code → aal2 → admin data.
    const { data: verified, error: verifyError } = await browser.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp(enrolled.totp.secret) });
    assert.equal(verifyError, null, verifyError && verifyError.message);
    const aal2Token = verified.access_token;
    assert.equal(claims(aal2Token).aal, 'aal2');
    assert.equal((await browser.auth.mfa.getAuthenticatorAssuranceLevel()).data.currentLevel, 'aal2');
    for (const pathname of ['/admin/drivers', '/admin/reports']) {
      const allowed = await api(pathname, aal2Token);
      assert.equal(allowed.status, 200, pathname);
    }
    // The old password-only token is still refused even after the factor exists.
    assert.equal((await api('/admin/reports', aal1Token)).status, 403);

    // 5) A new sign-in starts at aal1 with nextLevel aal2 (→ the site shows the code screen), then challenge.
    const second = userClient();
    const { data: login2, error: login2Error } = await second.auth.signInWithPassword({ email: adminEmail, password });
    if (login2Error) throw login2Error;
    const level2 = (await second.auth.mfa.getAuthenticatorAssuranceLevel()).data;
    assert.deepEqual([level2.currentLevel, level2.nextLevel], ['aal1', 'aal2']);
    const factors = (await second.auth.mfa.listFactors()).data;
    assert.equal(factors.totp.filter((factor) => factor.status === 'verified').length, 1);
    const refusedAgain = await api('/admin/drivers', login2.session.access_token);
    assert.equal((await refusedAgain.json()).code, 'mfa_required');
    await nextWindow(); // never reuse the code from step 4
    const { data: verified2, error: verify2Error } = await second.auth.mfa.challengeAndVerify({ factorId: factors.totp[0].id, code: totp(enrolled.totp.secret) });
    assert.equal(verify2Error, null, verify2Error && verify2Error.message);
    assert.equal((await api('/admin/drivers', verified2.access_token)).status, 200);

    // 6) Customers sign in with a password only and are never asked for a code.
    const customer = userClient();
    const { data: customerLogin, error: customerError } = await customer.auth.signInWithPassword({ email: customerEmail, password });
    if (customerError) throw customerError;
    assert.equal(claims(customerLogin.session.access_token).aal, 'aal1');
    const customerMe = await api('/me', customerLogin.session.access_token);
    assert.equal(customerMe.status, 200);
    assert.equal((await api('/vehicles', customerLogin.session.access_token)).status, 200);
    const customerAdmin = await api('/admin/drivers', customerLogin.session.access_token);
    assert.equal(customerAdmin.status, 403);
    assert.notEqual((await customerAdmin.json()).code, 'mfa_required');
  } finally {
    for (const id of createdIds.reverse()) await service.auth.admin.deleteUser(id).catch(() => {});
    // Prove the disposable accounts are gone.
    for (const id of createdIds) {
      const { data } = await service.auth.admin.getUserById(id);
      assert.equal(data && data.user ? data.user.id : null, null, `test user ${id} must be deleted`);
    }
    await pool.end();
  }
});
