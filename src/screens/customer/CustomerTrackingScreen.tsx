/**
 * Customer view after a driver accepts: full-bleed live map, approximate ETA, who is coming and
 * what they drive, in a bottom sheet over the map (Uber-style). Data comes from the server
 * (polled by useActiveBookingSync); nothing is simulated.
 */

import { useEffect, useState } from 'react'
import { AlertCircle, Car, Clock3, Flag, Info, Phone, Star, XCircle } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { apiService } from '../../services/api'
import { formatPrice } from '../../lib/money'
import { arrivalClock, driverTracking, driverVehicleLabel, formatAge } from '../../lib/customerTracking'
import { CUSTOMER_CANCEL_REASONS, CUSTOMER_CANCELLABLE, REPORTABLE, customerCancelText, customerNoCancelText } from '../../lib/jobLifecycle'
import { ConfirmSheet, ReportIssueSheet } from '../../components/job/JobSheets'
import { SafetyActions } from '../../components/safety/Safety'
import type { Booking, BookingStatus } from '../../types'
import { jobCountLabel, ratingSummary } from '../../lib/ratings'
import { showChatEntry, type BookingChat } from '../../lib/chat'
import { MessageButton } from '../../components/chat/MessageButton'
import ChunkBoundary from '../../components/ui/ChunkBoundary'
import { lazyWithRetry } from '../../lib/lazyWithRetry'
import RealtimeNotice from '../../components/ui/RealtimeNotice'
import LiveRegion from '../../components/ui/LiveRegion'
import PersonAvatar from '../../components/ui/PersonAvatar'
import StepProgress from '../../components/ui/StepProgress'
import { List, ListRow } from '../../components/ui/ListRow'
import { TrackLayout, TripStops } from '../../components/tracking/TrackLayout'
import { useAnnounceOnChange, useAnnouncer, useEtaAnnouncement } from '../../lib/announce'

// F6: chat downloads only when it's opened.
const JobChat = lazyWithRetry(() => import('../../components/chat/JobChat'))

const STEPS: { id: BookingStatus; label: string }[] = [
  { id: 'accepted', label: 'Accepted' },
  { id: 'en_route', label: 'On the way' },
  { id: 'arrived', label: 'Arrived' },
  { id: 'in_progress', label: 'In service' },
  { id: 'completed', label: 'Done' },
]

const CLOCK_TICK_MS = 5000
const HEADER_LABEL: Partial<Record<BookingStatus, string>> = {
  accepted: 'Driver confirmed', en_route: 'Driver on the way', arrived: 'Driver has arrived', in_progress: 'Service in progress',
}

export default function CustomerTrackingScreen({ booking }: { booking: Booking }) {
  const { setActiveBooking, updateBookingInHistory, setCurrentScreen } = useAppStore()
  const [now, setNow] = useState(() => Date.now())
  const [sheet, setSheet] = useState<'cancel' | 'report' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)

  // B12: what the chat changed (read, blocked) shows on the badge now rather than at the next poll.
  const updateChat = (change: Partial<BookingChat>) => {
    const current = useAppStore.getState().activeBooking
    if (current?.id === booking.id && current.chat) setActiveBooking({ ...current, chat: { ...current.chat, ...change } })
  }

  // Re-evaluate staleness between server polls.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const driver = booking.driver
  const firstName = driver?.firstName || 'Your driver'
  // B15: real average (count) once there are enough ratings; otherwise "New on AID".
  const driverRating = ratingSummary(driver)
  const driverJobs = jobCountLabel(driver?.totalJobs)
  const tracking = driverTracking(booking, now)
  const vehicle = driverVehicleLabel(driver?.vehicle)
  const plate = driver?.vehicle?.plate?.trim()
  const stepIndex = Math.max(0, STEPS.findIndex((step) => step.id === booking.status))
  const isTow = Boolean(booking.dropoffLocation)
  const pickup = { lat: booking.location.lat, lng: booking.location.lng }

  const canCancel = CUSTOMER_CANCELLABLE.has(booking.status)
  const noCancelText = customerNoCancelText(booking.status, firstName)

  const cancel = async (reason: string | null) => {
    setBusy(true)
    setError(null)
    const result = await apiService.updateBookingStatus(booking.id, 'cancelled', reason ?? undefined)
    setBusy(false)
    setSheet(null)
    if (!result.success || !result.data) {
      // e.g. the driver arrived a moment ago; the next poll shows the real status.
      setError(result.error || 'Unable to cancel this request.')
      return
    }
    // Ends tracking: no active booking means polling and the live map stop.
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

  // F4: what a screen reader hears without touching the screen — each status change, and a new
  // ETA at most once a minute (not on every location update).
  const [liveText, announce] = useAnnouncer()
  useAnnounceOnChange(booking.status, detail ? `${headline}. ${detail}` : headline, announce)
  useEtaAnnouncement(tracking.phase === 'live' ? tracking.eta?.minutes : null, (minutes) => `${firstName} is about ${minutes} min away`, announce)

  // Text alternative to the map: where the driver is relative to the pickup.
  const mapSummary = !tracking.location
    ? `Map of your pickup at ${booking.location.address}. ${firstName}'s location isn't shown yet.`
    : tracking.eta && tracking.phase === 'live'
      ? `Map: ${firstName} is about ${tracking.eta.miles} miles and ${tracking.eta.minutes} minutes from your pickup at ${booking.location.address}.`
      : `Map: ${firstName}'s ${tracking.phase === 'stale' ? 'last known ' : ''}position and your pickup at ${booking.location.address}.`

  const chip = (
    <span className={`track-chip${tracking.phase === 'live' ? ' is-live' : tracking.phase === 'stale' ? ' is-stale' : ''}`} role="status">
      <i aria-hidden="true" />
      {tracking.phase === 'live' && 'Live'}
      {tracking.phase === 'stale' && tracking.ageMs != null && `Last seen ${formatAge(tracking.ageMs)}`}
      {tracking.phase === 'stale' && tracking.ageMs == null && 'Location delayed'}
      {tracking.phase === 'waiting_location' && 'Waiting for location'}
      {(tracking.phase === 'arrived' || tracking.phase === 'in_service') && (tracking.location && tracking.ageMs != null ? `Updated ${formatAge(tracking.ageMs)}` : 'At pickup')}
    </span>
  )

  return (
    <TrackLayout label="Live tracking" pickup={pickup} driver={tracking.location} stale={tracking.phase === 'stale'}
      showConnector={tracking.phase === 'live' || tracking.phase === 'stale'} mapSummary={mapSummary} chip={chip} onBack={() => setCurrentScreen('home')}>
      <LiveRegion message={liveText} />
      <RealtimeNotice />

      <div className="track-eta">
        <p className="track-eta__eyebrow">{HEADER_LABEL[booking.status] ?? 'Active request'}</p>
        <h1>{headline}</h1>
        {detail && <p className="track-eta__detail">{detail}</p>}
        {tracking.eta && <small><Clock3 size={13} aria-hidden="true" /> Approximate — based on distance, not live traffic</small>}
      </div>

      <StepProgress label="Request progress" current={stepIndex} steps={STEPS} />

      {tracking.phase === 'stale' && (
        <div className="ui-alert ui-alert--warning" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <span>{`${firstName}'s location ${tracking.ageMs != null ? `was last updated ${formatAge(tracking.ageMs)}` : 'is delayed'}. They may have lost signal${driver?.phone ? ' — you can call them' : ''}.`}{!tracking.eta && ' ETA is hidden until it updates.'}</span>
        </div>
      )}

      <div className="track-card">
        <div className="track-person" aria-label="Your driver" role="group">
          <PersonAvatar name={driver?.name || firstName} />
          <div className="track-person__text">
            <strong>{driver?.name || 'Your driver'}</strong>
            <span className="ui-meta">
              {driverRating
                ? <><span className="ui-rating" aria-label={driverRating.label}><Star size={13} aria-hidden="true" /> {driverRating.value} ({driverRating.count})</span>{driverJobs && <> · {driverJobs}</>}</>
                : <span>New on AID{driverJobs && <> · {driverJobs}</>}</span>}
            </span>
          </div>
          <div className="track-person__actions">
            {showChatEntry(booking.chat) && (
              <MessageButton name={firstName} unread={chatOpen ? 0 : booking.chat?.unread ?? 0} onClick={() => setChatOpen(true)} />
            )}
            {driver?.phone && (
              <a className="ui-icon-btn" href={`tel:${driver.phone}`} aria-label={`Call ${firstName}`}><Phone size={19} aria-hidden="true" /></a>
            )}
          </div>
        </div>
        <div className="track-vehicle" role="group" aria-label="Driver vehicle">
          <Car size={18} aria-hidden="true" />
          <span><small>Look for</small><strong>{vehicle || 'Vehicle details not added yet'}</strong></span>
          {plate && <span className="ui-plate">{plate}</span>}
        </div>
      </div>

      <div className="track-card">
        <TripStops pickup={booking.location.address} dropoff={booking.dropoffLocation?.address} done={isTow && booking.status === 'in_progress'} />
        <p className="track-trip__price"><span>{booking.service.name}</span><strong>{formatPrice(booking.estimatedPrice)}</strong></p>
      </div>

      {error && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
      {noCancelText && <p className="ui-alert"><Info size={15} aria-hidden="true" /> {noCancelText}</p>}

      <List label="Help with this request" className="track-more">
        {REPORTABLE.has(booking.status) && <ListRow icon={<Flag size={18} />} title="Report a problem" hasPopup disabled={busy} onClick={() => setSheet('report')} />}
        <SafetyActions audience="customer" />
        {canCancel && <ListRow icon={<XCircle size={18} />} title="Cancel request" tone="danger" hasPopup chevron={false} disabled={busy} onClick={() => setSheet('cancel')} />}
      </List>

      {sheet === 'cancel' && (
        <ConfirmSheet
          id="cancel-request" tone="danger" busy={busy}
          title="Cancel this request?"
          text={customerCancelText(booking.status, firstName)}
          reasons={CUSTOMER_CANCEL_REASONS}
          confirmLabel="Yes, cancel request" busyLabel="Cancelling…" keepLabel="Keep request"
          onConfirm={(reason) => void cancel(reason)} onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'report' && <ReportIssueSheet bookingId={booking.id} audience="customer" onClose={() => setSheet(null)} />}
      {chatOpen && (
        <ChunkBoundary>
          <JobChat
            bookingId={booking.id} audience="customer" otherName={firstName} serviceName={booking.service.name}
            initialChat={booking.chat} onClose={() => setChatOpen(false)} onChatChange={updateChat}
          />
        </ChunkBoundary>
      )}
    </TrackLayout>
  )
}
