/**
 * B8 "nearby" requests: the driver app sends its current position with each request-list refresh
 * (every 30 s while online on the Work screen — no continuous GPS watch), and the server answers
 * with open requests within its service radius, nearest first, each with `distanceMiles`.
 */

import { Geolocation } from '@capacitor/geolocation'

export type NearbyStatus = 'idle' | 'ok' | 'location_required'
export type LocationProblem = 'denied' | 'unavailable'

export type DriverFix = { ok: true; lat: number; lng: number } | { ok: false; problem: LocationProblem }

/** '3.2 mi away'; very close requests read 'Under 0.1 mi away'. */
export function formatDistance(miles: number | undefined | null): string | null {
  if (miles == null || !Number.isFinite(miles) || miles < 0) return null
  if (miles < 0.1) return 'Under 0.1 mi away'
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`
}

const isPermissionError = (error: unknown) => {
  const code = String((error as { code?: string | number } | null)?.code ?? '')
  const message = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? '')
  return /denied|permission|not authorized/i.test(message) || code === '1' || /0003|0007/.test(code)
}

/**
 * One battery-friendly position fix (network/Wi-Fi accuracy is fine for a radius in miles;
 * a fix up to a minute old is reused). Never throws.
 */
export async function locateDriver(): Promise<DriverFix> {
  try {
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
    const { latitude: lat, longitude: lng } = position.coords
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, problem: 'unavailable' }
    return { ok: true, lat, lng }
  } catch (error) {
    return { ok: false, problem: isPermissionError(error) ? 'denied' : 'unavailable' }
  }
}

/** Ask for location permission again (from the "Turn on location" prompt). Never throws. */
export async function requestDriverLocationPermission(): Promise<void> {
  try { await Geolocation.requestPermissions() } catch { /* web or already decided: the next fix tells us */ }
}

export const LOCATION_PROMPT_COPY: Record<LocationProblem, { title: string; detail: (radius: number) => string }> = {
  denied: {
    title: 'Turn on location to see nearby requests',
    detail: (radius) => `AID shows requests within ${radius} miles of you. Allow location for AID in your phone's Settings, then try again.`,
  },
  unavailable: {
    title: "We couldn't find your location",
    detail: (radius) => `AID shows requests within ${radius} miles of you. Check that location services are on and try again.`,
  },
}
