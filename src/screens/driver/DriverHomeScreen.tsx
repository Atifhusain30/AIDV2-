import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Clock3,
  Wallet,
  FileCheck2,
  LocateFixed,
  MapPin,
  Navigation,
  Power,
  Settings,
  ShieldCheck,
  Star,
  Truck,
  X,
} from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useDriverStore } from '../../store/useDriverStore'
import type { Driver } from '../../types'
import { driverEligibility, ELIGIBILITY_COPY } from '../../lib/driverEligibility'
import { formatCalendarDate } from '../../lib/dates'
import { formatPrice } from '../../lib/money'
import { driverVehicleSummary, vehicleComplete, VEHICLE_REQUIRED_COPY } from '../../lib/driverVehicle'
import { formatDistance, LOCATION_PROMPT_COPY } from '../../lib/nearbyRequests'
import { completedTodayCount, driverRatingLabel, driverRatingNote, timeOfDayGreeting } from '../../lib/driverStats'
import { apiService } from '../../services/api'
import RealtimeNotice from '../../components/ui/RealtimeNotice'
import Button from '../../components/ui/Button'
import SectionHeader from '../../components/ui/SectionHeader'
import { List, ListRow } from '../../components/ui/ListRow'
import { EmptyState } from '../../components/ui/States'
import { SkeletonRows } from '../../components/ui/Skeleton'
import { pollInterval } from '../../lib/realtime'
import { useCoalescedRefresh, useRealtimeConnected, useRealtimeEvents } from '../../lib/useRealtimeStatus'

/** Request list (with one GPS reading per refresh, B8): every 30 s; 60 s as a safety net while live updates are up. */
export const REQUESTS_POLL_MS = 30_000
const REQUESTS_SAFETY_POLL_MS = 60_000

interface DriverHomeScreenProps {
  onOpenOnboarding: () => void
  onOpenVehicle: () => void
  onOpenSettings: () => void
  onOpenActiveJob: () => void
}

export default function DriverHomeScreen({ onOpenOnboarding, onOpenVehicle, onOpenSettings, onOpenActiveJob }: DriverHomeScreenProps) {
  const user = useAuthStore((state) => state.user) as Driver | null
  const {
    isOnline,
    incomingRequests,
    activeBooking,
    isLoading,
    error,
    setOnlineStatus,
    fetchIncomingRequests,
    fetchActiveBooking,
    acceptRequest,
    declineRequest,
    jobEndedNotice,
    dismissJobEndedNotice,
    nearbyStatus,
    locationProblem,
    requestRadiusMiles,
    retryLocation,
  } = useDriverStore()
  const radiusMiles = requestRadiusMiles ?? 25
  const locationPrompt = LOCATION_PROMPT_COPY[locationProblem ?? 'denied']

  const eligibility = driverEligibility(user)
  const isVerified = eligibility === 'eligible'
  const hasVehicle = vehicleComplete(user?.vehicle)
  // Mirrors the server: verified + current credentials + complete vehicle details to go online or accept.
  const canWork = isVerified && hasVehicle
  const vehicleBlocker = {
    title: VEHICLE_REQUIRED_COPY.title,
    detail: user?.vehicle ? VEHICLE_REQUIRED_COPY.incompleteDetail : VEHICLE_REQUIRED_COPY.detail,
    action: user?.vehicle ? 'Finish vehicle' : VEHICLE_REQUIRED_COPY.action,
  }
  const blocker = eligibility !== 'eligible' ? ELIGIBILITY_COPY[eligibility] : hasVehicle ? null : vehicleBlocker
  const openBlocker = eligibility !== 'eligible' ? onOpenOnboarding : onOpenVehicle
  const vehicleSummary = driverVehicleSummary(user?.vehicle)

  useEffect(() => {
    if (user?.id) fetchActiveBooking(user.id)
  }, [fetchActiveBooking, user?.id])

  // "Completed today" is counted from the driver's real job history; refreshed when a job ends.
  const [completedToday, setCompletedToday] = useState<{ state: 'loading' | 'ready' | 'error'; count: number }>({ state: 'loading', count: 0 })
  const activeJobId = activeBooking?.id ?? null
  useEffect(() => {
    let cancelled = false
    void apiService.listBookings().then((result) => {
      if (cancelled) return
      setCompletedToday(result.success && result.data
        ? { state: 'ready', count: completedTodayCount(result.data) }
        : { state: 'error', count: 0 })
    })
    return () => { cancelled = true }
  }, [activeJobId])

  // B11: a request near this driver appeared or was taken/cancelled/expired → re-fetch the normal,
  // server-filtered list at once. Polling stays as the fallback (slower while live updates are up).
  const realtimeConnected = useRealtimeConnected()
  const listening = isOnline && canWork
  const refreshRequests = useCoalescedRefresh(async () => { await fetchIncomingRequests() })
  useRealtimeEvents((event) => {
    if (listening && (event.type === 'requests' || event.type === 'resync')) void refreshRequests()
  })
  useEffect(() => {
    if (!listening) return
    void refreshRequests()
  }, [refreshRequests, listening])
  useEffect(() => {
    if (!listening) return
    const every = realtimeConnected ? Math.max(REQUESTS_SAFETY_POLL_MS, pollInterval(REQUESTS_POLL_MS, true)) : REQUESTS_POLL_MS
    const timer = window.setInterval(() => void refreshRequests(), every)
    return () => window.clearInterval(timer)
  }, [refreshRequests, listening, realtimeConnected])

  // Going offline is always allowed; going online requires eligibility and vehicle details.
  const toggleAvailability = () => {
    if (!isOnline && !canWork) return
    void setOnlineStatus(!isOnline)
  }

  const handleAccept = async (requestId: string) => {
    const accepted = await acceptRequest(requestId)
    if (accepted) onOpenActiveJob()
  }

  return (
    <div className="driver-work ui-screen safe-top">
      {listening && <RealtimeNotice />}
      <header className="driver-work__header">
        <div>
          <h1>Work</h1>
          <p>{timeOfDayGreeting()}, {user?.firstName || 'Driver'}.</p>
        </div>
        <button type="button" className="ui-icon-btn" aria-label="Driver settings" onClick={onOpenSettings}><Settings size={20} aria-hidden="true" /></button>
      </header>

      <section className={`driver-status${isOnline ? ' is-online' : ''}`} aria-label="Availability">
        <div className="driver-status__text">
          <span className="driver-status__dot" aria-hidden="true" />
          <div>
            <strong>{isOnline ? "You're online" : "You're offline"}</strong>
            <p>{blocker ? `${blocker.title}. ${blocker.detail}` : isOnline ? 'Nearby roadside requests show below.' : 'Go online when you are ready to help.'}</p>
          </div>
        </div>
        {isOnline || canWork ? (
          <Button size="lg" block variant={isOnline ? 'secondary' : 'primary'} icon={<Power size={18} aria-hidden="true" />} onClick={toggleAvailability} disabled={isLoading}>
            {isOnline ? 'Go offline' : 'Go online'}
          </Button>
        ) : (
          <Button size="lg" block onClick={openBlocker}>{blocker?.action}</Button>
        )}
        {error && <p role="alert" className="ui-alert ui-alert--danger">{error}</p>}
      </section>

      {jobEndedNotice && !activeBooking && (
        <div className="ui-alert ui-alert--danger driver-ended" role="alert">
          <div>
            <strong>{jobEndedNotice.serviceName} job {jobEndedNotice.bySystem ? 'released' : 'cancelled'}</strong>
            <p>{jobEndedNotice.bySystem
              ? "AID didn't get your location or a status update for a long time, so the job was cancelled and the customer told. Keep AID open while you drive to a job."
              : `${jobEndedNotice.customerName || 'The customer'} cancelled before you arrived. You're free for your next request.`}</p>
          </div>
          <button type="button" className="ui-icon-btn ui-icon-btn--plain" aria-label="Dismiss" onClick={dismissJobEndedNotice}><X size={18} aria-hidden="true" /></button>
        </div>
      )}

      {activeBooking && (
        <button type="button" className="consumer-live driver-live" onClick={onOpenActiveJob}>
          <span className="consumer-live__top"><span className="consumer-live__status"><span className="ui-live-dot" aria-hidden="true" /> Active job</span></span>
          <span className="consumer-live__title">{activeBooking.service.name}</span>
          <span className="consumer-live__meta">{activeBooking.location.address}</span>
          <span className="consumer-live__cta"><Navigation size={18} aria-hidden="true" /> Open job</span>
        </button>
      )}

      <section className="driver-section" aria-labelledby="incoming-title">
        <SectionHeader id="incoming-title" title="Incoming requests">
          {isOnline && <span className="ui-chip ui-chip--success"><span className="ui-live-dot" aria-hidden="true" /> Live</span>}
        </SectionHeader>

        {!canWork ? (
          <List>
            <ListRow icon={isVerified ? <Truck size={20} /> : <FileCheck2 size={20} />} title={blocker?.title} subtitle={blocker?.detail} onClick={openBlocker} />
          </List>
        ) : !isOnline ? (
          <EmptyState compact icon={<Power size={22} />} title="Go online to receive work" body="New roadside requests will appear here." headingLevel={3} />
        ) : nearbyStatus === 'location_required' ? (
          <List>
            <ListRow icon={<LocateFixed size={20} />} title={locationPrompt.title} subtitle={locationPrompt.detail(radiusMiles)}
              trailing={<span className="request-row__action">Try again</span>} disabled={isLoading} onClick={() => void retryLocation()} />
          </List>
        ) : incomingRequests.length === 0 ? (
          nearbyStatus === 'idle' ? (
            <SkeletonRows count={2} card label="Finding requests near you" />
          ) : (
            <EmptyState compact icon={<Clock3 size={22} />} title="No requests near you right now" body={`New requests within ${radiusMiles} miles of you will appear here.`} headingLevel={3} />
          )
        ) : (
          <div className="request-list">
            {incomingRequests.map((request) => (
              <article className="driver-request" key={request.id} aria-label={`${request.service.name} request`}>
                <div className="driver-request__top">
                  <div>
                    <strong>{request.service.name}</strong>
                    <p>{request.customerName || 'Nearby customer'}</p>
                  </div>
                  <span className="driver-request__price">{formatPrice(request.estimatedPrice)}</span>
                </div>
                <p className="driver-request__where">
                  <MapPin size={15} aria-hidden="true" /> <span>{request.location.address}</span>
                  {formatDistance(request.distanceMiles) && <span className="ui-chip">{formatDistance(request.distanceMiles)}</span>}
                </p>
                <div className="driver-request__actions">
                  <Button variant="secondary" onClick={() => declineRequest(request.id)}>Decline</Button>
                  <Button onClick={() => void handleAccept(request.id)}>Accept request</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="driver-section" aria-labelledby="today-title">
        <SectionHeader id="today-title" title="Today" />
        <div className="driver-stats">
          <div aria-label="Earnings coming soon"><Wallet size={17} aria-hidden="true" /><strong>Soon</strong><small>Earnings</small></div>
          <div aria-label="Jobs completed today"><CheckCircle2 size={17} aria-hidden="true" /><strong>{completedToday.state === 'loading' ? '…' : completedToday.state === 'error' ? '—' : completedToday.count}</strong><small>Completed</small></div>
          <div aria-label="Rating"><Star size={17} aria-hidden="true" /><strong>{driverRatingLabel(user)}</strong><small>Rating</small></div>
        </div>
        <p className="driver-stats__note">
          {completedToday.state === 'error'
            ? "Couldn't load today's jobs. They'll show next time you open Work."
            : `Earnings and payouts are coming soon. ${driverRatingNote(user)}`}
        </p>
      </section>

      <section className="driver-section" aria-labelledby="readiness-title">
        <SectionHeader id="readiness-title" title="Driver readiness" />
        <List>
          <ListRow
            icon={isVerified ? <ShieldCheck size={20} /> : <FileCheck2 size={20} />}
            tone={isVerified ? 'default' : 'danger'}
            title={canWork ? 'Ready to take requests' : isVerified ? 'Documents verified' : blocker?.title}
            subtitle={isVerified ? `Documents approved${user?.credentialsValidUntil ? ` through ${formatCalendarDate(user.credentialsValidUntil)}` : ''}.` : blocker?.detail}
            onClick={onOpenOnboarding}
          />
          <ListRow
            icon={<Truck size={20} />}
            title={hasVehicle ? 'Vehicle & equipment' : vehicleBlocker.title}
            subtitle={hasVehicle ? vehicleSummary : vehicleBlocker.detail}
            onClick={onOpenVehicle}
          />
        </List>
      </section>
    </div>
  )
}
