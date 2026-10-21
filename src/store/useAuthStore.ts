/**
 * Unified authentication state for customer, driver, and local guest entry.
 * Managed sessions are persisted by Supabase through native Keychain/Keystore storage;
 * raw access tokens are intentionally kept out of Zustand persistence.
 */

import { create } from 'zustand'
import type { Customer, Driver, AuthState, UserRole } from '../types'
import { managedAuth } from '../auth/supabase'

interface AuthStore extends AuthState {
  isLoading: boolean
  error: string | null
  notice: string | null

  customerLogin: (email: string, password: string) => Promise<boolean>
  customerRegister: (email: string, password: string, firstName: string, lastName: string, phone: string) => Promise<boolean>
  driverLogin: (email: string, password: string) => Promise<boolean>
  driverRegister: (email: string, password: string, firstName: string, lastName: string, phone: string) => Promise<boolean>
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
try {
  localStorage.removeItem('auth-storage')
  localStorage.removeItem('auth_token')
  localStorage.removeItem('user')
} catch {
  // localStorage may be unavailable in a restricted runtime; managed auth still works.
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
      set({
        isAuthenticated: true,
        user: result.data.user,
        token: result.data.token,
        isLoading: false,
      })
      return true
    }

    set({ isLoading: false, error: result.error || 'Login failed' })
    return false
  },

  customerRegister: async (email, password, firstName, lastName, phone) => {
    set({ isLoading: true, error: null, notice: null })
    const result = await managedAuth.register('customer', { email, password, firstName, lastName, phone })

    if (result.success && result.data) {
      set({
        isAuthenticated: true,
        user: result.data.user,
        token: result.data.token,
        isLoading: false,
      })
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
      set({
        isAuthenticated: true,
        user: result.data.user,
        token: result.data.token,
        isLoading: false,
      })
      return true
    }

    set({ isLoading: false, error: result.error || 'Login failed' })
    return false
  },

  driverRegister: async (email, password, firstName, lastName, phone) => {
    set({ isLoading: true, error: null, notice: null })
    const result = await managedAuth.register('driver', { email, password, firstName, lastName, phone })

    if (result.success && result.data) {
      set({
        isAuthenticated: true,
        user: result.data.user,
        token: result.data.token,
        isLoading: false,
      })
      return true
    }

    if (result.success && result.message) {
      set({ isLoading: false, notice: result.message })
      return false
    }

    set({ isLoading: false, error: result.error || 'Registration failed' })
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
      set({
        isAuthenticated: true,
        user: result.data.user,
        token: result.data.token,
        error: null,
      })
      return
    }

    if (!result.success) set({ error: result.error || 'Unable to restore your session.' })
  },

  logout: () => {
    set({
      isAuthenticated: false,
      user: null,
      token: null,
      error: null,
      notice: null,
    })
    void managedAuth.signOut()
  },

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
