/**
 * Tells the customer once when their active request ended without them ending it in this app:
 * the driver cancelled, no driver accepted in time (expired), or the driver stopped responding
 * and the server released the job. Also says so when they tried to request again while a request
 * was already in progress and were taken to it (one active request at a time — E4).
 */

import { X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

type Notice = NonNullable<ReturnType<typeof useAppStore.getState>['endedBookingNotice']>

function copy(notice: Notice): { title: string; text: string } {
  if (notice.reason === 'expired') {
    return {
      title: 'No drivers were available',
      text: `No driver accepted your ${notice.serviceName.toLowerCase()} request in time, so we stopped looking. Request again to keep looking.`,
    }
  }
  if (notice.reason === 'driver_unresponsive') {
    return {
      title: `${notice.serviceName} request cancelled`,
      text: `${notice.driverName || 'Your driver'} stopped responding, so we cancelled this request. It won't be reassigned automatically — request again to find another driver.`,
    }
  }
  return {
    title: `${notice.serviceName} request cancelled`,
    text: notice.byCustomer
      ? 'You cancelled this request.'
      : `${notice.driverName ? `${notice.driverName} had to cancel` : 'Your driver had to cancel'}. It won't be reassigned automatically — request again to find another driver.`,
  }
}

export default function EndedBookingNotice() {
  const notice = useAppStore((state) => state.endedBookingNotice)
  const setNotice = useAppStore((state) => state.setEndedBookingNotice)
  const rebookFromHistory = useAppStore((state) => state.rebookFromHistory)
  const redirected = useAppStore((state) => state.activeRequestRedirect && Boolean(state.activeBooking))
  const setRedirected = useAppStore((state) => state.setActiveRequestRedirect)

  if (notice) {
    const { title, text } = copy(notice)
    return (
      <div className="track-ended" role="alert">
        <div>
          <strong>{title}</strong>
          <p>{text}</p>
        </div>
        <div className="track-ended__actions">
          <button type="button" className="track-ended__again" onClick={() => { rebookFromHistory(notice.bookingId); setNotice(null) }}>Request again</button>
          <button type="button" className="track-ended__close" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={18} /></button>
        </div>
      </div>
    )
  }

  if (!redirected) return null
  return (
    <div className="track-ended track-ended--info" role="status">
      <div>
        <strong>You already have a request in progress</strong>
        <p>One request at a time — here it is. Cancel it first if you need something different.</p>
      </div>
      <div className="track-ended__actions">
        <button type="button" className="track-ended__close" aria-label="Dismiss" onClick={() => setRedirected(false)}><X size={18} /></button>
      </div>
    </div>
  )
}
