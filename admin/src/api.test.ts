/**
 * E6 for the admin site: admin access is decided by the server's /api/me role; sign-out (and a 401)
 * clears everything the site stored in this browser.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'admin-token' } } })),
  signOut: vi.fn(async () => ({ error: null })),
  signInWithPassword: vi.fn(async () => ({ error: null })),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth }) }))

import { adminApi } from './api'

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
