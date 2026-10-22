/**
 * Mounted once in the customer app: while the customer has an active request, poll the server
 * so status, driver card, driver location and ETA stay current on every screen.
 * Polling matches the driver side (uploads every 5–30 s); there is no realtime channel yet.
 */

import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { apiService } from '../services/api'
import { reconcileManagedBooking } from '../services/bookingService'

export const BOOKING_POLL_MS = 4000

export function useActiveBookingSync() {
  const token = useAuthStore((state) => state.token)
  const bookingId = useAppStore((state) => state.activeBooking?.id ?? null)

  useEffect(() => {
    if (!token || !bookingId) return
    let stopped = false
    let inFlight = false
    const refresh = async () => {
      if (inFlight || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
      inFlight = true
      try {
        const result = await apiService.getBooking(bookingId)
        if (!stopped && result.success && result.data && useAppStore.getState().activeBooking?.id === bookingId) {
          reconcileManagedBooking(result.data)
        }
      } finally {
        inFlight = false
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), BOOKING_POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [token, bookingId])
}
