/**
 * Unified authentication state for customer, driver, and local guest entry.
 * Managed sessions are persisted by Supabase through native Keychain/Keystore storage;
 * raw access tokens are intentionally kept out of Zustand persistence.
 */

import { create } from 'zustand'
import type { Customer, Driver, AuthState, UserRole } from '../types'
import { managedAuth } from '../auth/supabase'
import type { AuthPayload } from '../auth/authService'
import { claimDeviceFor, resetUserState, signOut } from '../auth/signOut'
import { removeLegacyKeys, wipeLocalUserData } from '../auth/deviceData'
import { useAppStore } from './useAppStore'

interface AuthStore extends AuthState {
  isLoading: boolean
  error: string | null
  notice: string | null

  customerLogin: (email: string, password: string) => Promise<boolean>
  customerRegister: (email: string, password: string, firstName: string, lastName: string, phone: string) => Promise<boolean>
  driverLogin: (email: string, password: string) => Promise<boolean>
  driverRegister: (email: string, password: string, firstName: string, lastName: string, phone: string) => Promise<boolean>
  requestPasswordReset: (email: string) => Promise<boolean>
  continueAsGuest: () => boolean
  restoreSession: () => Promise<void>
  logout: () => void
  clearError: () => void
  updateUser: (updates: Partial<Customer | Driver>) => void

  isCustomer: () => boolean
  isDriver: () => boolean
  getUserRole: () => UserRole | null
}

// Remove credentials persisted by the previous prototype implementation.
removeLegacyKeys()

/**
 * E6: a confirmed session (user and role from the AID server). Data saved on this phone for any other
 * account is wiped before the first screen opens.
 */
function signedIn(payload: AuthPayload) {
  claimDeviceFor(payload.user)
  return { isAuthenticated: true, user: payload.user, token: payload.token, isLoading: false, error: null }
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  isAuthenticated: false,
  user: null,
  token: null,
  isLoading: false,
  error: null,
  notice: null,

  customerLogin: async (email, password) => {
    set({ isLoading: true, error: null, notice: null })
    const result = await managedAuth.signIn('customer', email, password)

    if (result.success && result.data) {
      set(signedIn(result.data))
      return true
    }

    set({ isLoading: false, error: result.error || 'Login failed' })
    return false
  },

  customerRegister: async (email, password, firstName, lastName, phone) => {
    set({ isLoading: true, error: null, notice: null })
    const result = await managedAuth.register('customer', { email, password, firstName, lastName, phone })

    if (result.success && result.data) {
      set(signedIn(result.data))
      return true
    }

    if (result.success && result.message) {
      set({ isLoading: false, notice: result.message })
      return false
    }

    set({ isLoading: false, error: result.error || 'Registration failed' })
    return false
  },

  driverLogin: async (email, password) => {
    set({ isLoading: true, error: null, notice: null })
    const result = await managedAuth.signIn('driver', email, password)

    if (result.success && result.data) {
      set(signedIn(result.data))
      return true
    }

    set({ isLoading: false, error: result.error || 'Login failed' })
    return false
  },

  driverRegister: async (email, password, firstName, lastName, phone) => {
    set({ isLoading: true, error: null, notice: null })
    const result = await managedAuth.register('driver', { email, password, firstName, lastName, phone })

    if (result.success && result.data) {
      set(signedIn(result.data))
      return true
    }

    if (result.success && result.message) {
      set({ isLoading: false, notice: result.message })
      return false
    }

    set({ isLoading: false, error: result.error || 'Registration failed' })
    return false
  },

  requestPasswordReset: async (email) => {
    set({ isLoading: true, error: null, notice: null })
    const result = await managedAuth.requestPasswordReset(email)
    if (result.success) {
      set({ isLoading: false, notice: result.message || 'Check your email for a password reset link.' })
      return true
    }
    set({ isLoading: false, error: result.error || 'Unable to send password reset email.' })
    return false
  },

  continueAsGuest: () => {
    const guestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}`
    const guest: Customer = {
      id: `guest_${guestId}`,
      email: '',
      phone: '',
      firstName: 'Guest',
      lastName: '',
      role: 'customer',
      createdAt: new Date(),
      savedAddresses: [],
      vehicles: [],
      paymentMethods: [],
    }

    claimDeviceFor(guest)
    set({
      isAuthenticated: true,
      user: guest,
      token: null,
      isLoading: false,
      error: null,
      notice: null,
    })
    return true
  },

  restoreSession: async () => {
    const result = await managedAuth.restore()
    if (result.success && result.data) {
      set(signedIn(result.data))
      return
    }

    if (!result.success) {
      // Server not reachable: open nothing (the role is unconfirmed); the saved session stays for a retry.
      set({ error: result.error || 'Unable to restore your session.' })
      return
    }
    // No valid session: anything still saved from the last account goes.
    if (useAppStore.getState().ownerId) {
      resetUserState()
      wipeLocalUserData({ keepSession: true })
    }
  },

  // E6: full sign-out (session, GPS, live updates, every store and saved key) — src/auth/signOut.ts.
  logout: () => { void signOut('user') },

  clearError: () => set({ error: null, notice: null }),

  updateUser: (updates) => {
    const { user } = get()
    if (user) set({ user: { ...user, ...updates } as Customer | Driver })
  },

  isCustomer: () => get().user?.role === 'customer',
  isDriver: () => get().user?.role === 'driver',
  getUserRole: () => get().user?.role || null,
}))

export default useAuthStore
