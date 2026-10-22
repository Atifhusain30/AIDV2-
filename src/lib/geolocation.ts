/**
 * Geolocation Helper
 * Uses Capacitor Geolocation plugin for GPS access
 * Gracefully falls back to browser API on web
 */

import { Geolocation } from '@capacitor/geolocation'
import { GeoCoords } from '../store/useAppStore'

/**
 * Check if Capacitor Geolocation plugin is available
 */
const isGeolocationAvailable = (): boolean => {
  try {
    return !!Geolocation && typeof Geolocation.getCurrentPosition === 'function'
  } catch {
    return false
  }
}

/**
 * Get current GPS position
 * @returns GeoCoords or throws error
 */
export async function getCurrentPosition(): Promise<GeoCoords> {
  // Try Capacitor plugin first
  if (isGeolocationAvailable()) {
    try {
      console.log('[Geolocation] Using Capacitor plugin')
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      })
      
      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }
    } catch (error) {
      console.error('[Geolocation] Capacitor error:', error)
      throw error
    }
  }

  // Fallback to browser API
  console.log('[Geolocation] Using browser API fallback')
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },
      (error) => {
        console.error('[Geolocation] Browser API error:', error)
        reject(error)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000, // Accept cached position up to 1 minute old
      }
    )
  })
}

/**
 * Generate a Google Maps URL for given coordinates
 */
export function getMapsUrl(coords: GeoCoords): string {
  return `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
}
