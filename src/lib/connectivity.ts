/**
 * Connection state for the offline banner (F5): the browser/WebView's own online flag plus the
 * last AID API call (a fetch that never reached the server marks us unreachable; any answer from
 * the server clears it). Nothing here retries on its own — screens keep their normal polling.
 */

import { useSyncExternalStore } from 'react'

export type Connectivity = 'online' | 'offline' | 'unreachable'

let deviceOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false
let serverReachable = true
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

export function connectivity(): Connectivity {
  if (!deviceOnline) return 'offline'
  return serverReachable ? 'online' : 'unreachable'
}

/** Called by the API client after every request: true when the server answered (any status). */
export function reportServerReachable(reachable: boolean) {
  if (serverReachable === reachable) return
  serverReachable = reachable
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }
}

function onOnline() { deviceOnline = true; emit() }
function onOffline() { deviceOnline = false; emit() }

export function useConnectivity(): Connectivity {
  return useSyncExternalStore(subscribe, connectivity, () => 'online')
}

/** Tests only: reset to "online". */
export function resetConnectivityForTests() {
  deviceOnline = true
  serverReachable = true
  emit()
}
