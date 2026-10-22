/**
 * E6 for the admin site: admin access is decided by the server's /api/me role; sign-out (and a 401)
 * clears everything the site stored in this browser.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'admin-token' } } })),
  signOut: vi.fn(async () => ({ error: null })),
  signInWithPassword: vi.fn(async () => ({ error: null })),
  mfa: {
    getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })),
    listFactors: vi.fn(async () => ({ data: { all: [] as { id: string; factor_type: string; status: string }[], totp: [] as { id: string; status: string }[] }, error: null })),
    unenroll: vi.fn(async () => ({ data: {}, error: null })),
    enroll: vi.fn(async () => ({ data: { id: 'f-new', totp: { qr_code: 'data:image/svg+xml;x', secret: 'ABC', uri: 'otpauth://x' } }, error: null })),
    challengeAndVerify: vi.fn(async () => ({ data: {}, error: null as unknown })),
  },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth }) }))

import { adminApi, mfaErrorMessage } from './api'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  sessionStorage.clear()
  localStorage.clear()
})

describe('admin session (E6)', () => {
  it('admin access comes from the server role: a non-admin is refused and signed out of this tab', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'c1', role: 'customer', email: 'c@aid.test', firstName: 'C', lastName: 'C' }))
    await expect(adminApi.currentAdmin()).rejects.toThrow(/does not have admin access/)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })

    fetchMock.mockResolvedValue(json(200, { id: 'a1', role: 'admin', email: 'a@aid.test', firstName: 'A', lastName: 'A' }))
    await expect(adminApi.currentAdmin()).resolves.toMatchObject({ id: 'a1', role: 'admin' })
  })

  it('sign-out clears the session and everything stored, even when Supabase is unreachable', async () => {
    sessionStorage.setItem('sb-proj-auth-token', '{"access_token":"admin-token"}')
    localStorage.setItem('anything', 'x')
    auth.signOut.mockRejectedValueOnce(new TypeError('offline'))
    await adminApi.signOut()
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  it('a 401 signs the reviewer out once and tells the site to show sign-in', async () => {
    const ended = vi.fn()
    adminApi.onSessionEnded(ended)
    sessionStorage.setItem('sb-proj-auth-token', 'x')
    fetchMock.mockResolvedValue(json(401, { error: 'Invalid or expired session' }))

    const results = await Promise.allSettled([adminApi.listDrivers('all'), adminApi.listReports('active')])
    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    expect(ended).toHaveBeenCalledTimes(1)
    expect(ended).toHaveBeenCalledWith(expect.stringMatching(/session expired/i))
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(sessionStorage.length).toBe(0)
    adminApi.onSessionEnded(null)
  })
})

describe('admin two-step sign-in (E5)', () => {
  it('state: aal2 → done; a verified factor → code screen; none → set-up', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
    await expect(adminApi.mfaState()).resolves.toEqual({ step: 'done' })
    auth.mfa.listFactors.mockResolvedValueOnce({ data: { all: [], totp: [{ id: 'f1', status: 'verified' }] }, error: null })
    await expect(adminApi.mfaState()).resolves.toEqual({ step: 'challenge', factorId: 'f1' })
    await expect(adminApi.mfaState()).resolves.toEqual({ step: 'enroll' })
  })

  it('set-up removes an unfinished earlier set-up first, then returns the QR code and key', async () => {
    auth.mfa.listFactors.mockResolvedValueOnce({ data: { all: [{ id: 'old', factor_type: 'totp', status: 'unverified' }], totp: [] }, error: null })
    await expect(adminApi.startEnrollment()).resolves.toEqual({ factorId: 'f-new', qrCode: 'data:image/svg+xml;x', secret: 'ABC', uri: 'otpauth://x' })
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' })
    expect(auth.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'AID Admin', issuer: 'AID Admin' })
  })

  it('two set-ups started at once (React re-mount, double click) create only one authenticator', async () => {
    const [first, second] = await Promise.all([adminApi.startEnrollment(), adminApi.startEnrollment()])
    expect(first).toEqual(second)
    expect(auth.mfa.enroll).toHaveBeenCalledTimes(1)
    await adminApi.startEnrollment()
    expect(auth.mfa.enroll).toHaveBeenCalledTimes(2)
  })

  it('verify sends only the 6 digits and turns Supabase errors into plain messages', async () => {
    await adminApi.verifyCode('f1', '123 456')
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' })
    await expect(adminApi.verifyCode('f1', '12')).rejects.toThrow(/6-digit code/)
    auth.mfa.challengeAndVerify.mockResolvedValueOnce({ data: {}, error: { code: 'mfa_verification_failed', status: 422, message: 'Invalid TOTP code entered' } })
    await expect(adminApi.verifyCode('f1', '000000')).rejects.toThrow(/didn't work/)
  })

  it('messages for wrong, expired, rate-limited, disabled and offline', () => {
    expect(mfaErrorMessage({ code: 'mfa_verification_failed' })).toMatch(/didn't work.*30 seconds/)
    expect(mfaErrorMessage({ code: 'mfa_challenge_expired' })).toMatch(/timed out/)
    expect(mfaErrorMessage({ status: 429, code: 'over_request_rate_limit' })).toMatch(/too many attempts/i)
    expect(mfaErrorMessage({ code: 'mfa_totp_verify_not_enabled' })).toMatch(/turned off/)
    expect(mfaErrorMessage(new TypeError('Failed to fetch'))).toMatch(/connection/)
  })

  it('a 403 mfa_required from the API tells the site to ask for the code (and is not a sign-out)', async () => {
    const required = vi.fn()
    const ended = vi.fn()
    adminApi.onMfaRequired(required)
    adminApi.onSessionEnded(ended)
    fetchMock.mockResolvedValue(json(403, { error: 'Two-step verification is required for admin accounts.', code: 'mfa_required' }))
    await expect(adminApi.listDrivers('all')).rejects.toThrow(/two-step verification is required/i)
    expect(required).toHaveBeenCalledTimes(1)
    expect(ended).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
    adminApi.onMfaRequired(null)
    adminApi.onSessionEnded(null)
  })
})
