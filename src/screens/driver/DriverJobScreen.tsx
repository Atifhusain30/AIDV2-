/**
 * Driver active job: one focused command surface. Where you are in the job (compact progress),
 * who to help, where to go — and one dominant next step pinned in the thumb zone. Report, Safety,
 * Call 911 and Cancel stay one tap away as quiet rows, never competing with the next step.
 * GPS sharing runs app-wide (useJobLocationSharing); this screen shows its state.
 */

import { useState } from 'react'
import { AlertCircle, Car, Check, ChevronLeft, Flag, Info, Navigation, Phone, Star, Wrench, X, XCircle } from 'lucide-react'
import { useDriverStore } from '../../store/useDriverStore'
import { formatPrice } from '../../lib/money'
import { DRIVER_CANCEL_REASONS, DRIVER_CANCELLABLE, REPORTABLE, driverNextAction } from '../../lib/jobLifecycle'
import { ConfirmSheet, ReportIssueSheet } from '../../components/job/JobSheets'
import { SafetyActions } from '../../components/safety/Safety'
import type { Booking, BookingStatus } from '../../types'
import { ratingSummary } from '../../lib/ratings'
import { showChatEntry, type BookingChat } from '../../lib/chat'
import { MessageButton } from '../../components/chat/MessageButton'
import ChunkBoundary from '../../components/ui/ChunkBoundary'
import { lazyWithRetry } from '../../lib/lazyWithRetry'
import RealtimeNotice from '../../components/ui/RealtimeNotice'
import LiveRegion from '../../components/ui/LiveRegion'
import Button, { buttonClass } from '../../components/ui/Button'
import PersonAvatar from '../../components/ui/PersonAvatar'
import StepProgress from '../../components/ui/StepProgress'
import StickyActionBar from '../../components/ui/StickyActionBar'
import { EmptyState } from '../../components/ui/States'
import { List, ListRow } from '../../components/ui/ListRow'
import { TripStops } from '../../components/tracking/TrackLayout'
import { useAnnounceOnChange, useAnnouncer } from '../../lib/announce'

// F6: chat downloads only when it's opened.
const JobChat = lazyWithRetry(() => import('../../components/chat/JobChat'))

interface DriverJobScreenProps {
  onBack: () => void
  /** The job was just completed (B15: the app then asks the driver to rate the customer). */
  onCompleted?: (job: Booking) => void
}

const STEPS: { id: BookingStatus; label: string }[] = [
  { id: 'accepted', label: 'Accepted' },
  { id: 'en_route', label: 'On the way' },
  { id: 'arrived', label: 'Arrived' },
  { id: 'in_progress', label: 'In service' },
  { id: 'completed', label: 'Done' },
]

const directions = (lat: number, lng: number) => `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`

type Sheet = 'complete' | 'cancel' | 'report' | null

export default function DriverJobScreen({ onBack, onCompleted }: DriverJobScreenProps) {
  const { activeBooking: job, updateJobStatus, locationSharing, error, jobEndedNotice, dismissJobEndedNotice } = useDriverStore()
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [chatOpen, setChatOpen] = useState(false)

  // B12: what the chat changed (read, blocked) shows on the badge now rather than at the next poll.
  const updateChat = (change: Partial<BookingChat>) => {
    const current = useDriverStore.getState().activeBooking
    if (current?.chat) useDriverStore.setState({ activeBooking: { ...current, chat: { ...current.chat, ...change } } })
  }

  // F4: a screen reader hears each status change (from the driver's own tap or the server).
  const [liveText, announce] = useAnnouncer()
  const stepLabel = job ? STEPS.find((step) => step.id === job.status)?.label : undefined
  useAnnounceOnChange(job?.status, `Job status: ${stepLabel ?? (job?.status === 'cancelled' ? 'Cancelled' : job?.status === 'completed' ? 'Completed' : 'Updated')}.`, announce)

  if (!job) {
    const ended = jobEndedNotice
    return (
      <div className="job-screen job-screen--empty safe-top">
        <EmptyState
          icon={ended ? <X size={24} /> : <AlertCircle size={24} />}
          title={ended ? 'Job ended' : 'No active job'}
          body={<span role={ended ? 'alert' : undefined}>{ended
            ? ended.bySystem
              ? `This ${ended.serviceName.toLowerCase()} job was released: AID didn't get your location or a status update for a long time, so it was cancelled and the customer told.`
              : `${ended.customerName || 'The customer'} cancelled this ${ended.serviceName.toLowerCase()} job. You're free for your next request.`
            : 'New requests show on your dashboard.'}</span>}
          action={{ label: 'Back to dashboard', onClick: () => { dismissJobEndedNotice(); onBack() } }}
        />
      </div>
    )
  }

  const stepIndex = Math.max(0, STEPS.findIndex((step) => step.id === job.status))
  const customerName = job.customer?.firstName || 'the customer'
  const customerFirst = job.customer?.firstName || 'Customer'
  const action = driverNextAction(job, customerName)
  const isTow = Boolean(job.dropoffLocation)
  const headingToDropoff = isTow && job.status === 'in_progress'
  const target = headingToDropoff && job.dropoffLocation ? job.dropoffLocation : job.location
  const showDirections = job.status === 'accepted' || job.status === 'en_route' || headingToDropoff
  const canCancel = DRIVER_CANCELLABLE.has(job.status)
  const customerRating = ratingSummary(job.customer)
  const vehicleDetail = job.vehicle ? [job.vehicle.color, job.vehicle.plate].filter(Boolean).join(' · ') : ''

  const move = async (next: BookingStatus, reason?: string) => {
    setBusy(true)
    const finished = job
    const ok = await updateJobStatus(next, reason)
    setBusy(false)
    setSheet(null)
    if (ok && next === 'completed') onCompleted?.(finished)
    // Completed or cancelled: the job is over and the driver is free.
    if (ok && (next === 'completed' || next === 'cancelled')) onBack()
  }

  const primary = () => {
    if (!action || busy) return
    if (action.confirm) setSheet('complete')
    else void move(action.next)
  }

  const sharingProblem = locationSharing === 'denied' || locationSharing === 'error'

  return (
    <div className="job-screen safe-top">
      <LiveRegion message={liveText} />
      <RealtimeNotice />
      <header className="job-top">
        <button type="button" className="ui-icon-btn ui-icon-btn--plain" aria-label="Back to dashboard" onClick={onBack}><ChevronLeft size={24} aria-hidden="true" /></button>
        <div className="job-top__title">
          <h1>{job.service.name}</h1>
          {!sharingProblem && (
            <p className="job-top__sharing">
              <i className={locationSharing === 'sharing' ? 'is-live' : ''} aria-hidden="true" />
              {locationSharing === 'sharing' ? `Sharing your location with ${customerName}` : 'Finding your location…'}
            </p>
          )}
        </div>
        <strong className="job-top__price">{formatPrice(job.estimatedPrice)}</strong>
      </header>

      {sharingProblem && (
        <div className="ui-alert ui-alert--warning" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <span>{locationSharing === 'denied'
            ? `Location is off, so ${customerName} can't see you coming. Turn on Location for AID in Settings.`
            : `Location is having trouble. ${customerName} may not see your latest position.`}</span>
        </div>
      )}

      <StepProgress label="Job progress" current={stepIndex} steps={STEPS} />

      <section className="track-card" aria-label="Customer">
        <div className="track-person">
          <PersonAvatar name={job.customer?.name || job.customer?.firstName} />
          <div className="track-person__text">
            <strong>{job.customer?.name || 'Customer'}</strong>
            {customerRating
              ? <span className="ui-meta"><span className="ui-rating" aria-label={customerRating.label}><Star size={13} aria-hidden="true" /> {customerRating.value} ({customerRating.count})</span></span>
              : <span className="ui-meta">Customer</span>}
          </div>
          <div className="track-person__actions">
            {showChatEntry(job.chat) && (
              <MessageButton name={customerFirst} unread={chatOpen ? 0 : job.chat?.unread ?? 0} onClick={() => setChatOpen(true)} />
            )}
            {job.customer?.phone && (
              <a className="ui-icon-btn" href={`tel:${job.customer.phone}`} aria-label={`Call ${customerName}`}><Phone size={19} aria-hidden="true" /></a>
            )}
          </div>
        </div>
        {job.vehicle && (
          <div className="track-vehicle" role="group" aria-label="Customer vehicle">
            <Car size={18} aria-hidden="true" />
            <span><small>Vehicle</small><strong>{job.vehicle.label}</strong></span>
            {vehicleDetail && <span className="job-vehicle__detail">{vehicleDetail}</span>}
          </div>
        )}
        {job.notes && (
          <figure className="job-note-quote">
            <figcaption>Note from {customerFirst}</figcaption>
            <blockquote>{job.notes}</blockquote>
          </figure>
        )}
      </section>

      <section className="track-card" aria-label="Route">
        <TripStops pickup={job.location.address} dropoff={job.dropoffLocation?.address} done={headingToDropoff} />
        {showDirections && (
          <a className={buttonClass('secondary', 'md', true)} href={directions(target.lat, target.lng)} target="_blank" rel="noreferrer"
            aria-label={headingToDropoff ? 'Directions to drop-off' : 'Directions to pickup'}>
            <Navigation size={18} aria-hidden="true" /> {headingToDropoff ? 'Directions to drop-off' : isTow ? 'Directions to pickup' : 'Directions'}
          </a>
        )}
      </section>

      {job.status === 'in_progress' && (
        <p className="ui-alert"><Info size={15} aria-hidden="true" /> Service has started, so this job can't be cancelled. If something's wrong, report an issue.</p>
      )}

      <List label="Job options" className="track-more">
        {REPORTABLE.has(job.status) && <ListRow icon={<Flag size={18} />} title="Report an issue" hasPopup disabled={busy} onClick={() => setSheet('report')} />}
        <SafetyActions audience="driver" />
        {canCancel && <ListRow icon={<XCircle size={18} />} title="Cancel job" tone="danger" hasPopup chevron={false} disabled={busy} onClick={() => setSheet('cancel')} />}
      </List>

      {(action || error) && (
        <StickyActionBar label="Next step" hint={action?.hint}>
          {error && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
          {action && (
            <Button size="lg" block className="job-primary" loading={busy && sheet === null} loadingLabel="Updating…" disabled={busy} onClick={primary}
              icon={action.next === 'in_progress' ? <Wrench size={18} aria-hidden="true" /> : action.next === 'completed' ? <Check size={18} aria-hidden="true" /> : undefined}>
              {action.label}
            </Button>
          )}
        </StickyActionBar>
      )}

      {sheet === 'complete' && (
        <ConfirmSheet
          id="complete-job" tone="primary" busy={busy} error={error}
          title="Complete this job?"
          text={isTow
            ? `Only complete once ${customerName}'s vehicle is at the drop-off. ${customerName} gets their receipt and the job closes.`
            : `Only complete once the service is finished. ${customerName} gets their receipt and the job closes.`}
          confirmLabel="Yes, complete job" busyLabel="Completing…" keepLabel="Not yet"
          onConfirm={() => void move('completed')} onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'cancel' && (
        <ConfirmSheet
          id="cancel-job" tone="danger" busy={busy} error={error}
          title="Cancel this job?"
          text={`${customerName}'s request will be cancelled and they'll be told you can't make it. Frequent cancellations can affect your account.`}
          reasons={DRIVER_CANCEL_REASONS} reasonRequired
          confirmLabel="Yes, cancel job" busyLabel="Cancelling…" keepLabel="Keep job"
          onConfirm={(reason) => void move('cancelled', reason ?? undefined)} onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'report' && <ReportIssueSheet bookingId={job.id} audience="driver" onClose={() => setSheet(null)} />}
      {chatOpen && (
        <ChunkBoundary>
          <JobChat
            bookingId={job.id} audience="driver" otherName={customerFirst} serviceName={job.service.name}
            initialChat={job.chat} onClose={() => setChatOpen(false)} onChatChange={updateChat}
          />
        </ChunkBoundary>
      )}
    </div>
  )
}
