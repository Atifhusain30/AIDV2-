import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
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
import AidBrand from '../../components/brand/AidBrand'
import { useAuthStore } from '../../store/useAuthStore'
import { useDriverStore } from '../../store/useDriverStore'
import type { Driver } from '../../types'
import { driverEligibility, ELIGIBILITY_COPY } from '../../lib/driverEligibility'
import { formatCalendarDate } from '../../lib/dates'
import { formatPrice } from '../../lib/money'
import { driverVehicleSummary, vehicleComplete, VEHICLE_REQUIRED_COPY } from '../../lib/driverVehicle'
import { formatDistance, LOCATION_PROMPT_COPY } from '../../lib/nearbyRequests'
import { completedTodayCount, driverRatingLabel, timeOfDayGreeting } from '../../lib/driverStats'
import { apiService } from '../../services/api'

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

  useEffect(() => {
    if (!isOnline || !canWork) return
    fetchIncomingRequests()
    const timer = window.setInterval(fetchIncomingRequests, 30000)
    return () => window.clearInterval(timer)
  }, [fetchIncomingRequests, isOnline, canWork])

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
    <div className="driver-work safe-top">
      <header className="driver-work__header">
        <div>
          <AidBrand compact label="DRIVER" />
          <h1>Work</h1>
          <p>{timeOfDayGreeting()}, {user?.firstName || 'Driver'}.</p>
        </div>
        <div className="driver-work__header-actions">
          <button type="button" className="aid-icon-button" aria-label="Driver settings" onClick={onOpenSettings}><Settings size={19} /></button>
        </div>
      </header>

      <section className={`availability-card ${isOnline ? 'is-online' : ''}`}>
        <div className="availability-card__copy">
          <span className="availability-card__icon"><Power size={21} /></span>
          <div>
            <small>AVAILABILITY</small>
            <strong>{isOnline ? 'Online and receiving requests' : 'You are offline'}</strong>
            <p>{blocker ? `${blocker.title}. ${blocker.detail}` : isOnline ? 'Stay ready for nearby roadside calls.' : 'Go online when you are ready to help.'}</p>
          </div>
        </div>
        {isOnline || canWork ? (
          <button type="button" className="availability-card__button" onClick={toggleAvailability} disabled={isLoading}>
            {isOnline ? 'Go offline' : 'Go online'}
          </button>
        ) : (
          <button type="button" className="availability-card__button" onClick={openBlocker}>
            {blocker?.action}
          </button>
        )}
        {error && <p role="alert" className="availability-card__error">{error}</p>}
      </section>

      {jobEndedNotice && !activeBooking && (
        <div className="job-ended-banner" role="alert">
          <div>
            <strong>{jobEndedNotice.serviceName} job cancelled</strong>
            <p>{jobEndedNotice.customerName || 'The customer'} cancelled before you arrived. You're free for your next request.</p>
          </div>
          <button type="button" aria-label="Dismiss" onClick={dismissJobEndedNotice}><X size={18} /></button>
        </div>
      )}

      {activeBooking && (
        <button type="button" className="driver-active-job" onClick={onOpenActiveJob}>
          <div className="driver-active-job__label"><span><i /> Active job</span><span>Open navigation</span></div>
          <div className="driver-active-job__body">
            <span><Navigation size={22} /></span>
            <div><strong>{activeBooking.service.name}</strong><p>{activeBooking.location.address}</p></div>
            <ChevronRight size={20} />
          </div>
        </button>
      )}

      <section className="driver-section" aria-labelledby="incoming-title">
        <div className="driver-section__heading">
          <div><span>NEARBY WORK</span><h2 id="incoming-title">Incoming requests</h2></div>
          {isOnline && <span className="driver-live-label"><i /> LIVE</span>}
        </div>

        {!canWork ? (
          <button type="button" className="readiness-prompt" onClick={openBlocker}>
            <span>{isVerified ? <Truck size={22} /> : <FileCheck2 size={22} />}</span>
            <div><strong>{blocker?.title}</strong><p>{blocker?.detail}</p></div>
            <ChevronRight size={19} />
          </button>
        ) : !isOnline ? (
          <div className="driver-empty-state"><Power size={25} /><strong>Go online to receive work</strong><p>New roadside requests will appear here.</p></div>
        ) : nearbyStatus === 'location_required' ? (
          <button type="button" className="readiness-prompt" onClick={() => void retryLocation()} disabled={isLoading}>
            <span><LocateFixed size={22} /></span>
            <div><strong>{locationPrompt.title}</strong><p>{locationPrompt.detail(radiusMiles)}</p></div>
            <span className="readiness-prompt__action">Try again</span>
          </button>
        ) : incomingRequests.length === 0 ? (
          nearbyStatus === 'idle' ? (
            <div className="driver-empty-state"><LocateFixed size={25} /><strong>Finding requests near you</strong><p>Checking your location.</p></div>
          ) : (
            <div className="driver-empty-state"><Clock3 size={25} /><strong>No requests near you right now</strong><p>New requests within {radiusMiles} miles of you will appear here.</p></div>
          )
        ) : (
          <div className="request-list">
            {incomingRequests.map((request) => (
              <article className="request-card" key={request.id}>
                <div className="request-card__top">
                  <span className="request-card__service"><Truck size={19} /></span>
                  <div><strong>{request.service.name}</strong><p>{request.customerName || 'Nearby customer'}</p></div>
                  <span className="request-card__price">{formatPrice(request.estimatedPrice)}</span>
                </div>
                <p className="request-card__location">
                  <MapPin size={15} /> {request.location.address}
                  {formatDistance(request.distanceMiles) && <span className="request-card__distance">{formatDistance(request.distanceMiles)}</span>}
                </p>
                <div className="request-card__actions">
                  <button type="button" onClick={() => declineRequest(request.id)}>Decline</button>
                  <button type="button" onClick={() => void handleAccept(request.id)}>Accept request</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="driver-section" aria-labelledby="today-title">
        <div className="driver-section__heading"><div><span>PERFORMANCE</span><h2 id="today-title">Today</h2></div></div>
        <div className="driver-metrics">
          <div aria-label="Earnings coming soon"><span><Wallet size={18} /></span><small>Earnings</small><strong>Soon</strong></div>
          <div aria-label="Jobs completed today"><span><CheckCircle2 size={18} /></span><small>Completed</small><strong>{completedToday.state === 'loading' ? '…' : completedToday.state === 'error' ? '—' : completedToday.count}</strong></div>
          <div aria-label="Rating"><span><Star size={18} /></span><small>Rating</small><strong>{driverRatingLabel(user)}</strong></div>
        </div>
        <p className="driver-metrics__note">
          {completedToday.state === 'error'
            ? "Couldn't load today's jobs. They'll show next time you open Work."
            : 'Earnings and payouts are coming soon. Ratings appear after customers can rate jobs.'}
        </p>
      </section>

      <section className="driver-section" aria-labelledby="readiness-title">
        <div className="driver-section__heading"><div><span>ACCOUNT STATUS</span><h2 id="readiness-title">Driver readiness</h2></div></div>
        <button type="button" className="driver-readiness" onClick={onOpenOnboarding}>
          <span className={isVerified ? 'is-ready' : ''}>{isVerified ? <ShieldCheck size={21} /> : <FileCheck2 size={21} />}</span>
          <div><strong>{canWork ? 'Ready to take requests' : isVerified ? 'Documents verified' : blocker?.title}</strong><p>{isVerified ? `Documents approved${user?.credentialsValidUntil ? ` through ${formatCalendarDate(user.credentialsValidUntil)}` : ''}.` : blocker?.detail}</p></div>
          <ChevronRight size={19} />
        </button>
        <button type="button" className="driver-readiness driver-readiness--vehicle" onClick={onOpenVehicle}>
          <span className={hasVehicle ? 'is-ready' : ''}><Truck size={21} /></span>
          <div><strong>{hasVehicle ? 'Vehicle & equipment' : vehicleBlocker.title}</strong><p>{hasVehicle ? vehicleSummary : vehicleBlocker.detail}</p></div>
          <ChevronRight size={19} />
        </button>
      </section>
    </div>
  )
}
