/**
 * Driver active job: who to help, where to go, and one clear next step.
 * GPS sharing runs app-wide (useJobLocationSharing); this screen shows its state.
 */

import { useState } from 'react'
import { AlertCircle, Car, Check, ChevronLeft, Flag, Info, Loader2, MapPin, Navigation, Phone, Star, StickyNote, Wrench, X } from 'lucide-react'
import { useDriverStore } from '../../store/useDriverStore'
import { formatPrice } from '../../lib/money'
import { DRIVER_CANCEL_REASONS, DRIVER_CANCELLABLE, DRIVER_ISSUES, REPORTABLE, driverNextAction } from '../../lib/jobLifecycle'
import { ConfirmSheet, ReportIssueSheet } from '../../components/job/JobSheets'
import { SafetyActions } from '../../components/safety/Safety'
import type { Booking, BookingStatus } from '../../types'
import { ratingSummary } from '../../lib/ratings'

interface DriverJobScreenProps {
  onBack: () => void
  /** The job was just completed (B15: the app then asks the driver to rate the customer). */
  onCompleted?: (job: Booking) => void
}

const STEPS: { status: BookingStatus; label: string }[] = [
  { status: 'accepted', label: 'Accepted' },
  { status: 'en_route', label: 'On the way' },
  { status: 'arrived', label: 'Arrived' },
  { status: 'in_progress', label: 'In service' },
  { status: 'completed', label: 'Done' },
]

const directions = (lat: number, lng: number) => `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`

type Sheet = 'complete' | 'cancel' | 'report' | null

export default function DriverJobScreen({ onBack, onCompleted }: DriverJobScreenProps) {
  const { activeBooking: job, updateJobStatus, locationSharing, error, jobEndedNotice, dismissJobEndedNotice } = useDriverStore()
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)

  if (!job) {
    return (
      <div className="job-screen job-screen--empty">
        {jobEndedNotice ? <X size={40} aria-hidden="true" /> : <AlertCircle size={40} aria-hidden="true" />}
        <p role={jobEndedNotice ? 'alert' : undefined}>
          {jobEndedNotice
            ? jobEndedNotice.bySystem
              ? `This ${jobEndedNotice.serviceName.toLowerCase()} job was released: AID didn't get your location or a status update for a long time, so it was cancelled and the customer told.`
              : `${jobEndedNotice.customerName || 'The customer'} cancelled this ${jobEndedNotice.serviceName.toLowerCase()} job. You're free for your next request.`
            : 'No active job right now.'}
        </p>
        <button type="button" className="aid-primary-button" onClick={() => { dismissJobEndedNotice(); onBack() }}>Back to dashboard</button>
      </div>
    )
  }

  const stepIndex = STEPS.findIndex((step) => step.status === job.status)
  const customerName = job.customer?.firstName || 'the customer'
  const action = driverNextAction(job, customerName)
  const isTow = Boolean(job.dropoffLocation)
  const headingToDropoff = isTow && job.status === 'in_progress'
  const target = headingToDropoff && job.dropoffLocation ? job.dropoffLocation : job.location
  const showDirections = job.status === 'accepted' || job.status === 'en_route' || headingToDropoff
  const canCancel = DRIVER_CANCELLABLE.has(job.status)
  const customerRating = ratingSummary(job.customer)

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

  return (
    <div className="job-screen safe-top">
      <header className="job-header">
        <button type="button" className="job-header__back" aria-label="Back to dashboard" onClick={onBack}><ChevronLeft size={22} /></button>
        <div><small>ACTIVE JOB</small><h1>{job.service.name}</h1></div>
        <strong className="job-header__price">{formatPrice(job.estimatedPrice)}</strong>
      </header>

      {locationSharing === 'denied' || locationSharing === 'error' ? (
        <div className="job-banner job-banner--warn" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <span>{locationSharing === 'denied'
            ? `Location is off, so ${customerName} can't see you coming. Turn on Location for AID in Settings.`
            : `Location is having trouble. ${customerName} may not see your latest position.`}</span>
        </div>
      ) : (
        <div className="job-banner">
          <i className={locationSharing === 'sharing' ? 'is-live' : ''} aria-hidden="true" />
          <span>{locationSharing === 'sharing' ? `Sharing your location with ${customerName}` : 'Finding your location…'}</span>
        </div>
      )}

      <section className="job-card" aria-label="Customer">
        <div className="job-person">
          <span className="job-person__avatar" aria-hidden="true">{(job.customer?.firstName || 'C').charAt(0).toUpperCase()}</span>
          <div className="job-person__text">
            <strong>{job.customer?.name || 'Customer'}</strong>
            {customerRating && <small aria-label={customerRating.label}><Star size={13} className="track-star" aria-hidden="true" /> {customerRating.value} ({customerRating.count})</small>}
            {job.vehicle && <small><Car size={13} aria-hidden="true" /> {job.vehicle.label}</small>}
            {job.vehicle && (job.vehicle.color || job.vehicle.plate) && <small className="job-person__plate">{[job.vehicle.color, job.vehicle.plate].filter(Boolean).join(' · ')}</small>}
          </div>
          {job.customer?.phone && (
            <a className="job-call" href={`tel:${job.customer.phone}`} aria-label={`Call ${customerName}`}><Phone size={19} /></a>
          )}
        </div>
        {job.notes && (
          <div className="job-notes"><StickyNote size={15} aria-hidden="true" /><p>{job.notes}</p></div>
        )}
      </section>

      <section className="job-card" aria-label="Route">
        <div className={`job-stop${headingToDropoff ? ' is-done' : ''}`}>
          <span className="job-stop__dot" aria-hidden="true"><MapPin size={14} /></span>
          <div><small>{isTow ? 'PICK UP' : 'SERVICE LOCATION'}</small><strong>{job.location.address}</strong></div>
        </div>
        {job.dropoffLocation && (
          <div className="job-stop">
            <span className="job-stop__dot job-stop__dot--end" aria-hidden="true"><Flag size={13} /></span>
            <div><small>DROP OFF</small><strong>{job.dropoffLocation.address}</strong></div>
          </div>
        )}
        {showDirections && (
          <a className="job-directions" href={directions(target.lat, target.lng)} target="_blank" rel="noreferrer"
            aria-label={headingToDropoff ? 'Directions to drop-off' : 'Directions to pickup'}>
            <Navigation size={18} aria-hidden="true" /> {headingToDropoff ? 'Directions to drop-off' : isTow ? 'Directions to pickup' : 'Directions'}
          </a>
        )}
      </section>

      <ol className="job-steps" aria-label="Job progress">
        {STEPS.map((step, index) => (
          <li key={step.status} className={index < stepIndex ? 'is-done' : index === stepIndex ? 'is-current' : ''} aria-current={index === stepIndex ? 'step' : undefined}>
            <span aria-hidden="true">{index < stepIndex ? <Check size={13} /> : index + 1}</span>{step.label}
          </li>
        ))}
      </ol>

      {error && <p className="job-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}

      <div className="job-actions">
        {action && (
          <>
            <button type="button" className="aid-primary-button" disabled={busy} aria-busy={busy} onClick={primary}>
              {busy && sheet === null
                ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Updating…</>
                : <>{action.next === 'in_progress' && <Wrench size={18} aria-hidden="true" />}{action.next === 'completed' && <Check size={18} aria-hidden="true" />}{action.label}</>}
            </button>
            <p className="job-actions__hint">{action.hint}</p>
          </>
        )}
        {job.status === 'in_progress' && (
          <p className="job-note"><Info size={15} aria-hidden="true" /> Service has started, so this job can't be cancelled. If something's wrong, report an issue.</p>
        )}
        <div className="job-actions__row">
          {canCancel && <button type="button" className="job-cancel" disabled={busy} onClick={() => setSheet('cancel')}>Cancel job</button>}
          {REPORTABLE.has(job.status) && <button type="button" className="job-report" disabled={busy} onClick={() => setSheet('report')}>Report an issue</button>}
        </div>
        <SafetyActions audience="driver" />
      </div>

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
      {sheet === 'report' && <ReportIssueSheet bookingId={job.id} choices={DRIVER_ISSUES} onClose={() => setSheet(null)} />}
    </div>
  )
}
