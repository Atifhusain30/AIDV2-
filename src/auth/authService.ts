import type { ApiResponse, Customer, Driver, UserRole } from '../types'
import { profileToUser, type FetchProfile, type ProfileResult } from './serverProfile'

type PortalRole = Extract<UserRole, 'customer' | 'driver'>

type ManagedUser = {
  id: string
  email?: string
  phone?: string
  created_at?: string
  user_metadata?: Record<string, unknown>
}

type ManagedSession = {
  access_token: string
}

type AuthResult = {
  data: { user: ManagedUser | null; session: ManagedSession | null }
  error: { message: string } | null
}

type SessionResult = {
  data: { session: (ManagedSession & { user: ManagedUser }) | null }
  error: { message: string } | null
}

export interface ManagedAuthClient {
  auth: {
    signInWithPassword(input: { email: string; password: string }): Promise<AuthResult>
    signUp(input: {
      email: string
      password: string
      options: { data: Record<string, unknown> }
    }): Promise<AuthResult>
    signOut(options?: { scope?: 'global' | 'local' | 'others' }): Promise<{ error: { message: string } | null }>
    getSession(): Promise<SessionResult>
    resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error: { message: string } | null }>
    updateUser(input: { password: string }): Promise<{ error: { message: string } | null }>
  }
}

export type AuthPayload = {
  user: Customer | Driver
  token: string
}

export type RegistrationInput = {
  email: string
  password: string
  firstName: string
  lastName: string
  phone: string
}

// Supabase signs out every device by default; leaving or rejecting one device must not end the others.
const LOCAL_ONLY = { scope: 'local' } as const

const SERVER_UNREACHABLE = 'Unable to reach AID to confirm your account. Check your connection and try again.'

function unexpectedAuthError(error: unknown): string {
  // fetch() rejects with TypeError when the network is unreachable.
  if (error instanceof TypeError) return 'Unable to reach AID authentication. Check your connection and try again.'
  console.error('[AID auth]', error)
  return 'We could not save your secure session on this device. Please try again.'
}

type RoleCheck = { ok: true; user: Customer | Driver } | { ok: false; error: string }

function roleCheckError(result: Extract<ProfileResult, { ok: false }>): string {
  if (result.network || !result.status || result.status >= 500) return SERVER_UNREACHABLE
  if (result.status === 403) return 'This AID account is not active. Contact AID support.'
  return 'Your session could not be confirmed. Please sign in again.'
}

export interface AuthServiceDeps {
  /** GET /api/me with the session token — the only source of the account's role (E6). */
  fetchProfile: FetchProfile
}

export function createAuthService(client: ManagedAuthClient, { fetchProfile }: AuthServiceDeps) {
  /**
   * E6: which portal an account may use is decided by the AID server's profile, never by the
   * sign-in metadata (editable by the account holder) or anything stored on the phone.
   */
  async function confirmServerRole(accessToken: string, requestedRole: PortalRole): Promise<RoleCheck> {
    const result = await fetchProfile(accessToken)
    if (!result.ok) return { ok: false, error: roleCheckError(result) }
    const role = result.profile.role
    if (role === 'admin') return { ok: false, error: 'This is an AID admin account. Use the AID admin site.' }
    if (role !== 'customer' && role !== 'driver') return { ok: false, error: 'This account does not have an AID customer or driver role.' }
    if (role !== requestedRole) {
      return {
        ok: false,
        error: role === 'customer'
          ? 'This is a customer account. Switch to customer mode to sign in.'
          : 'This is a driver account. Switch to driver mode to sign in.',
      }
    }
    return { ok: true, user: profileToUser(result.profile) }
  }

  async function signIn(
    requestedRole: PortalRole,
    email: string,
    password: string,
  ): Promise<ApiResponse<AuthPayload>> {
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (error) return { success: false, error: error.message }
      if (!data.user || !data.session) return { success: false, error: 'Unable to start a secure session.' }

      const checked = await confirmServerRole(data.session.access_token, requestedRole)
      if (!checked.ok) {
        await client.auth.signOut(LOCAL_ONLY)
        return { success: false, error: checked.error }
      }
      return { success: true, data: { user: checked.user, token: data.session.access_token } }
    } catch (error) {
      return { success: false, error: unexpectedAuthError(error) }
    }
  }

  async function register(
    role: PortalRole,
    input: RegistrationInput,
  ): Promise<ApiResponse<AuthPayload>> {
    try {
      const { data, error } = await client.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          data: {
            role,
            first_name: input.firstName.trim(),
            last_name: input.lastName.trim(),
            phone: input.phone.trim(),
          },
        },
      })

      if (error) return { success: false, error: error.message }
      if (!data.user) return { success: false, error: 'Unable to create your AID account.' }

      if (!data.session) {
        return {
          success: true,
          message: 'Check your inbox for the AID verification email, then return here to sign in.',
        }
      }

      const checked = await confirmServerRole(data.session.access_token, role)
      if (!checked.ok) {
        await client.auth.signOut(LOCAL_ONLY)
        return { success: false, error: checked.error }
      }
      return { success: true, data: { user: checked.user, token: data.session.access_token } }
    } catch (error) {
      return { success: false, error: unexpectedAuthError(error) }
    }
  }

  /**
   * App start: a saved session opens screens only after the server confirms the account and its
   * role. Server unreachable → keep the session but open nothing (error); session refused → end it.
   */
  async function restore(): Promise<ApiResponse<AuthPayload | null>> {
    try {
      const { data, error } = await client.auth.getSession()
      if (error) return { success: false, error: error.message }
      if (!data.session) return { success: true, data: null }

      const result = await fetchProfile(data.session.access_token)
      if (!result.ok) {
        if (result.network || !result.status || result.status >= 500) return { success: false, error: SERVER_UNREACHABLE }
        await client.auth.signOut(LOCAL_ONLY)
        return { success: true, data: null }
      }
      if (result.profile.role !== 'customer' && result.profile.role !== 'driver') {
        await client.auth.signOut(LOCAL_ONLY)
        return { success: true, data: null }
      }
      return {
        success: true,
        data: { user: profileToUser(result.profile), token: data.session.access_token },
      }
    } catch {
      return { success: false, error: 'Unable to restore your secure session.' }
    }
  }

  async function requestPasswordReset(email: string): Promise<ApiResponse<void>> {
    try {
      const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: 'com.aid.roadside://auth/recovery',
      })
      if (error) return { success: false, error: error.message }
      return { success: true, message: 'Check your email for a secure password reset link.' }
    } catch {
      return { success: false, error: 'Unable to send a password reset email. Check your connection and try again.' }
    }
  }

  async function updatePassword(password: string): Promise<ApiResponse<void>> {
    if (password.length < 8) return { success: false, error: 'Password must be at least 8 characters.' }
    try {
      const { error } = await client.auth.updateUser({ password })
      if (error) return { success: false, error: error.message }
      // A password change deliberately ends every session, including other devices.
      await client.auth.signOut({ scope: 'global' })
      return { success: true, message: 'Your password has been updated.' }
    } catch {
      return { success: false, error: 'Unable to update your password. Check your connection and try again.' }
    }
  }

  async function signOut(): Promise<void> {
    await client.auth.signOut(LOCAL_ONLY)
  }

  return { signIn, register, restore, requestPasswordReset, updatePassword, signOut }
}
