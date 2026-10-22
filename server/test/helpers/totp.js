// E5 live tests: a small RFC 6238 TOTP generator (HMAC-SHA1, 6 digits, 30 s) — the same codes an
// authenticator app shows — and a helper that takes a test admin through Supabase MFA to aal2.
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** The 6-digit code for `secret` (base32) at time `at` (ms). */
function totp(secret, at = Date.now(), { step = 30, digits = 6 } = {}) {
  const counter = Math.floor(at / 1000 / step);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Wait until a fresh 30 s window starts, so a code is never reused within the same window. */
async function nextWindow(step = 30) {
  const ms = step * 1000 - (Date.now() % (step * 1000)) + 250;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A Supabase client that holds one user's session (never the shared service client). Uses the
 * publishable key the admin site ships with when it is available (.env.local), like a real browser.
 */
function userClient() {
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return createClient(process.env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Sign in, enroll a TOTP factor, verify it, and return the aal2 access token and the factor secret. */
async function signInWithNewTotp(email, password) {
  const client = userClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const { data: enrolled, error: enrollError } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `AID test ${Date.now()}` });
  if (enrollError) throw enrollError;
  const { data: verified, error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp(enrolled.totp.secret) });
  if (verifyError) throw verifyError;
  return { client, token: verified.access_token, factorId: enrolled.id, secret: enrolled.totp.secret };
}

module.exports = { totp, base32Decode, nextWindow, userClient, signInWithNewTotp };
