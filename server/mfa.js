// E5: admin accounts must sign in with two steps (password + authenticator app code).
//
// Supabase Auth puts the session's Authenticator Assurance Level in the access token's `aal` claim:
// 'aal1' = password only, 'aal2' = password + a verified TOTP code. The server only reads the claim
// from a token that Supabase has already accepted (auth.getUser in index.js), so it cannot be forged.

const MFA_REQUIRED_CODE = 'mfa_required';
const MFA_REQUIRED_MESSAGE = 'Two-step verification is required for admin accounts. Enter the code from your authenticator app.';

/** Payload of a JWT, without verifying it. Only call this on a token the auth server has accepted. */
function accessTokenClaims(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return {};
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' ? claims : {};
  } catch (_error) {
    return {};
  }
}

/** True when an admin's session has not passed the second step. Customers and drivers are never affected. */
function adminNeedsMfa(profile, identity) {
  return Boolean(profile) && profile.role === 'admin' && (!identity || identity.aal !== 'aal2');
}

/**
 * The only route an admin may call before the second step: GET /api/me, so the admin site can tell
 * an admin (send to the code screen) from a customer or driver (send away). It returns the caller's
 * own profile and nothing else.
 */
function mfaExempt(method, path) {
  return method === 'GET' && path === '/api/me';
}

module.exports = { MFA_REQUIRED_CODE, MFA_REQUIRED_MESSAGE, accessTokenClaims, adminNeedsMfa, mfaExempt };
