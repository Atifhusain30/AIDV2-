/**
 * E6: the one way out of an account on this phone.
 *
 * signOut(reason) — used by the Log Out buttons, account deletion, an expired/refused session
 * (Supabase SIGNED_OUT, refresh failure) and any 401 from the AID API:
 *  1. stops everything that sends or receives the person's data: the live-update stream (and any
 *     pending reconnect/ticket request) and the GPS watch; an online driver is set offline on the
 *     server first (Log Out only — an expired session can't do that, and the server forgets a driver's
 *     position when it goes stale);
 *  2. moves the session epoch, so answers to requests made before sign-out are dropped and late 401s
 *     from the old session are ignored;
 *  3. resets every in-memory store (auth, driver, app) and the geocoding caches; with no signed-in
 *     user the app shows the sign-in screen, which unmounts the polling hooks and their timers;
 *  4. ends the Supabase session on this device (scope: local) and clears the secure store even if
 *     Supabase can't be reached;
 *  5. wipes localStorage/sessionStorage (see deviceData.ts for the inventory) and removes booking
 *     notifications.
 * Calls while one is running share it, so a burst of 401s signs out once.
 *
 * claimDeviceFor(user) — on every sign-in/restore, before any screen opens: if the data saved on
 * this phone belongs to a different account (or the same account under a different server role, or
 * nobody known), it is wiped first.
 */

import { useAuthStore } from '../store/useAuthStore'
import { useAppStore } from '../store/useAppStore'
import { useDriverStore } from '../store/useDriverStore'
import { apiService } from '../services/api'
import { stopWatchLocation } from '../services/location'
import { stopRealtime } from '../lib/realtime'
import { clearGeocodingCache } from '../lib/geocoding'
import { clearAllNotifications } from '../lib/notifications'
import { supabase, managedAuth, clearStoredSession } from './supabase'
import { advanceSessionEpoch, setSignOutHandler } from './sessionEpoch'
import { wipeLocalUserData, removeOtherAccountsRatingPrompts, removeLegacyKeys } from './deviceData'

export type SignOutReason = 'user' | 'expired' | 'unauthorized' | 'deleted' | 'role_changed'

const NOTICES: Record<SignOutReason, string | null> = {
  user: null,
  expired: 'Your session ended. Please sign in again.',
  unauthorized: 'Your session ended. Please sign in again.',
  deleted: 'Your AID account has been deleted.',
  role_changed: 'Your account changed. Please sign in again.',
}

const NETWORK_STEP_MS = 5_000

let inFlight: Promise<void> | null = null

async function safely(step: () => Promise<unknown> | unknown): Promise<void> {
  try { await step() } catch { /* each step is best effort; the rest must still run */ }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))])
}

/** Every in-memory store and cache back to a fresh install. */
export function resetUserState(): void {
  useDriverStore.getState().reset()
  useAppStore.getState().resetUserData()
  clearGeocodingCache()
}

export function signOut(reason: SignOutReason = 'user'): Promise<void> {
  if (inFlight) return inFlight
  const { user } = useAuthStore.getState()
  const onlineDriver = user?.role === 'driver' && useDriverStore.getState().isOnline
  inFlight = (async () => {
    stopRealtime()
    await safely(() => stopWatchLocation())
    // Still signed in: tell the server this driver is no longer available for work.
    if (reason === 'user' && onlineDriver) {
      await safely(() => withTimeout(apiService.updateDriverOnlineStatus(user.id, false), NETWORK_STEP_MS))
    }
    advanceSessionEpoch()
    resetUserState()
    useAuthStore.setState({ isAuthenticated: false, user: null, token: null, isLoading: false, error: null, notice: NOTICES[reason] })
    await safely(() => withTimeout(managedAuth.signOut(), NETWORK_STEP_MS))
    await safely(() => clearStoredSession())
    wipeLocalUserData()
    await safely(() => clearAllNotifications())
  })().finally(() => { inFlight = null })
  return inFlight
}

/** Before showing anything for `user`: wipe data saved on this phone for anyone else. */
export function claimDeviceFor(user: { id: string; role: string }): void {
  removeLegacyKeys()
  const app = useAppStore.getState()
  const role = user.role === 'driver' ? 'driver' : 'customer'
  const sameOwner = app.ownerId === user.id && app.ownerRole === role
  if (!sameOwner) {
    const hasData = Boolean(app.ownerId || app.bookingHistory.length || app.activeBooking || app.vehicles.length ||
      app.userCoords || app.userLocationLabel)
    if (hasData) {
      useDriverStore.getState().reset()
      useAppStore.getState().resetUserData()
      clearGeocodingCache()
      // The new account's session is already saved; keep it.
      wipeLocalUserData({ keepSession: true })
    }
  }
  removeOtherAccountsRatingPrompts(user.id)
  useAppStore.getState().setOwner(user.id, role)
}

/**
 * Watch the Supabase session: signed out elsewhere / refresh failed → sign out here; a different
 * account appeared under us → wipe and load the new one from the server. Returns the unsubscribe.
 */
export function installSessionWatch(auth: Pick<typeof supabase.auth, 'onAuthStateChange'> = supabase.auth): () => void {
  const { data } = auth.onAuthStateChange((event, session) => {
    // Supabase warns against awaiting its own calls inside this callback.
    setTimeout(() => {
      const state = useAuthStore.getState()
      if (!state.isAuthenticated || !state.token) return // signed out already, or a guest
      // Supabase emits SIGNED_OUT when the refresh token is refused or the session is removed.
      if (event === 'SIGNED_OUT') {
        void signOut('expired')
        return
      }
      if (!session) return
      if (state.user && session.user?.id && session.user.id !== state.user.id) {
        advanceSessionEpoch()
        resetUserState()
        wipeLocalUserData({ keepSession: true })
        useAuthStore.setState({ isAuthenticated: false, user: null, token: null })
        void useAuthStore.getState().restoreSession()
        return
      }
      if (event === 'TOKEN_REFRESHED' && session.access_token) useAuthStore.setState({ token: session.access_token })
    }, 0)
  })
  return () => data.subscription.unsubscribe()
}

// Any 401 from the AID API (debounced by the shared in-flight sign-out and the session epoch),
// and apiService.logout().
setSignOutHandler((reason) => {
  if (reason === 'user') { void signOut('user'); return }
  if (useAuthStore.getState().token) void signOut('unauthorized')
})
