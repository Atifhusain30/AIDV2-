/**
 * Customer "Updates" screen for the active request. Everything shown comes from the server
 * (kept current by useActiveBookingSync): while AID looks for a driver the customer sees the
 * request and can cancel it; once a driver accepts, the live tracking screen takes over.
 * No driver, message, ETA or status is ever simulated on the device.
 */

import { useState } from 'react'
import { AlertCircle, Flag, LifeBuoy, Loader2, MapPin } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { apiService } from '../services/api'
import { formatPrice } from '../lib/money'
import { CUSTOMER_CANCEL_REASONS, CUSTOMER_CANCELLABLE, customerCancelText } from '../lib/jobLifecycle'
import { ConfirmSheet } from '../components/job/JobSheets'
import { SafetyActions } from '../components/safety/Safety'
import CustomerTrackingScreen from './customer/CustomerTrackingScreen'
import type { Booking } from '../types'

/** Before a driver accepts: the request as the server has it, with a real cancel. */
function FindingDriver({ booking }: { booking: Booking }) {
  const { setActiveBooking, updateBookingInHistory } = useAppStore()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Server-set: an unaccepted request expires after the server's window (E4).
  const expiresAt = booking.expiresAt ? new Date(booking.expiresAt) : null
  const searchUntil = expiresAt && !Number.isNaN(expiresAt.getTime())
    ? expiresAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  const cancel = async (reason: string | null) => {
    setBusy(true)
    setError(null)
    const result = await apiService.updateBookingStatus(booking.id, 'cancelled', reason ?? undefined)
    setBusy(false)
    setConfirming(false)
    if (!result.success || !result.data) {
      // e.g. a driver accepted a moment ago; the next poll shows the real status.
      setError(result.error || 'Unable to cancel this request.')
      return
    }
    setActiveBooking(null)
    updateBookingInHistory(result.data.id, result.data)
  }

  return (
    <div className="track-screen" aria-label="Request status">
      <header className="job-header track-header">
        <div><small>FINDING A DRIVER</small><h1>{booking.service.name}</h1></div>
        <strong className="job-header__price">{formatPrice(booking.estimatedPrice)}</strong>
      </header>

      <section className="track-sheet track-sheet--standalone">
        <div className="track-eta track-eta--text" role="status">
          <h2><Loader2 size={20} className="animate-spin track-searching-icon" aria-hidden="true" /> Looking for a driver</h2>
          <p>Your request is open to verified drivers near you. Their name, vehicle and live location appear here as soon as one accepts.</p>
          {searchUntil && <small>If no driver accepts by {searchUntil}, we'll stop looking and let you know.</small>}
        </div>

        <div className="track-stops">
          <div className="job-stop">
            <span className="job-stop__dot" aria-hidden="true"><MapPin size={14} /></span>
            <div><small>{booking.dropoffLocation ? 'PICK UP' : 'SERVICE LOCATION'}</small><strong>{booking.location.address}</strong></div>
          </div>
          {booking.dropoffLocation && (
            <div className="job-stop">
              <span className="job-stop__dot job-stop__dot--end" aria-hidden="true"><Flag size={13} /></span>
              <div><small>DROP OFF</small><strong>{booking.dropoffLocation.address}</strong></div>
            </div>
          )}
        </div>

        {error && <p className="job-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}

        {CUSTOMER_CANCELLABLE.has(booking.status) && (
          <div className="job-actions__row track-actions">
            <button type="button" className="job-cancel" disabled={busy} onClick={() => setConfirming(true)}>Cancel request</button>
          </div>
        )}

        <SafetyActions audience="customer" />
      </section>

      {confirming && (
        <ConfirmSheet
          id="cancel-request" tone="danger" busy={busy}
          title="Cancel this request?"
          text={customerCancelText(booking.status)}
          reasons={CUSTOMER_CANCEL_REASONS}
          confirmLabel="Yes, cancel request" busyLabel="Cancelling…" keepLabel="Keep request"
          onConfirm={(reason) => void cancel(reason)} onClose={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

export default function UpdatesScreen() {
  const { activeBooking, setCurrentScreen } = useAppStore()

  if (!activeBooking) {
    return (
      <div className="activity-screen">
        <header className="activity-header">
          <p>Live status of your request</p>
          <h1>Updates</h1>
        </header>
        <div className="activity-empty">
          <span><LifeBuoy size={27} /></span>
          <h2>No active request</h2>
          <p>When you request help, its status, your driver and their live location show up here.</p>
          <button type="button" onClick={() => setCurrentScreen('home')}>Request roadside help</button>
        </div>
      </div>
    )
  }

  if (activeBooking.status === 'pending' || activeBooking.status === 'searching') {
    return <FindingDriver booking={activeBooking} />
  }

  return <CustomerTrackingScreen booking={activeBooking} />
}
