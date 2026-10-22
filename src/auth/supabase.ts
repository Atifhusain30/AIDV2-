import { createClient } from '@supabase/supabase-js'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { createAuthService } from './authService'
import { createProfileFetcher } from './serverProfile'

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

/** E6: the account's role always comes from GET /api/me. */
export const managedAuth = createAuthService(supabase, { fetchProfile: createProfileFetcher() })

/**
 * E6: remove the saved session from the Keychain/Keystore even when the sign-out call couldn't reach
 * Supabase (offline sign-out keeps the session otherwise). The secure store holds only the Supabase
 * session (access/refresh token and the PKCE verifier), so it is cleared entirely.
 */
export async function clearStoredSession(): Promise<void> {
  await SecureStorage.clear()
}
