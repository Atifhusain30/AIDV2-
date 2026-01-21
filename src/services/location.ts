/**
 * Location Service - Capacitor Geolocation
 * Handles live location tracking for customers and drivers
 */

import { Geolocation, Position, PermissionStatus, PositionOptions } from '@capacitor/geolocation'
import { Capacitor } from '@capacitor/core'
import type { Location } from '../types'

// Watch ID for tracking active location watches
let activeWatchId: string | null = null

/**
 * Request location permissions
 * @returns Permission status
 */
export async function requestLocationPermission(): Promise<PermissionStatus> {
  try {
    const status = await Geolocation.requestPermissions()
    console.log('[Location] Permission status:', status)
    return status
  } catch (error) {
    console.error('[Location] Permission request failed:', error)
    throw error
  }
}

/**
 * Check current location permission status
 */
export async function checkLocationPermission(): Promise<PermissionStatus> {
  try {
    const status = await Geolocation.checkPermissions()
    return status
  } catch (error) {
    console.error('[Location] Permission check failed:', error)
    throw error
  }
}

/**
 * Get current location once
 * @param highAccuracy - Use high accuracy GPS (slower but more precise)
 */
export async function getCurrentLocation(highAccuracy = true): Promise<Location> {
  try {
    const options: PositionOptions = {
      enableHighAccuracy: highAccuracy,
      timeout: 10000,
      maximumAge: 0
    }

    const position: Position = await Geolocation.getCurrentPosition(options)
    
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      timestamp: position.timestamp
    }
  } catch (error) {
    console.error('[Location] Get current position failed:', error)
    throw error
  }
}

/**
 * Start watching location for live tracking
 * @param callback - Called on each location update
 * @param errorCallback - Called on errors
 * @param highAccuracy - Use high accuracy GPS
 */
export async function watchLocation(
  callback: (location: Location) => void,
  errorCallback?: (error: Error) => void,
  highAccuracy = true
): Promise<string> {
  try {
    // Stop any existing watch
    if (activeWatchId) {
      await stopWatchLocation(activeWatchId)
    }

    const options: PositionOptions = {
      enableHighAccuracy: highAccuracy,
      timeout: 10000,
      maximumAge: 5000 // Allow cached positions up to 5 seconds old
    }

    const watchId = await Geolocation.watchPosition(options, (position, error) => {
      if (error) {
        console.error('[Location] Watch error:', error)
        errorCallback?.(new Error(error.message))
        return
      }

      if (position) {
        const location: Location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: position.timestamp
        }
        callback(location)
      }
    })

    activeWatchId = watchId
    console.log('[Location] Watch started with ID:', watchId)
    return watchId
  } catch (error) {
    console.error('[Location] Watch location failed:', error)
    throw error
  }
}

/**
 * Stop watching location
 * @param watchId - Watch ID to stop (optional, stops active watch if not provided)
 */
export async function stopWatchLocation(watchId?: string): Promise<void> {
  const idToStop = watchId || activeWatchId
  
  if (idToStop) {
    try {
      await Geolocation.clearWatch({ id: idToStop })
      console.log('[Location] Watch stopped:', idToStop)
      
      if (idToStop === activeWatchId) {
        activeWatchId = null
      }
    } catch (error) {
      console.error('[Location] Stop watch failed:', error)
    }
  }
}

/**
 * Calculate distance between two points in miles
 */
export function calculateDistance(
  point1: Location,
  point2: Location
): number {
  const R = 3958.8 // Earth's radius in miles
  const dLat = toRad(point2.lat - point1.lat)
  const dLng = toRad(point2.lng - point1.lng)
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(point1.lat)) * Math.cos(toRad(point2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c
  
  return Math.round(distance * 10) / 10 // Round to 1 decimal
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * Estimate ETA based on distance (rough estimate)
 * @param distanceMiles - Distance in miles
 * @param avgSpeedMph - Average speed in MPH (default 25 for city driving)
 */
export function estimateETA(distanceMiles: number, avgSpeedMph = 25): number {
  const hours = distanceMiles / avgSpeedMph
  const minutes = Math.ceil(hours * 60)
  return minutes
}

/**
 * Check if location services are available
 */
export function isLocationAvailable(): boolean {
  return Capacitor.isPluginAvailable('Geolocation')
}

/**
 * Reverse geocode coordinates to address (using browser API)
 * Note: For production, use a proper geocoding API like Google Maps Geocoding
 */
export async function reverseGeocode(location: Location): Promise<string> {
  // In production, use Google Maps Geocoding API or similar
  // This is a placeholder that returns a formatted string
  return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
}

export const locationService = {
  requestPermission: requestLocationPermission,
  checkPermission: checkLocationPermission,
  getCurrentLocation,
  watchLocation,
  stopWatch: stopWatchLocation,
  calculateDistance,
  estimateETA,
  isAvailable: isLocationAvailable,
  reverseGeocode
}

export default locationService
