/**
 * Driver active job: who to help, where to go, and one clear next step.
 * GPS sharing runs app-wide (useJobLocationSharing); this screen shows its state.
 */

import { useState } from 'react'
import { AlertCircle, Car, Check, ChevronLeft, Flag, Loader2, MapPin, Navigation, Phone, StickyNote, Wrench } from 'lucide-react'
import { useDriverStore } from '../../store/useDriverStore'
import { formatPrice } from '../../lib/money'
import type { BookingStatus } from '../../types'

interface DriverJobScreenProps {
  onBack: () => void
}

const STEPS: { status: BookingStatus; label: string }[] = [
  { status: 'accepted', label: 'Accepted' },
  { status: 'en_route', label: 'On the way' },
  { status: 'arrived', label: 'Arrived' },
  { status: 'in_progress', label: 'In service' },
  { status: 'completed', label: 'Done' },
]

const NEXT_ACTION: Partial<Record<BookingStatus, { next: BookingStatus; label: string }>> = {
  accepted: { next: 'en_route', label: "I'm on my way" },
  en_route: { next: 'arrived', label: "I've arrived" },
  arrived: { next: 'in_progress', label: 'Start service' },
  in_progress: { next: 'completed', label: 'Complete job' },
}

// Matches server DRIVER_TRANSITIONS: drivers may cancel only before arriving.
const CANCELLABLE: ReadonlySet<BookingStatus> = new Set<BookingStatus>(['accepted', 'en_route'])

const directions = (lat: number, lng: number) => `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`

export default function DriverJobScreen({ onBack }: DriverJobScreenProps) {
  const { activeBooking: job, updateJobStatus, locationSharing, error } = useDriverStore()
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  if (!job) {
    return (
      <div className="job-screen job-screen--empty">
        <AlertCircle size={40} aria-hidden="true" />
        <p>No active job right now.</p>
        <button type="button" className="aid-primary-button" onClick={onBack}>Back to dashboard</button>
      </div>
    )
  }

  const stepIndex = STEPS.findIndex((step) => step.status === job.status)
  const action = NEXT_ACTION[job.status]
  const isTow = Boolean(job.dropoffLocation)
  const headingToDropoff = isTow && job.status === 'in_progress'
  const target = headingToDropoff && job.dropoffLocation ? job.dropoffLocation : job.location
  const showDirections = job.status === 'accepted' || job.status === 'en_route' || headingToDropoff
  const customerName = job.customer?.firstName || 'the customer'

  const advance = async () => {
    if (!action) return
    setBusy(true)
    const ok = await updateJobStatus(action.next)
    setBusy(false)
    if (ok && action.next === 'completed') onBack()
  }

  const cancel = async () => {
    setBusy(true)
    const ok = await updateJobStatus('cancelled')
    setBusy(false)
    setConfirmCancel(false)
    if (ok) onBack()
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
          <button type="button" className="aid-primary-button" disabled={busy} onClick={() => void advance()}>
            {busy ? <Loader2 size={18} className="animate-spin" aria-label="Updating" /> : <>{action.next === 'in_progress' && <Wrench size={18} aria-hidden="true" />}{action.label}</>}
          </button>
        )}
        {CANCELLABLE.has(job.status) && (
          <button type="button" className="job-cancel" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel job</button>
        )}
      </div>

      {confirmCancel && (
        <div className="account-sheet-backdrop" role="presentation" onMouseDown={() => setConfirmCancel(false)}>
          <section className="account-sheet" role="dialog" aria-modal="true" aria-labelledby="cancel-job-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="account-sheet__handle" />
            <h2 id="cancel-job-title" className="job-confirm__title">Cancel this job?</h2>
            <p className="job-confirm__text">{customerName} will be told you can't make it, and the request goes back to other drivers. Frequent cancellations can affect your account.</p>
            <div className="job-confirm__actions">
              <button type="button" className="job-cancel job-cancel--solid" disabled={busy} onClick={() => void cancel()}>{busy ? 'Cancelling…' : 'Yes, cancel job'}</button>
              <button type="button" className="job-keep" onClick={() => setConfirmCancel(false)}>Keep job</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
