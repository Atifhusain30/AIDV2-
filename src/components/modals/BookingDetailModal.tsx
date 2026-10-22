/**
 * Service details (from Activity or a notification), on the one bottom-sheet style: status and
 * price up top, compact progress while live, the driver, the route, the vehicle and times as
 * quiet rows, and one primary action pinned at the bottom (Receipt when done, Track while live).
 */

import { useState } from 'react'
import { CalendarClock, Car, CheckCircle2, ExternalLink, MessageCircle, Navigation, ReceiptText, RotateCcw, SearchX, Wrench } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { BookingStatus } from '../../types'
import { jobCountLabel, ratingSummary } from '../../lib/ratings'
import { endedChatReadable } from '../../lib/chat'
import BottomSheet from '../ui/BottomSheet'
import ChunkBoundary from '../ui/ChunkBoundary'
import { lazyWithRetry } from '../../lib/lazyWithRetry'
import Button from '../ui/Button'
import { InfoRow, List } from '../ui/ListRow'
import PersonAvatar from '../ui/PersonAvatar'
import StepProgress from '../ui/StepProgress'
import { EmptyState } from '../ui/States'
import { TripStops } from '../tracking/TrackLayout'
import { chargeLabel, dayLabel, serviceIcon, statusLabels, statusTone, timeLabel } from '../../lib/serviceDisplay'

// F6: chat downloads only when it's opened.
const JobChat = lazyWithRetry(() => import('../chat/JobChat'))

const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`
const fullDate = (value: Date | string) => `${new Date(value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at ${timeLabel(value)}`

const LIVE_STEPS = [
  { id: 'searching', label: 'Finding a driver' },
  { id: 'accepted', label: 'Driver assigned' },
  { id: 'en_route', label: 'On the way' },
  { id: 'arrived', label: 'Arrived' },
  { id: 'in_progress', label: 'In progress' },
]
const liveStep = (status: BookingStatus) => Math.max(0, LIVE_STEPS.findIndex((step) => step.id === status))

export default function BookingDetailModal() {
  const { selectedBookingId, bookingHistory, closeBookingDetail, activeBooking, setCurrentScreen, rebookFromHistory, openReceipt } = useAppStore()
  const [chatOpen, setChatOpen] = useState(false)
  if (!selectedBookingId) return null

  const booking = bookingHistory.find((item) => item.id === selectedBookingId)
    ?? (activeBooking?.id === selectedBookingId ? activeBooking : undefined)
  const close = () => { setChatOpen(false); closeBookingDetail() }

  if (!booking) {
    return (
      <BottomSheet title="Service not found" onClose={close} closeLabel="Close service details">
        <EmptyState compact icon={<SearchX size={22} />} title="We couldn't find this service" body="It may have been removed, or it belongs to another account." headingLevel={3} />
      </BottomSheet>
    )
  }

  const Icon = serviceIcon(booking.service.id)
  const tone = statusTone(booking.status)
  const terminal = booking.status === 'cancelled' || booking.status === 'completed' || booking.status === 'expired'
  const live = !terminal && activeBooking?.id === booking.id
  const driver = booking.driver
  const driverVehicle = driver?.vehicle ? [driver.vehicle.color, driver.vehicle.make, driver.vehicle.model].filter(Boolean).join(' ') : ''
  const rating = ratingSummary(driver)
  const jobs = jobCountLabel(driver?.totalJobs)
  const charge = chargeLabel(booking)
  const hasCoords = Boolean(booking.location.lat && booking.location.lng)

  const footer = (
    <>
      {booking.status === 'completed' && (
        <Button block size="lg" icon={<ReceiptText size={18} aria-hidden="true" />} onClick={() => { closeBookingDetail(); openReceipt(booking.id) }}>View receipt</Button>
      )}
      {live && (
        <Button block size="lg" icon={<Navigation size={18} aria-hidden="true" />} onClick={() => { closeBookingDetail(); setCurrentScreen('chat') }}>View live status</Button>
      )}
      <div className="detail-actions">
        <Button variant="secondary" icon={<RotateCcw size={17} aria-hidden="true" />} onClick={() => { rebookFromHistory(booking.id); closeBookingDetail() }}>Request again</Button>
        {endedChatReadable(booking) && (
          <Button variant="secondary" icon={<MessageCircle size={17} aria-hidden="true" />} onClick={() => setChatOpen(true)}>Messages</Button>
        )}
      </div>
    </>
  )

  return (
    <BottomSheet title={booking.service.name} subtitle={fullDate(booking.createdAt)} onClose={close} closeLabel="Close service details" className="detail-sheet" footer={footer}>
      <div className="detail-summary">
        <span className="detail-summary__icon" aria-hidden="true"><Icon size={22} /></span>
        <div className="detail-summary__text">
          <span className={`ui-chip ui-chip--${tone}`}>
            {booking.status === 'completed' && <CheckCircle2 size={13} aria-hidden="true" />}{statusLabels[booking.status]}
          </span>
        </div>
        <strong className={`detail-summary__price${charge.muted ? ' is-muted' : ''}${charge.text === 'No charge' ? ' is-text' : ''}`}>{charge.text}</strong>
      </div>

      {live && <StepProgress steps={LIVE_STEPS} current={liveStep(booking.status)} label="Service progress" />}

      {driver && (
        <List label="Driver">
          <InfoRow
            icon={<PersonAvatar name={driver.name || driver.firstName} size="sm" />}
            title={driver.name || driver.firstName || 'Your driver'}
            subtitle={rating
              ? <span aria-label={`${rating.label}${jobs ? `, ${jobs}` : ''}`}>★ {rating.value} ({rating.count}){jobs ? ` · ${jobs}` : ''}</span>
              : driverVehicle || 'New on AID'}
            trailing={driver.vehicle?.plate ? <span className="ui-plate">{driver.vehicle.plate}</span> : undefined}
          />
        </List>
      )}

      <div className="ui-card">
        <TripStops pickup={booking.location.address} dropoff={booking.dropoffLocation?.address || undefined} />
        {hasCoords && (
          <a className="detail-maps" href={mapsUrl(booking.location.lat, booking.location.lng)} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} aria-hidden="true" /> Open in Maps
          </a>
        )}
      </div>

      <List label="Details">
        {booking.vehicle && (
          <InfoRow icon={<Car size={19} />} title={booking.vehicle.label} subtitle={[booking.vehicle.color, booking.vehicle.plate].filter(Boolean).join(' · ') || undefined} />
        )}
        <InfoRow icon={<CalendarClock size={19} />} title="Requested" trailing={<span className="ui-row__value">{dayLabel(booking.createdAt)}, {timeLabel(booking.createdAt)}</span>} />
        {booking.completedAt && (
          <InfoRow icon={<CheckCircle2 size={19} />} title="Completed" trailing={<span className="ui-row__value">{dayLabel(booking.completedAt)}, {timeLabel(booking.completedAt)}</span>} />
        )}
      </List>

      {booking.notes && (
        <figure className="job-note-quote">
          <figcaption>Your note</figcaption>
          <blockquote>{booking.notes}</blockquote>
        </figure>
      )}

      {chatOpen && (
        <ChunkBoundary>
          <JobChat
            bookingId={booking.id} audience="customer" otherName={driver?.firstName || 'Your driver'} serviceName={booking.service.name}
            initialChat={{ state: 'read_only', unread: 0, blockedByMe: false, readOnlyUntil: null }} onClose={() => setChatOpen(false)}
          />
        </ChunkBoundary>
      )}
    </BottomSheet>
  )
}
