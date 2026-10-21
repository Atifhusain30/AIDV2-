import { createClient } from '@supabase/supabase-js'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { createAuthService } from './authService'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('AID authentication is not configured. Missing Supabase client environment variables.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: {
      getItem: (key) => SecureStorage.getItem(key),
      setItem: (key, value) => SecureStorage.setItem(key, value),
      removeItem: (key) => SecureStorage.removeItem(key),
    },
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

export const managedAuth = createAuthService(supabase)
