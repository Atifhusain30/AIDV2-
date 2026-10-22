// E5: the TOTP helper used by the live MFA tests produces the same codes as an authenticator app
// (RFC 6238 SHA-1 test vectors, truncated to the 6 digits Supabase uses).
const test = require('node:test');
const assert = require('node:assert/strict');
const { totp, base32Decode } = require('./helpers/totp');

// "12345678901234567890" in base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('base32 decoding', () => {
  assert.equal(base32Decode(RFC_SECRET).toString('ascii'), '12345678901234567890');
  assert.throws(() => base32Decode('not base32!'));
});

test('RFC 6238 SHA-1 vectors (last 6 digits)', () => {
  for (const [seconds, code] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']]) {
    assert.equal(totp(RFC_SECRET, seconds * 1000), code, `T=${seconds}`);
  }
});
