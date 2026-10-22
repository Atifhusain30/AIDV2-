/**
 * Mounted once in the driver app: while the driver has an active job, poll the server so a
 * customer cancellation ends the job on the driver's phone (which also stops GPS sharing).
 * Polling, like the customer side; there is no realtime channel yet.
 */

import { useEffect } from 'react'
import { useDriverStore } from '../store/useDriverStore'

export const DRIVER_JOB_POLL_MS = 5000

export function useDriverJobSync() {
  const bookingId = useDriverStore((state) => state.activeBooking?.id ?? null)

  useEffect(() => {
    if (!bookingId) return
    let inFlight = false
    const refresh = async () => {
      if (inFlight || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
      inFlight = true
      try { await useDriverStore.getState().syncActiveJob() } finally { inFlight = false }
    }
    const interval = window.setInterval(() => void refresh(), DRIVER_JOB_POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [bookingId])
}
