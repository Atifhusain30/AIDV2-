/**
 * Mounted once in the customer app: while the customer has an active request, keep status, driver
 * card, driver location, ETA and the chat unread count current on every screen.
 * B11: re-fetches as soon as the server signals a change to this job (live updates). Polls every
 * BOOKING_POLL_MS while live updates are down, and only every SAFETY_POLL_MS while they're up.
 */

import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { apiService } from '../services/api'
import { reconcileManagedBooking } from '../services/bookingService'
import { pollInterval } from './realtime'
import { useCoalescedRefresh, useRealtimeConnected, useRealtimeEvents } from './useRealtimeStatus'

export const BOOKING_POLL_MS = 4000

export function useActiveBookingSync() {
  const token = useAuthStore((state) => state.token)
  const bookingId = useAppStore((state) => state.activeBooking?.id ?? null)
  const connected = useRealtimeConnected()
  const live = useRef<{ token: string | null; bookingId: string | null }>({ token: null, bookingId: null })
  live.current = { token, bookingId }

  const refresh = useCoalescedRefresh(async () => {
    const id = live.current.bookingId
    if (!live.current.token || !id) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const result = await apiService.getBooking(id)
    if (result.success && result.data && live.current.bookingId === id && useAppStore.getState().activeBooking?.id === id) {
      reconcileManagedBooking(result.data)
    }
  })

  // Live: this job changed (status, driver location/ETA, cancel, new chat message) or we reconnected.
  useRealtimeEvents((event) => {
    if (!token || !bookingId) return
    if (event.type === 'resync' || ((event.type === 'booking' || event.type === 'chat') && event.bookingId === bookingId)) void refresh()
  })

  useEffect(() => {
    if (!token || !bookingId) return
    void refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [token, bookingId, refresh])

  // Fallback polling: the usual pace when live updates are down, a slow safety net when they're up.
  useEffect(() => {
    if (!token || !bookingId) return
    const interval = window.setInterval(() => void refresh(), pollInterval(BOOKING_POLL_MS, connected))
    return () => window.clearInterval(interval)
  }, [token, bookingId, connected, refresh])
}
