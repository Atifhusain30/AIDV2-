/** Tells the customer once when their active request was cancelled from the other side. */

import { X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

export default function EndedBookingNotice() {
  const notice = useAppStore((state) => state.endedBookingNotice)
  const setNotice = useAppStore((state) => state.setEndedBookingNotice)
  const rebookFromHistory = useAppStore((state) => state.rebookFromHistory)
  if (!notice) return null

  return (
    <div className="track-ended" role="alert">
      <div>
        <strong>{notice.serviceName} request cancelled</strong>
        <p>{notice.byCustomer
          ? 'You cancelled this request.'
          : `${notice.driverName ? `${notice.driverName} had to cancel` : 'Your driver had to cancel'}. It won't be reassigned automatically — request again to find another driver.`}</p>
      </div>
      <div className="track-ended__actions">
        <button type="button" className="track-ended__again" onClick={() => { rebookFromHistory(notice.bookingId); setNotice(null) }}>Request again</button>
        <button type="button" className="track-ended__close" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={18} /></button>
      </div>
    </div>
  )
}
