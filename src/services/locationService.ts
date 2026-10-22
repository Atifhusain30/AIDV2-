/**
 * Location Service
 * Unified location operations: GPS, reverse geocoding, address search
 * 
 * Wraps existing helpers for a clean service interface
 */

import { getCurrentPosition, getMapsUrl } from '../lib/geolocation'
import { reverseGeocode, searchAddresses, AddressSuggestion } from '../lib/geocoding'
import { GeoCoords } from '../store/useAppStore'

// Re-export types
export type { AddressSuggestion } from '../lib/geocoding'

/**
 * Get current GPS coordinates
 * Uses Capacitor plugin with browser fallback
 */
export async function getCurrentCoords(): Promise<GeoCoords> {
  return getCurrentPosition()
}

export type ResolvedLocation = { label: string; coords: GeoCoords }

export async function getCurrentLocationSelection(): Promise<ResolvedLocation> {
  const coords = await getCurrentCoords()
  const label = await reverseGeocodeLabel(coords.lat, coords.lng)
  return { label, coords }
}

export function requireResolvedLocation(label: string, coords: GeoCoords | null): ResolvedLocation {
  const trimmedLabel = label.trim()
  if (!trimmedLabel || !coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    throw new Error('Select an address suggestion or use your current location.')
  }
  return { label: trimmedLabel, coords }
}

/**
 * Reverse geocode coordinates to address label
 * @param lat Latitude
 * @param lng Longitude
 * @returns Address label string
 */
export async function reverseGeocodeLabel(lat: number, lng: number): Promise<string> {
  try {
    const result = await reverseGeocode(lat, lng)
    return result.label
  } catch (error) {
    console.error('[LocationService] Reverse geocode failed:', error)
    // Return coordinate string as fallback
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  }
}

/**
 * Search for address suggestions
 * @param query Search query (min 3 characters)
 * @param signal Optional AbortSignal for cancellation
 * @returns Array of address suggestions
 */
export async function searchAddressSuggestions(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  return searchAddresses(query, signal)
}

/**
 * Generate a Google Maps URL for coordinates
 */
export function getMapUrl(coords: GeoCoords): string {
  return getMapsUrl(coords)
}

// Default export as service object
const locationService = {
  getCurrentLocationSelection,
  requireResolvedLocation,
  reverseGeocodeLabel,
  searchAddressSuggestions,
  getMapUrl,
}

export default locationService
