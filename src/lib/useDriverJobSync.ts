/**
 * Mounted once in the driver app: while the driver has an active job, keep it current so a
 * customer cancellation ends the job on the driver's phone (which also stops GPS sharing) and the
 * chat unread count stays right.
 * B11: re-fetches as soon as the server signals a change to this job (live updates). Polls every
 * DRIVER_JOB_POLL_MS while live updates are down, and only every SAFETY_POLL_MS while they're up.
 */

import { useEffect, useRef } from 'react'
import { useDriverStore } from '../store/useDriverStore'
import { pollInterval } from './realtime'
import { useCoalescedRefresh, useRealtimeConnected, useRealtimeEvents } from './useRealtimeStatus'

export const DRIVER_JOB_POLL_MS = 5000

export function useDriverJobSync() {
  const bookingId = useDriverStore((state) => state.activeBooking?.id ?? null)
  const connected = useRealtimeConnected()
  const live = useRef(bookingId)
  live.current = bookingId

  const refresh = useCoalescedRefresh(async () => {
    if (!live.current || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
    await useDriverStore.getState().syncActiveJob()
  })

  useRealtimeEvents((event) => {
    if (!bookingId) return
    if (event.type === 'resync' || ((event.type === 'booking' || event.type === 'chat') && event.bookingId === bookingId)) void refresh()
  })

  useEffect(() => {
    if (!bookingId) return
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [bookingId, refresh])

  useEffect(() => {
    if (!bookingId) return
    const interval = window.setInterval(() => void refresh(), pollInterval(DRIVER_JOB_POLL_MS, connected))
    return () => window.clearInterval(interval)
  }, [bookingId, connected, refresh])
}
