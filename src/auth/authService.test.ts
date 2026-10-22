import { describe, expect, it, vi } from 'vitest'
import { createAuthService } from './authService'
import { createProfileFetcher, type ApiProfile, type ProfileResult } from './serverProfile'

const authUser = {
  id: 'user-123',
  email: 'alex@example.com',
  phone: '+15550001111',
  created_at: '2026-07-15T00:00:00.000Z',
  user_metadata: {
    role: 'customer',
    first_name: 'Alex',
    last_name: 'Morgan',
  },
}

const customerProfile: ApiProfile = {
  id: 'user-123', email: 'alex@example.com', role: 'customer', status: 'active',
  firstName: 'Alex', lastName: 'Morgan', phone: '+15550001111', createdAt: '2026-07-15T00:00:00.000Z',
}
const driverProfile: ApiProfile = {
  ...customerProfile, role: 'driver', verificationStatus: 'verified', isVerified: true, isOnline: true,
  rating: 4.9, ratingCount: 12, totalJobs: 30, specializations: [],
}

function createClient(overrides: Record<string, unknown> = {}) {
  const auth = {
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { user: authUser, session: { access_token: 'access-token' } },
      error: null,
    }),
    signUp: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getSession: vi.fn(),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
    ...overrides,
  }

  return { client: { auth }, auth }
}

const serverSays = (result: ProfileResult) => vi.fn(async (_token: string) => result)
const serverRole = (profile: ApiProfile) => serverSays({ ok: true, profile })

describe('Supabase auth service', () => {
  it('signs a customer in and builds the user from the server profile', async () => {
    const { client, auth } = createClient()
    const fetchProfile = serverRole(customerProfile)
    const service = createAuthService(client, { fetchProfile })

    const result = await service.signIn('customer', 'alex@example.com', 'correct-password')

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'alex@example.com',
      password: 'correct-password',
    })
    expect(fetchProfile).toHaveBeenCalledWith('access-token')
    expect(result.success).toBe(true)
    expect(result.data?.user).toMatchObject({
      id: 'user-123',
      email: 'alex@example.com',
      firstName: 'Alex',
      lastName: 'Morgan',
      role: 'customer',
    })
    expect(result.data?.token).toBe('access-token')
  })

  it('rejects a customer account used in the driver portal and revokes that local session', async () => {
    const { client, auth } = createClient()
    const service = createAuthService(client, { fetchProfile: serverRole(customerProfile) })

    const result = await service.signIn('driver', 'alex@example.com', 'correct-password')

    expect(result.success).toBe(false)
    expect(result.error).toContain('customer account')
    // Only this device: the account may be signed in elsewhere (e.g. the customer app).
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('E6: the server role wins over a tampered sign-in metadata role', async () => {
    // The account holder can edit user_metadata; the server profile says customer.
    const tampered = { ...authUser, user_metadata: { ...authUser.user_metadata, role: 'driver' } }
    const { client, auth } = createClient({
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: tampered, session: { access_token: 't' } }, error: null }),
    })
    const service = createAuthService(client, { fetchProfile: serverRole(customerProfile) })

    const asDriver = await service.signIn('driver', 'alex@example.com', 'pw')
    expect(asDriver.success).toBe(false)
    expect(asDriver.error).toContain('customer account')
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })

    const asCustomer = await service.signIn('customer', 'alex@example.com', 'pw')
    expect(asCustomer.data?.user.role).toBe('customer')
  })

  it('E6: a driver whose metadata says customer still signs in as a driver (server profile)', async () => {
    const { client } = createClient()
    const service = createAuthService(client, { fetchProfile: serverRole(driverProfile) })
    const result = await service.signIn('driver', 'alex@example.com', 'pw')
    expect(result.success).toBe(true)
    expect(result.data?.user).toMatchObject({ role: 'driver', verificationStatus: 'verified', isOnline: true, totalJobs: 30 })
  })

  it('E6: admin accounts are sent to the admin site, not into the app', async () => {
    const { client, auth } = createClient()
    const service = createAuthService(client, { fetchProfile: serverRole({ ...customerProfile, role: 'admin' }) })
    const result = await service.signIn('customer', 'alex@example.com', 'pw')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/admin site/i)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('E6: no sign-in when the server cannot confirm the role (offline, inactive account)', async () => {
    const offline = createClient()
    const unreachable = await createAuthService(offline.client, { fetchProfile: serverSays({ ok: false, network: true }) })
      .signIn('customer', 'alex@example.com', 'pw')
    expect(unreachable.success).toBe(false)
    expect(unreachable.error).toMatch(/unable to reach aid/i)
    expect(offline.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })

    const inactive = createClient()
    const refused = await createAuthService(inactive.client, { fetchProfile: serverSays({ ok: false, status: 403 }) })
      .signIn('customer', 'alex@example.com', 'pw')
    expect(refused.error).toMatch(/not active/i)
  })

  it('E6: restore opens a session only with the server profile; offline keeps the session but opens nothing', async () => {
    const session = { access_token: 'saved', user: { ...authUser, user_metadata: { role: 'driver' } } }
    const withSession = () => createClient({ getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }) })

    const ok = withSession()
    const restored = await createAuthService(ok.client, { fetchProfile: serverRole(customerProfile) }).restore()
    expect(restored.data?.user.role).toBe('customer')

    const offline = withSession()
    const pending = await createAuthService(offline.client, { fetchProfile: serverSays({ ok: false, network: true }) }).restore()
    expect(pending.success).toBe(false)
    expect(offline.auth.signOut).not.toHaveBeenCalled()

    const revoked = withSession()
    const ended = await createAuthService(revoked.client, { fetchProfile: serverSays({ ok: false, status: 401 }) }).restore()
    expect(ended).toEqual({ success: true, data: null })
    expect(revoked.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })

    const admin = withSession()
    const refused = await createAuthService(admin.client, { fetchProfile: serverRole({ ...customerProfile, role: 'admin' }) }).restore()
    expect(refused).toEqual({ success: true, data: null })
  })

  it('returns a verification notice when signup requires email confirmation', async () => {
    const { client } = createClient({
      signUp: vi.fn().mockResolvedValue({
        data: { user: authUser, session: null },
        error: null,
      }),
    })
    const fetchProfile = serverRole(customerProfile)
    const service = createAuthService(client, { fetchProfile })

    const result = await service.register('customer', {
      email: 'alex@example.com',
      password: 'correct-password',
      firstName: 'Alex',
      lastName: 'Morgan',
      phone: '+15550001111',
    })

    expect(result.success).toBe(true)
    expect(result.data).toBeUndefined()
    expect(result.message).toContain('verification email')
    expect(fetchProfile).not.toHaveBeenCalled()
  })

  it('shows the managed-auth error instead of falling back to a mock login', async () => {
    const { client } = createClient({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      }),
    })
    const service = createAuthService(client, { fetchProfile: serverRole(customerProfile) })

    const result = await service.signIn('customer', 'wrong@example.com', 'wrong-password')

    expect(result).toEqual({ success: false, error: 'Invalid login credentials' })
  })

  it('sends a normalized password recovery email with the native callback URL', async () => {
    const { client, auth } = createClient()
    const service = createAuthService(client, { fetchProfile: serverRole(customerProfile) })

    const result = await service.requestPasswordReset('  Alex@Example.com ')

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('alex@example.com', {
      redirectTo: 'com.aid.roadside://auth/recovery',
    })
    expect(result).toEqual({
      success: true,
      message: 'Check your email for a secure password reset link.',
    })
  })

  it('returns the managed password recovery error', async () => {
    const { client } = createClient({
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: { message: 'Too many requests' } }),
    })
    const service = createAuthService(client, { fetchProfile: serverRole(customerProfile) })

    await expect(service.requestPasswordReset('alex@example.com')).resolves.toEqual({
      success: false,
      error: 'Too many requests',
    })
  })

  it('updates the recovered account password', async () => {
    const { client, auth } = createClient()
    const service = createAuthService(client, { fetchProfile: serverRole(customerProfile) })

    const result = await service.updatePassword('new-secure-password')

    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-secure-password' })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(result).toEqual({ success: true, message: 'Your password has been updated.' })
  })

  it('rejects a password shorter than eight characters before calling Supabase', async () => {
    const { client, auth } = createClient()
    const service = createAuthService(client, { fetchProfile: serverRole(customerProfile) })

    const result = await service.updatePassword('short')

    expect(auth.updateUser).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, error: 'Password must be at least 8 characters.' })
  })

  it('reports a network failure as a connection problem', async () => {
    const { client } = createClient({ signInWithPassword: vi.fn().mockRejectedValue(new TypeError('Load failed')) })
    const result = await createAuthService(client, { fetchProfile: serverRole(customerProfile) }).signIn('driver', 'a@b.co', 'password123')
    expect(result.error).toMatch(/unable to reach aid/i)
  })

  it('does not blame the connection when the device cannot store the session', async () => {
    const { client } = createClient({ signInWithPassword: vi.fn().mockRejectedValue(new Error('Keychain write failed (-34018)')) })
    const result = await createAuthService(client, { fetchProfile: serverRole(customerProfile) }).signIn('driver', 'a@b.co', 'password123')
    expect(result.error).not.toMatch(/connection/i)
    expect(result.error).toMatch(/secure session on this device/i)
  })
})

describe('server profile fetcher', () => {
  it('asks GET /api/me with the session token and classifies failures', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(customerProfile), { status: 200, headers: { 'content-type': 'application/json' } }))
    const fetchProfile = createProfileFetcher(fetchImpl as unknown as typeof fetch, 'https://api.test/api')
    await expect(fetchProfile('tok')).resolves.toEqual({ ok: true, profile: customerProfile })
    expect(fetchImpl).toHaveBeenCalledWith('https://api.test/api/me', { headers: { Authorization: 'Bearer tok' } })

    const refused = createProfileFetcher((async () => new Response('{}', { status: 401 })) as unknown as typeof fetch, 'x')
    await expect(refused('tok')).resolves.toEqual({ ok: false, status: 401 })
    const down = createProfileFetcher((async () => { throw new TypeError('offline') }) as unknown as typeof fetch, 'x')
    await expect(down('tok')).resolves.toEqual({ ok: false, network: true })
  })
})
