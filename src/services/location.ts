/**
 * Location Service - Capacitor Geolocation
 * Handles live location tracking for customers and drivers
 */

import { Geolocation, PositionOptions } from '@capacitor/geolocation'
import type { Location } from '../types'

// Watch ID for tracking active location watches
let activeWatchId: string | null = null

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
