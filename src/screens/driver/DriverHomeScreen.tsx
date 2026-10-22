import { useEffect } from 'react'
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  DollarSign,
  FileCheck2,
  MapPin,
  Navigation,
  Power,
  Settings,
  ShieldCheck,
  Star,
  Truck,
} from 'lucide-react'
import AidBrand from '../../components/brand/AidBrand'
import { useAuthStore } from '../../store/useAuthStore'
import { useDriverStore } from '../../store/useDriverStore'
import type { Driver } from '../../types'
import { driverEligibility, ELIGIBILITY_COPY } from '../../lib/driverEligibility'
import { formatCalendarDate } from '../../lib/dates'
import { formatPrice } from '../../lib/money'

interface DriverHomeScreenProps {
  onOpenOnboarding: () => void
  onOpenSettings: () => void
  onOpenActiveJob: () => void
}

export default function DriverHomeScreen({ onOpenOnboarding, onOpenSettings, onOpenActiveJob }: DriverHomeScreenProps) {
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
  } = useDriverStore()

  const eligibility = driverEligibility(user)
  const isVerified = eligibility === 'eligible'
  const blocker = eligibility === 'eligible' ? null : ELIGIBILITY_COPY[eligibility]

  useEffect(() => {
    if (user?.id) fetchActiveBooking(user.id)
  }, [fetchActiveBooking, user?.id])

  useEffect(() => {
    if (!isOnline) return
    fetchIncomingRequests()
    const timer = window.setInterval(fetchIncomingRequests, 30000)
    return () => window.clearInterval(timer)
  }, [fetchIncomingRequests, isOnline])

  // Going offline is always allowed; going online requires eligibility.
  const toggleAvailability = () => {
    if (!isOnline && !isVerified) return
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
          <p>Good afternoon, {user?.firstName || 'Driver'}.</p>
        </div>
        <div className="driver-work__header-actions">
          <button type="button" className="aid-icon-button" aria-label="Notifications"><Bell size={19} /></button>
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
        {isOnline || isVerified ? (
          <button type="button" className="availability-card__button" onClick={toggleAvailability} disabled={isLoading}>
            {isOnline ? 'Go offline' : 'Go online'}
          </button>
        ) : (
          <button type="button" className="availability-card__button" onClick={onOpenOnboarding}>
            {blocker?.action}
          </button>
        )}
        {error && <p role="alert" className="availability-card__error">{error}</p>}
      </section>

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

        {!isVerified ? (
          <button type="button" className="readiness-prompt" onClick={onOpenOnboarding}>
            <span><FileCheck2 size={22} /></span>
            <div><strong>{blocker?.title}</strong><p>{blocker?.detail}</p></div>
            <ChevronRight size={19} />
          </button>
        ) : !isOnline ? (
          <div className="driver-empty-state"><Power size={25} /><strong>Go online to receive work</strong><p>New roadside requests will appear here.</p></div>
        ) : incomingRequests.length === 0 ? (
          <div className="driver-empty-state"><Clock3 size={25} /><strong>Waiting for a nearby request</strong><p>You are visible to customers in your service area.</p></div>
        ) : (
          <div className="request-list">
            {incomingRequests.map((request) => (
              <article className="request-card" key={request.id}>
                <div className="request-card__top">
                  <span className="request-card__service"><Truck size={19} /></span>
                  <div><strong>{request.service.name}</strong><p>{request.customerName || 'Nearby customer'}</p></div>
                  <span className="request-card__price">{formatPrice(request.estimatedPrice)}</span>
                </div>
                <p className="request-card__location"><MapPin size={15} /> {request.location.address}</p>
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
          <div><span><DollarSign size={18} /></span><small>Earnings</small><strong>$0.00</strong></div>
          <div><span><CheckCircle2 size={18} /></span><small>Completed</small><strong>0</strong></div>
          <div><span><Star size={18} /></span><small>Rating</small><strong>{user?.rating?.toFixed(1) || '—'}</strong></div>
        </div>
      </section>

      <section className="driver-section" aria-labelledby="readiness-title">
        <div className="driver-section__heading"><div><span>ACCOUNT STATUS</span><h2 id="readiness-title">Driver readiness</h2></div></div>
        <button type="button" className="driver-readiness" onClick={onOpenOnboarding}>
          <span className={isVerified ? 'is-ready' : ''}>{isVerified ? <ShieldCheck size={21} /> : <FileCheck2 size={21} />}</span>
          <div><strong>{isVerified ? 'Ready to take requests' : blocker?.title}</strong><p>{isVerified ? `Documents approved${user?.credentialsValidUntil ? ` through ${formatCalendarDate(user.credentialsValidUntil)}` : ''}.` : blocker?.detail}</p></div>
          <ChevronRight size={19} />
        </button>
      </section>
    </div>
  )
}
