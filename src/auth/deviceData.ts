/**
 * E6: everything the AID app keeps on the phone, and how sign-out removes it.
 *
 * On the device (persisted):
 * - Keychain (iOS) / Keystore (Android) via @aparajita/capacitor-secure-storage — the Supabase session
 *   only: `sb-<project>-auth-token` (access + refresh token, user id/email) and
 *   `sb-<project>-auth-token-code-verifier` (PKCE). In a desktop browser the same plugin falls back to
 *   localStorage under the `capacitor-storage_` prefix. Removed by supabase.auth.signOut and, in case
 *   that call can't reach Supabase, by clearStoredSession() (SecureStorage.clear()).
 * - localStorage `aid-bookings-v1` — zustand persist of useAppStore: booking history, active booking,
 *   confirmed location (label + coordinates), saved vehicles and the owner stamp (ownerId/ownerRole).
 * - localStorage `aid.ratingPrompts.<userId>` — B15 "asked once" rating reminders (booking ids), per account.
 * - Legacy keys from the old prototype, removed on every start and sign-out: `auth-storage`,
 *   `auth_token`, `user`.
 * - Local notifications already shown or scheduled (booking updates) — cancelled/removed on sign-out.
 *
 * Not used by the app: sessionStorage (cleared anyway), IndexedDB, Cache Storage / service worker,
 * Capacitor Preferences, Filesystem.
 *
 * In memory only (reset on sign-out): useAuthStore (user, role, token), useDriverStore (online state,
 * nearby requests, active job, documents, verification, last GPS position), useAppStore UI state
 * (forms, open sheets, receipts), the geocoding caches (addresses looked up), chat screens (messages,
 * unsent text — component state, gone when the screen closes), the realtime stream and the GPS watch.
 *
 * Kept on sign-out: PRESERVED_LOCAL_KEYS — non-personal app preferences. There are none today.
 */

export const APP_STORE_KEY = 'aid-bookings-v1'
export const RATING_PROMPTS_PREFIX = 'aid.ratingPrompts.'
export const LEGACY_KEYS = ['auth-storage', 'auth_token', 'user'] as const
/** Non-personal preferences that survive sign-out (e.g. a theme setting). None exist yet. */
export const PRESERVED_LOCAL_KEYS: readonly string[] = []
/** Browser fallback of the secure store (desktop development only). */
export const SECURE_STORAGE_WEB_PREFIX = 'capacitor-storage_'

function storages(): Storage[] {
  const found: Storage[] = []
  try { if (typeof localStorage !== 'undefined') found.push(localStorage) } catch { /* unavailable */ }
  try { if (typeof sessionStorage !== 'undefined') found.push(sessionStorage) } catch { /* unavailable */ }
  return found
}

/**
 * Remove every key the app may have written. `keepSession` keeps the secure-store browser fallback,
 * used when a different account has just signed in (its session must survive the wipe).
 * Returns the removed keys (for tests).
 */
export function wipeLocalUserData({ keepSession = false }: { keepSession?: boolean } = {}): string[] {
  const removed: string[] = []
  for (const storage of storages()) {
    try {
      const keys: string[] = []
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i)
        if (key !== null) keys.push(key)
      }
      for (const key of keys) {
        if (PRESERVED_LOCAL_KEYS.includes(key)) continue
        if (keepSession && key.startsWith(SECURE_STORAGE_WEB_PREFIX)) continue
        storage.removeItem(key)
        removed.push(key)
      }
    } catch { /* storage unavailable: nothing stored there */ }
  }
  return removed
}

/** Rating reminders belonging to any account other than `userId`. */
export function removeOtherAccountsRatingPrompts(userId: string): void {
  try {
    const stale: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.startsWith(RATING_PROMPTS_PREFIX) && key !== `${RATING_PROMPTS_PREFIX}${userId}`) stale.push(key)
    }
    stale.forEach((key) => localStorage.removeItem(key))
  } catch { /* unavailable */ }
}

/** Old prototype keys (raw tokens and a cached user with its role). */
export function removeLegacyKeys(): void {
  try { LEGACY_KEYS.forEach((key) => localStorage.removeItem(key)) } catch { /* unavailable */ }
}
