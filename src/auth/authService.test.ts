import { describe, expect, it, vi } from 'vitest'
import { createAuthService } from './authService'

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

describe('Supabase auth service', () => {
  it('signs a customer in with Supabase and maps the authenticated user', async () => {
    const { client, auth } = createClient()
    const service = createAuthService(client)

    const result = await service.signIn('customer', 'alex@example.com', 'correct-password')

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'alex@example.com',
      password: 'correct-password',
    })
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
    const service = createAuthService(client)

    const result = await service.signIn('driver', 'alex@example.com', 'correct-password')

    expect(result.success).toBe(false)
    expect(result.error).toContain('customer account')
    expect(auth.signOut).toHaveBeenCalled()
  })

  it('returns a verification notice when signup requires email confirmation', async () => {
    const { client } = createClient({
      signUp: vi.fn().mockResolvedValue({
        data: { user: authUser, session: null },
        error: null,
      }),
    })
    const service = createAuthService(client)

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
  })

  it('shows the managed-auth error instead of falling back to a mock login', async () => {
    const { client } = createClient({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      }),
    })
    const service = createAuthService(client)

    const result = await service.signIn('customer', 'wrong@example.com', 'wrong-password')

    expect(result).toEqual({ success: false, error: 'Invalid login credentials' })
  })

  it('sends a normalized password recovery email with the native callback URL', async () => {
    const { client, auth } = createClient()
    const service = createAuthService(client)

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
    const service = createAuthService(client)

    await expect(service.requestPasswordReset('alex@example.com')).resolves.toEqual({
      success: false,
      error: 'Too many requests',
    })
  })

  it('updates the recovered account password', async () => {
    const { client, auth } = createClient()
    const service = createAuthService(client)

    const result = await service.updatePassword('new-secure-password')

    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-secure-password' })
    expect(auth.signOut).toHaveBeenCalled()
    expect(result).toEqual({ success: true, message: 'Your password has been updated.' })
  })

  it('rejects a password shorter than eight characters before calling Supabase', async () => {
    const { client, auth } = createClient()
    const service = createAuthService(client)

    const result = await service.updatePassword('short')

    expect(auth.updateUser).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, error: 'Password must be at least 8 characters.' })
  })
})
