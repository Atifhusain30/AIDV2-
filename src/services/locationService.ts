/**
 * Location Service
 * Unified location operations: GPS, reverse geocoding, address search
 * 
 * Wraps existing helpers for a clean service interface
 */

import { getCurrentPosition, requestLocationPermission, getMapsUrl } from '../lib/geolocation'
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
 * Request location permission from user
 * @returns Permission status or null if not available
 */
export async function requestPermission(): Promise<'granted' | 'denied' | 'prompt' | null> {
  return requestLocationPermission()
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

/**
 * Calculate distance between two coordinates in degrees
 * (For simple comparison, not actual distance)
 */
export function calculateCoordDistance(
  p1: { lat: number; lng: number },
  p2: { lat: number; lng: number }
): number {
  return Math.sqrt(Math.pow(p1.lat - p2.lat, 2) + Math.pow(p1.lng - p2.lng, 2))
}

/**
 * Check if coordinates are approximately equal
 * @param tolerance Tolerance in degrees (default ~100m)
 */
export function coordsEqual(
  c1: { lat: number; lng: number } | null,
  c2: { lat: number; lng: number } | null,
  tolerance = 0.001
): boolean {
  if (!c1 || !c2) return c1 === c2
  return (
    Math.abs(c1.lat - c2.lat) < tolerance &&
    Math.abs(c1.lng - c2.lng) < tolerance
  )
}

// Default export as service object
const locationService = {
  getCurrentCoords,
  getCurrentLocationSelection,
  requireResolvedLocation,
  requestPermission,
  reverseGeocodeLabel,
  searchAddressSuggestions,
  getMapUrl,
  calculateCoordDistance,
  coordsEqual,
}

export default locationService
