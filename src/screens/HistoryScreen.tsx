import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Battery,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Fuel,
  KeyRound,
  MapPin,
  Navigation,
  Plus,
  ReceiptText,
  RotateCcw,
  Truck,
  Wrench,
  Zap,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { Booking, BookingStatus, ServiceType } from '../types'
import { formatPrice } from '../lib/money'

const serviceIcons: Partial<Record<ServiceType, typeof Wrench>> = {
  battery_jump: Battery,
  flat_tire: CircleDot,
  lockout: KeyRound,
  towing: Truck,
  ev_charging: Zap,
  fuel_delivery: Fuel,
  oil_change: Car,
}

const statusLabels: Record<BookingStatus, string> = {
  pending: 'Pending',
  searching: 'Matching',
  accepted: 'Confirmed',
  en_route: 'On the way',
  arrived: 'Arrived',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

type Filter = 'all' | 'completed' | 'cancelled'

function ActivityCard({ booking }: { booking: Booking }) {
  const { openBookingDetail, openReceipt, rebookFromHistory } = useAppStore()
  const Icon = serviceIcons[booking.service.id] ?? Wrench
  const completed = booking.status === 'completed'
  const date = new Date(booking.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <article className="activity-card">
      <button type="button" className="activity-card__main" onClick={() => openBookingDetail(booking.id)} aria-label={`Open ${booking.service.name} details`}>
        <span className="activity-card__icon"><Icon size={21} /></span>
        <span className="activity-card__copy">
          <span className={`activity-status activity-status--${booking.status}`}>{statusLabels[booking.status]}</span>
          <strong>{booking.service.name}</strong>
          <small><CalendarDays size={13} /> {date}</small>
          <small><MapPin size={13} /> {booking.location.address}</small>
        </span>
        <span className="activity-card__price">{formatPrice(booking.finalPrice ?? booking.estimatedPrice)}<ChevronRight size={17} /></span>
      </button>
      {completed && (
        <div className="activity-card__actions">
          <button type="button" onClick={() => openReceipt(booking.id)}><ReceiptText size={15} /> Receipt</button>
          <button type="button" onClick={() => rebookFromHistory(booking.id)}><RotateCcw size={15} /> Request again</button>
        </div>
      )}
    </article>
  )
}

export default function HistoryScreen() {
  const { activeBooking, bookingHistory, setCurrentScreen } = useAppStore()
  const [filter, setFilter] = useState<Filter>('all')

  const activities = useMemo(() => {
    const sorted = [...bookingHistory].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    return filter === 'all' ? sorted : sorted.filter((booking) => booking.status === filter)
  }, [bookingHistory, filter])

  return (
    <div className="activity-screen">
      <header className="activity-header">
        <p>Your roadside services</p>
        <h1>Activity</h1>
      </header>

      {activeBooking && (
        <button type="button" className="activity-live" onClick={() => setCurrentScreen('chat')}>
          <span><Navigation size={21} /></span>
          <div><small>ACTIVE NOW</small><strong>{statusLabels[activeBooking.status]}</strong><p>{activeBooking.service.name}</p></div>
          <span>Track <ArrowRight size={16} /></span>
        </button>
      )}

      {bookingHistory.length > 0 && (
        <div className="activity-filters" aria-label="Filter activity">
          {(['all', 'completed', 'cancelled'] as Filter[]).map((item) => (
            <button type="button" key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      )}

      {activities.length > 0 ? (
        <section className="activity-list" aria-label="Service activity">
          {activities.map((booking) => <ActivityCard key={booking.id} booking={booking} />)}
        </section>
      ) : bookingHistory.length > 0 ? (
        <div className="activity-empty activity-empty--compact"><Clock3 size={27} /><h2>No {filter} services</h2><p>Choose another filter to see your activity.</p></div>
      ) : (
        <div className="activity-empty">
          <span><Wrench size={27} /></span>
          <h2>No roadside activity yet</h2>
          <p>Your active and completed requests will stay organized here.</p>
          <button type="button" onClick={() => setCurrentScreen('home')}><Plus size={18} /> Request roadside help</button>
        </div>
      )}

      <div className="activity-assurance"><CheckCircle2 size={16} /><span>Receipts and service details stay available in your account.</span></div>
    </div>
  )
}
