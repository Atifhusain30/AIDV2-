/**
 * Customer view after a driver accepts: live map, approximate ETA, who is coming and what
 * they drive. Data comes from the server (polled by useActiveBookingSync); nothing is simulated.
 */

import { lazy, Suspense, useEffect, useState } from 'react'
import { AlertCircle, Car, Check, Clock3, Flag, Loader2, MapPin, Phone, Star } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { apiService } from '../../services/api'
import { formatPrice } from '../../lib/money'
import { arrivalClock, driverTracking, driverVehicleLabel, formatAge } from '../../lib/customerTracking'
import type { Booking, BookingStatus } from '../../types'

const LiveDriverMap = lazy(() => import('../../components/tracking/LiveDriverMap'))

const STEPS: { status: BookingStatus; label: string }[] = [
  { status: 'accepted', label: 'Accepted' },
  { status: 'en_route', label: 'On the way' },
  { status: 'arrived', label: 'Arrived' },
  { status: 'in_progress', label: 'In service' },
  { status: 'completed', label: 'Done' },
]

// Matches server CUSTOMER_TRANSITIONS: once the driver is on the way, cancelling goes through support.
const CUSTOMER_CANCELLABLE: ReadonlySet<BookingStatus> = new Set<BookingStatus>(['accepted'])
const CLOCK_TICK_MS = 5000

export default function CustomerTrackingScreen({ booking }: { booking: Booking }) {
  const { setActiveBooking, updateBookingInHistory } = useAppStore()
  const [now, setNow] = useState(() => Date.now())
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-evaluate staleness between server polls.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const driver = booking.driver
  const firstName = driver?.firstName || 'Your driver'
  const tracking = driverTracking(booking, now)
  const vehicle = driverVehicleLabel(driver?.vehicle)
  const plate = driver?.vehicle?.plate?.trim()
  const stepIndex = STEPS.findIndex((step) => step.status === booking.status)
  const isTow = Boolean(booking.dropoffLocation)
  const pickup = { lat: booking.location.lat, lng: booking.location.lng }
  const hasPickup = Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng)

  const cancel = async () => {
    setBusy(true)
    setError(null)
    const result = await apiService.updateBookingStatus(booking.id, 'cancelled')
    setBusy(false)
    if (!result.success || !result.data) {
      setError(result.error || 'Unable to cancel this request.')
      setConfirmCancel(false)
      return
    }
    setActiveBooking(null)
    updateBookingInHistory(result.data.id, result.data)
  }

  let headline: string
  let detail: string | null = null
  switch (tracking.phase) {
    case 'arrived':
      headline = `${firstName} has arrived`
      detail = vehicle ? `Look for the ${vehicle}${plate ? ` · ${plate}` : ''}` : 'Your driver is at the pickup location'
      break
    case 'in_service':
      headline = isTow ? 'On the way to drop-off' : 'Service in progress'
      detail = isTow && booking.dropoffLocation ? booking.dropoffLocation.address : `${firstName} is working on your vehicle`
      break
    case 'waiting_location':
      headline = booking.status === 'en_route' ? `${firstName} is on the way` : `${firstName} accepted your request`
      detail = `Waiting for ${firstName}'s location…`
      break
    default:
      headline = tracking.eta ? `${tracking.eta.minutes} min` : `${firstName} is on the way`
      detail = tracking.eta ? `Arrives around ${arrivalClock(tracking.eta, now)} · ${tracking.eta.miles} mi away` : null
  }

  return (
    <div className="track-screen" aria-label="Live tracking">
      <header className="job-header track-header">
        <div><small>{booking.status === 'accepted' || booking.status === 'en_route' ? 'DRIVER ON THE WAY' : 'ACTIVE REQUEST'}</small><h1>{booking.service.name}</h1></div>
        <strong className="job-header__price">{formatPrice(booking.estimatedPrice)}</strong>
      </header>

      <section className="track-map" aria-label="Map">
        {hasPickup ? (
          <Suspense fallback={<div className="track-map__loading"><Loader2 size={22} className="animate-spin" aria-label="Loading map" /></div>}>
            <LiveDriverMap pickup={pickup} driver={tracking.location} stale={tracking.phase === 'stale'} showConnector={tracking.phase === 'live' || tracking.phase === 'stale'} />
          </Suspense>
        ) : <div className="track-map__loading">Map unavailable</div>}
        <span className={`track-chip${tracking.phase === 'live' ? ' is-live' : tracking.phase === 'stale' ? ' is-stale' : ''}`} role="status">
          <i aria-hidden="true" />
          {tracking.phase === 'live' && 'Live'}
          {tracking.phase === 'stale' && tracking.ageMs != null && `Last seen ${formatAge(tracking.ageMs)}`}
          {tracking.phase === 'stale' && tracking.ageMs == null && 'Location delayed'}
          {tracking.phase === 'waiting_location' && 'Waiting for location'}
          {(tracking.phase === 'arrived' || tracking.phase === 'in_service') && (tracking.location && tracking.ageMs != null ? `Updated ${formatAge(tracking.ageMs)}` : 'At pickup')}
        </span>
      </section>

      <section className="track-sheet">
        <div className={`track-eta${tracking.eta ? "" : " track-eta--text"}`}>
          <h2>{headline}</h2>
          {detail && <p>{detail}</p>}
          {tracking.eta && <small><Clock3 size={12} aria-hidden="true" /> Approximate — based on distance, not live traffic</small>}
        </div>

        {tracking.phase === 'stale' && (
          <div className="job-banner job-banner--warn" role="alert">
            <AlertCircle size={17} aria-hidden="true" />
            <span>{`${firstName}'s location ${tracking.ageMs != null ? `was last updated ${formatAge(tracking.ageMs)}` : 'is delayed'}. They may have lost signal${driver?.phone ? ' — you can call them' : ''}.`}{!tracking.eta && ' ETA is hidden until it updates.'}</span>
          </div>
        )}

        <div className="job-person track-driver" aria-label="Your driver">
          <span className="job-person__avatar" aria-hidden="true">{firstName.charAt(0).toUpperCase()}</span>
          <div className="job-person__text">
            <strong>{driver?.name || 'Your driver'}</strong>
            <small>
              {driver && driver.totalJobs > 0 && driver.rating > 0
                ? <><Star size={13} className="track-star" aria-hidden="true" /> {driver.rating.toFixed(1)} · {driver.totalJobs} {driver.totalJobs === 1 ? 'job' : 'jobs'}</>
                : 'New on AID'}
            </small>
          </div>
          {driver?.phone && (
            <a className="job-call" href={`tel:${driver.phone}`} aria-label={`Call ${firstName}`}><Phone size={19} /></a>
          )}
        </div>

        <div className="track-vehicle" aria-label="Driver vehicle">
          <span className="track-vehicle__icon" aria-hidden="true"><Car size={18} /></span>
          <div>
            <small>LOOK FOR</small>
            <strong>{vehicle || 'Vehicle details not added yet'}</strong>
          </div>
          {plate && <span className="track-plate">{plate}</span>}
        </div>

        <div className="track-stops">
          <div className="job-stop">
            <span className="job-stop__dot" aria-hidden="true"><MapPin size={14} /></span>
            <div><small>{isTow ? 'PICK UP' : 'SERVICE LOCATION'}</small><strong>{booking.location.address}</strong></div>
          </div>
          {booking.dropoffLocation && (
            <div className="job-stop">
              <span className="job-stop__dot job-stop__dot--end" aria-hidden="true"><Flag size={13} /></span>
              <div><small>DROP OFF</small><strong>{booking.dropoffLocation.address}</strong></div>
            </div>
          )}
        </div>

        <ol className="job-steps" aria-label="Request progress">
          {STEPS.map((step, index) => (
            <li key={step.status} className={index < stepIndex ? 'is-done' : index === stepIndex ? 'is-current' : ''} aria-current={index === stepIndex ? 'step' : undefined}>
              <span aria-hidden="true">{index < stepIndex ? <Check size={13} /> : index + 1}</span>{step.label}
            </li>
          ))}
        </ol>

        {error && <p className="job-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}

        {CUSTOMER_CANCELLABLE.has(booking.status) && (
          <button type="button" className="job-cancel track-cancel" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel request</button>
        )}
      </section>

      {confirmCancel && (
        <div className="account-sheet-backdrop" role="presentation" onMouseDown={() => setConfirmCancel(false)}>
          <section className="account-sheet" role="dialog" aria-modal="true" aria-labelledby="cancel-request-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="account-sheet__handle" />
            <h2 id="cancel-request-title" className="job-confirm__title">Cancel this request?</h2>
            <p className="job-confirm__text">{firstName} has already accepted and will be told you no longer need help.</p>
            <div className="job-confirm__actions">
              <button type="button" className="job-cancel job-cancel--solid" disabled={busy} onClick={() => void cancel()}>{busy ? 'Cancelling…' : 'Yes, cancel request'}</button>
              <button type="button" className="job-keep" onClick={() => setConfirmCancel(false)}>Keep request</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
