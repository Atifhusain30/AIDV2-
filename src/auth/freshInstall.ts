/**
 * E12: deleting the app must also sign it out.
 *
 * iOS deletes the app's own storage (WebView localStorage) on uninstall but keeps Keychain items,
 * where the Supabase session lives — so a reinstall would open straight into the previous account.
 * A marker in localStorage tells a fresh install apart: when it is missing, the leftover session is
 * cleared before the app restores anything. The marker survives sign-out (PRESERVED_LOCAL_KEYS).
 */

export const INSTALL_MARKER_KEY = 'aid.installMarker'

interface MarkerStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function appStorage(): MarkerStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

/** Returns true when this launch was a fresh install (and the leftover session was cleared). */
export async function clearSessionIfFreshInstall({
  storage = appStorage(),
  clearSession,
}: { storage?: MarkerStorage | null; clearSession: () => Promise<void> }): Promise<boolean> {
  if (!storage) return false
  try {
    if (storage.getItem(INSTALL_MARKER_KEY)) return false
  } catch { return false }
  try {
    await clearSession()
  } catch (error) {
    console.error('[AID] Could not clear a session left from a previous install', error)
  }
  try { storage.setItem(INSTALL_MARKER_KEY, '1') } catch { /* storage full or unavailable */ }
  return true
}
