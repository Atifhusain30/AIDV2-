/**
 * Authentication Store
 * Manages user authentication state for both customers and drivers
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Customer, Driver, AuthState, UserRole } from '../types'
import { apiService } from '../services/api'

interface AuthStore extends AuthState {
  // State
  isLoading: boolean
  error: string | null
  
  // Actions
  customerLogin: (email: string, password: string) => Promise<boolean>
  customerRegister: (email: string, password: string, firstName: string, lastName: string, phone: string) => Promise<boolean>
  driverLogin: (email: string, password: string) => Promise<boolean>
  driverRegister: (email: string, password: string, firstName: string, lastName: string, phone: string) => Promise<boolean>
  logout: () => void
  clearError: () => void
  updateUser: (updates: Partial<Customer | Driver>) => void
  
  // Helpers
  isCustomer: () => boolean
  isDriver: () => boolean
  getUserRole: () => UserRole | null
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      user: null,
      token: null,
      isLoading: false,
      error: null,

      // Customer login
      customerLogin: async (email, password) => {
        set({ isLoading: true, error: null })
        
        const result = await apiService.customerLogin(email, password)
        
        if (result.success && result.data) {
          set({
            isAuthenticated: true,
            user: result.data.user,
            token: result.data.token,
            isLoading: false
          })
          return true
        }
        
        set({ isLoading: false, error: result.error || 'Login failed' })
        return false
      },

      // Customer register
      customerRegister: async (email, password, firstName, lastName, phone) => {
        set({ isLoading: true, error: null })
        
        const result = await apiService.customerRegister(email, password, firstName, lastName, phone)
        
        if (result.success && result.data) {
          set({
            isAuthenticated: true,
            user: result.data.user,
            token: result.data.token,
            isLoading: false
          })
          return true
        }
        
        set({ isLoading: false, error: result.error || 'Registration failed' })
        return false
      },

      // Driver login
      driverLogin: async (email, password) => {
        set({ isLoading: true, error: null })
        
        const result = await apiService.driverLogin(email, password)
        
        if (result.success && result.data) {
          set({
            isAuthenticated: true,
            user: result.data.user,
            token: result.data.token,
            isLoading: false
          })
          return true
        }
        
        set({ isLoading: false, error: result.error || 'Login failed' })
        return false
      },

      // Driver register
      driverRegister: async (email, password, firstName, lastName, phone) => {
        set({ isLoading: true, error: null })
        
        const result = await apiService.driverRegister(email, password, firstName, lastName, phone)
        
        if (result.success && result.data) {
          set({
            isAuthenticated: true,
            user: result.data.user,
            token: result.data.token,
            isLoading: false
          })
          return true
        }
        
        set({ isLoading: false, error: result.error || 'Registration failed' })
        return false
      },

      // Logout
      logout: () => {
        apiService.logout()
        set({
          isAuthenticated: false,
          user: null,
          token: null,
          error: null
        })
      },

      // Clear error
      clearError: () => set({ error: null }),

      // Update user data
      updateUser: (updates) => {
        const { user } = get()
        if (user) {
          set({ user: { ...user, ...updates } as Customer | Driver })
        }
      },

      // Helper: Check if user is customer
      isCustomer: () => {
        const { user } = get()
        return user?.role === 'customer'
      },

      // Helper: Check if user is driver
      isDriver: () => {
        const { user } = get()
        return user?.role === 'driver'
      },

      // Helper: Get user role
      getUserRole: () => {
        const { user } = get()
        return user?.role || null
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        token: state.token
      })
    }
  )
)

export default useAuthStore
