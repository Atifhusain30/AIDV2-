/**
 * Customer "Updates" screen for the active request. Everything shown comes from the server
 * (kept current by useActiveBookingSync): while AID looks for a driver the customer sees the
 * request on the map and can cancel it; once a driver accepts, the live tracking screen takes over.
 * No driver, message, ETA or status is ever simulated on the device.
 */

import { useState } from 'react'
import { AlertCircle, LifeBuoy, Loader2, XCircle } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { apiService } from '../services/api'
import { formatPrice } from '../lib/money'
import { CUSTOMER_CANCEL_REASONS, CUSTOMER_CANCELLABLE, customerCancelText } from '../lib/jobLifecycle'
import { ConfirmSheet } from '../components/job/JobSheets'
import { SafetyActions } from '../components/safety/Safety'
import CustomerTrackingScreen from './customer/CustomerTrackingScreen'
import { TrackLayout, TripStops } from '../components/tracking/TrackLayout'
import { List, ListRow } from '../components/ui/ListRow'
import { EmptyState } from '../components/ui/States'
import type { Booking } from '../types'

/** Before a driver accepts: the request as the server has it, with a real cancel. */
function FindingDriver({ booking }: { booking: Booking }) {
  const { setActiveBooking, updateBookingInHistory, setCurrentScreen } = useAppStore()
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
    <TrackLayout label="Request status" pickup={{ lat: booking.location.lat, lng: booking.location.lng }} driver={null}
      mapSummary={`Map of your pickup at ${booking.location.address}. No driver yet.`}
      chip={<span className="track-chip"><i aria-hidden="true" /> Searching nearby</span>} onBack={() => setCurrentScreen('home')}>
      <div className="track-eta" role="status">
        <p className="track-eta__eyebrow">Finding a driver</p>
        <h1><Loader2 size={22} className="animate-spin track-searching-icon" aria-hidden="true" /> Looking for a driver</h1>
        <p className="track-eta__detail">Your request is open to verified drivers near you. Their name, vehicle and live location appear here as soon as one accepts.</p>
        {searchUntil && <small>If no driver accepts by {searchUntil}, we'll stop looking and let you know.</small>}
      </div>
      <div className="track-searching-bar" aria-hidden="true"><span /></div>

      <div className="track-card">
        <TripStops pickup={booking.location.address} dropoff={booking.dropoffLocation?.address} />
        <p className="track-trip__price"><span>{booking.service.name}</span><strong>{formatPrice(booking.estimatedPrice)}</strong></p>
      </div>

      {error && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}

      <List label="Help with this request" className="track-more">
        <SafetyActions audience="customer" />
        {CUSTOMER_CANCELLABLE.has(booking.status) && (
          <ListRow icon={<XCircle size={18} />} title="Cancel request" tone="danger" hasPopup chevron={false} disabled={busy} onClick={() => setConfirming(true)} />
        )}
      </List>

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
    </TrackLayout>
  )
}

export default function UpdatesScreen() {
  const { activeBooking, setCurrentScreen } = useAppStore()

  if (!activeBooking) {
    return (
      <div className="ui-screen">
        <header className="ui-screen-title"><h1>Updates</h1><p>Live status of your request</p></header>
        <EmptyState icon={<LifeBuoy size={24} />} title="No active request"
          body="When you request help, its status, your driver and their live location show up here."
          action={{ label: 'Request roadside help', onClick: () => setCurrentScreen('home') }} />
      </div>
    )
  }

  if (activeBooking.status === 'pending' || activeBooking.status === 'searching') {
    return <FindingDriver booking={activeBooking} />
  }

  return <CustomerTrackingScreen booking={activeBooking} />
}
