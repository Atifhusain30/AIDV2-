import type { ApiResponse, Customer, Driver, UserRole } from '../types'

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
    signOut(): Promise<{ error: { message: string } | null }>
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

function metadataString(user: ManagedUser, key: string): string {
  const value = user.user_metadata?.[key]
  return typeof value === 'string' ? value : ''
}

function getManagedRole(user: ManagedUser): PortalRole | null {
  const role = metadataString(user, 'role')
  return role === 'customer' || role === 'driver' ? role : null
}

function mapUser(user: ManagedUser, role: PortalRole): Customer | Driver {
  const base = {
    id: user.id,
    email: user.email || '',
    phone: user.phone || metadataString(user, 'phone'),
    firstName: metadataString(user, 'first_name') || user.email?.split('@')[0] || 'AID',
    lastName: metadataString(user, 'last_name'),
    createdAt: new Date(user.created_at || Date.now()),
  }

  if (role === 'driver') {
    return {
      ...base,
      role: 'driver',
      isOnline: false,
      isVerified: false,
      verificationStatus: 'pending',
      documents: [],
      rating: 0,
      totalJobs: 0,
      specializations: [],
    }
  }

  return {
    ...base,
    role: 'customer',
    savedAddresses: [],
    vehicles: [],
    paymentMethods: [],
  }
}

export function createAuthService(client: ManagedAuthClient) {
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

      const accountRole = getManagedRole(data.user)
      if (!accountRole) {
        await client.auth.signOut()
        return { success: false, error: 'This account does not have an AID customer or driver role.' }
      }

      if (accountRole !== requestedRole) {
        await client.auth.signOut()
        return {
          success: false,
          error: accountRole === 'customer'
            ? 'This is a customer account. Switch to customer mode to sign in.'
            : 'This is a driver account. Switch to driver mode to sign in.',
        }
      }

      return {
        success: true,
        data: {
          user: mapUser(data.user, accountRole),
          token: data.session.access_token,
        },
      }
    } catch {
      return { success: false, error: 'Unable to reach AID authentication. Check your connection and try again.' }
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

      return {
        success: true,
        data: {
          user: mapUser(data.user, role),
          token: data.session.access_token,
        },
      }
    } catch {
      return { success: false, error: 'Unable to reach AID authentication. Check your connection and try again.' }
    }
  }

  async function restore(): Promise<ApiResponse<AuthPayload | null>> {
    try {
      const { data, error } = await client.auth.getSession()
      if (error) return { success: false, error: error.message }
      if (!data.session) return { success: true, data: null }

      const role = getManagedRole(data.session.user)
      if (!role) {
        await client.auth.signOut()
        return { success: true, data: null }
      }

      return {
        success: true,
        data: {
          user: mapUser(data.session.user, role),
          token: data.session.access_token,
        },
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
      await client.auth.signOut()
      return { success: true, message: 'Your password has been updated.' }
    } catch {
      return { success: false, error: 'Unable to update your password. Check your connection and try again.' }
    }
  }

  async function signOut(): Promise<void> {
    await client.auth.signOut()
  }

  return { signIn, register, restore, requestPasswordReset, updatePassword, signOut }
}
