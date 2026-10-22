/**
 * Mounted once in the driver app: shares GPS while the driver has an active job,
 * on every driver screen, and stops as soon as the job ends.
 */

import { useEffect, useRef } from 'react'
import { useDriverStore } from '../store/useDriverStore'
import { apiService } from '../services/api'
import { watchLocation, stopWatchLocation } from '../services/location'
import { createLocationSharer, SHARE_STATUSES } from './jobLocationSharing'

export function useJobLocationSharing() {
  const bookingId = useDriverStore((state) => state.activeBooking?.id ?? null)
  const status = useDriverStore((state) => state.activeBooking?.status ?? null)
  const sharer = useRef<ReturnType<typeof createLocationSharer> | null>(null)

  if (!sharer.current) {
    sharer.current = createLocationSharer({
      upload: (id, location) => apiService.updateDriverLocation(id, location),
      watch: (onLocation, onError) => watchLocation(onLocation, onError, true),
      stopWatch: (id) => stopWatchLocation(id),
      onStatus: (next) => useDriverStore.getState().setLocationSharing(next),
      onLocation: (location) => useDriverStore.getState().setCurrentLocation(location),
    })
  }

  const shouldShare = Boolean(bookingId && status && SHARE_STATUSES.has(status))

  useEffect(() => {
    if (shouldShare && bookingId) void sharer.current?.start(bookingId)
    else void sharer.current?.stop()
  }, [bookingId, shouldShare])

  useEffect(() => () => { void sharer.current?.stop() }, [])
}
