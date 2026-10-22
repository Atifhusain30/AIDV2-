/**
 * Driver verification — individual providers upload four documents, submit
 * for review, and follow the admin decision. All rules are enforced by the
 * server (server/verification.js); this screen mirrors them for guidance.
 */

import { useEffect, useId, useState } from 'react'
import { AlertCircle, ArrowLeft, Camera, CheckCircle2, ChevronRight, Clock3, FileText, Loader2, ShieldAlert, ShieldCheck, Truck, X } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useDriverStore } from '../../store/useDriverStore'
import { documentService, DOCUMENT_REQUIREMENTS, REQUIRED_DOCUMENT_TYPES } from '../../services/documents'
import type { Driver, DriverDocument, DriverDocumentType, DriverVerification } from '../../types'
import { driverVehicleSummary, equipmentLabel, vehicleComplete } from '../../lib/driverVehicle'
import { formatCalendarDate } from '../../lib/dates'
import Dialog from '../../components/ui/Dialog'

interface DriverOnboardingScreenProps {
  onComplete: () => void
  onSkip?: () => void
  /** Opens the vehicle & equipment screen (the step after documents). */
  onOpenVehicle: () => void
}

type ChipTone = 'neutral' | 'progress' | 'success' | 'danger'

const todayIso = () => new Date().toISOString().slice(0, 10)
const tomorrowIso = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

const formatDate = formatCalendarDate

function documentState(document: DriverDocument | undefined, status: DriverVerification['status']): { label: string; tone: ChipTone } {
  if (!document) return { label: 'Needed', tone: 'neutral' }
  if (document.status === 'rejected') return { label: 'Needs replacement', tone: 'danger' }
  if (document.expiresOn && document.expiresOn <= todayIso()) return { label: 'Expired', tone: 'danger' }
  if (document.status === 'approved') return { label: 'Approved', tone: 'success' }
  return status === 'under_review' ? { label: 'In review', tone: 'progress' } : { label: 'Uploaded', tone: 'progress' }
}

function StatusHeader({ verification }: { verification: DriverVerification }) {
  switch (verification.status) {
    case 'under_review':
      return (
        <header className="verify-status is-progress">
          <Clock3 size={22} aria-hidden="true" />
          <div><h1>Your application is under review</h1><p>We review applications in the order received and will update this screen when a decision is made.</p></div>
        </header>
      )
    case 'verified':
      return (
        <header className="verify-status is-success">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <h1>You're verified</h1>
            <p>{verification.credentialsValidUntil ? `Eligible to drive through ${formatDate(verification.credentialsValidUntil)}. Upload renewals before then to keep driving.` : 'Your documents are approved.'}</p>
          </div>
        </header>
      )
    case 'rejected':
      return (
        <header className="verify-status is-danger">
          <AlertCircle size={22} aria-hidden="true" />
          <div><h1>Changes needed</h1><p>{verification.reviewNotes || 'Some documents need to be replaced before we can approve you.'}</p></div>
        </header>
      )
    case 'suspended':
      return (
        <header className="verify-status is-danger">
          <ShieldAlert size={22} aria-hidden="true" />
          <div><h1>Your account is suspended</h1><p>{verification.reviewNotes || 'Contact AID support for details.'}</p></div>
        </header>
      )
    default:
      return (
        <header className="verify-status">
          <ShieldCheck size={22} aria-hidden="true" />
          <div><h1>Become a verified driver</h1><p>Upload the four documents below, then submit them for review. Customers only see verified drivers.</p></div>
        </header>
      )
  }
}

function UploadSheet({ type, onClose }: { type: DriverDocumentType; onClose: () => void }) {
  const requirement = DOCUMENT_REQUIREMENTS[type]
  const uploadVerificationDocument = useDriverStore((state) => state.uploadVerificationDocument)
  const [expiresOn, setExpiresOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const titleId = useId()
  const dateId = useId()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !isUploading) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isUploading, onClose])

  const choose = async (kind: 'photo' | 'pdf') => {
    setError(null)
    if (requirement.requiresExpiration) {
      if (!expiresOn) return setError('Enter the expiration date printed on this document.')
      if (expiresOn <= todayIso()) return setError('This document has expired. Upload a current one.')
    }
    setIsUploading(true)
    try {
      const file = kind === 'photo' ? await documentService.pickImage() : await documentService.pickDocument()
      if (!file) return
      await uploadVerificationDocument(file, type, requirement.requiresExpiration ? expiresOn : undefined)
      onClose()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed. Try again.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog labelledBy={titleId} describedBy={`${titleId}-hint`} className="account-sheet verify-sheet" dismissible={!isUploading} onClose={onClose}>
        <div className="account-sheet__header">
          <div><small>UPLOAD DOCUMENT</small><h2 id={titleId}>{requirement.label}</h2></div>
          <button type="button" aria-label="Close" disabled={isUploading} onClick={onClose}><X size={20} /></button>
        </div>
        <p id={`${titleId}-hint`} className="verify-sheet__hint">{requirement.hint}</p>

        {requirement.requiresExpiration && (
          <label className="verify-sheet__field" htmlFor={dateId}>
            <span>Expiration date</span>
            <input id={dateId} type="date" min={tomorrowIso()} value={expiresOn} disabled={isUploading} onChange={(event) => setExpiresOn(event.target.value)} />
          </label>
        )}

        {error && <p role="alert" className="verify-sheet__error"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}

        <div className="verify-sheet__actions">
          <button type="button" className="aid-primary-button" disabled={isUploading} onClick={() => void choose('photo')}>
            {isUploading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}
            {isUploading ? 'Uploading…' : 'Choose photo'}
          </button>
          <button type="button" className="verify-sheet__secondary" disabled={isUploading} onClick={() => void choose('pdf')}>
            <FileText size={18} aria-hidden="true" /> Choose PDF
          </button>
        </div>
        <p className="verify-sheet__privacy">Documents are stored privately and only seen by the AID review team.</p>
    </Dialog>
  )
}

export default function DriverOnboardingScreen({ onComplete, onOpenVehicle }: DriverOnboardingScreenProps) {
  const { verification, fetchVerification, submitVerification } = useDriverStore()
  const user = useAuthStore((state) => state.user) as Driver | null
  const [activeType, setActiveType] = useState<DriverDocumentType | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => { void fetchVerification() }, [fetchVerification])

  if (!verification) {
    return (
      <div className="driver-work verify safe-top safe-bottom">
        <button type="button" className="verify__back" onClick={onComplete}><ArrowLeft size={18} aria-hidden="true" /> Back to work</button>
        <h1 className="sr-only">Driver verification</h1>
        <div className="driver-empty-state" role="status"><Loader2 size={25} className="animate-spin" aria-hidden="true" /><strong>Loading your verification</strong></div>
      </div>
    )
  }

  const vehicle = user?.vehicle ?? null
  const vehicleSummary = driverVehicleSummary(vehicle)
  const equipment = equipmentLabel(vehicle?.equipmentType)
  const vehicleState: { label: string; tone: ChipTone } = vehicleComplete(vehicle)
    ? { label: 'Added', tone: 'success' }
    : vehicle ? { label: 'Incomplete', tone: 'danger' } : { label: 'Needed', tone: 'neutral' }

  const latest = documentService.latestDocumentsByType(verification.documents)
  const { readiness } = verification
  const outstanding = readiness.missing.length + readiness.rejected.length + readiness.expired.length
  const canApply = verification.status === 'pending' || verification.status === 'rejected'

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await submitVerification()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to submit. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="driver-work verify safe-top safe-bottom">
      <button type="button" className="verify__back" onClick={onComplete}><ArrowLeft size={18} aria-hidden="true" /> Back to work</button>

      <StatusHeader verification={verification} />

      <section className="driver-section" aria-labelledby="documents-title">
        <div className="driver-section__heading"><div><span>REQUIRED</span><h2 id="documents-title">Documents</h2></div></div>
        <ul className="verify-list">
          {REQUIRED_DOCUMENT_TYPES.map((type) => {
            const document = latest[type]
            const state = documentState(document, verification.status)
            const requirement = DOCUMENT_REQUIREMENTS[type]
            return (
              <li key={type}>
                <button type="button" className="verify-item" onClick={() => setActiveType(type)} aria-label={`${requirement.label}: ${state.label}`}>
                  <span className={`verify-item__icon is-${state.tone}`} aria-hidden="true">
                    {state.tone === 'success' ? <CheckCircle2 size={20} /> : state.tone === 'danger' ? <AlertCircle size={20} /> : <FileText size={20} />}
                  </span>
                  <span className="verify-item__copy">
                    <strong>{requirement.label}</strong>
                    <small>{document?.expiresOn ? `Expires ${formatDate(document.expiresOn)}` : document ? document.fileName : requirement.hint}</small>
                    {document?.status === 'rejected' && document.reviewNotes && <em>{document.reviewNotes}</em>}
                  </span>
                  <span className={`verify-chip is-${state.tone}`}>{state.label}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="driver-section" aria-labelledby="vehicle-title">
        <div className="driver-section__heading"><div><span>REQUIRED TO GO ONLINE</span><h2 id="vehicle-title">Service vehicle</h2></div></div>
        <button type="button" className="verify-item" onClick={onOpenVehicle} aria-label={`Service vehicle: ${vehicleState.label}`}>
          <span className={`verify-item__icon is-${vehicleState.tone}`} aria-hidden="true">
            {vehicleState.tone === 'success' ? <CheckCircle2 size={20} /> : <Truck size={20} />}
          </span>
          <span className="verify-item__copy">
            <strong>Vehicle & equipment</strong>
            <small>{vehicleSummary ? `${vehicleSummary}${equipment ? ` · ${equipment}` : ''}` : 'Make, model, year, color, plate and equipment'}</small>
          </span>
          <span className={`verify-chip is-${vehicleState.tone}`}>{vehicleState.label}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </section>

      {canApply && (
        <footer className="verify-footer">
          <p>{readiness.canSubmit ? 'All documents uploaded. Submit when ready.' : `${outstanding} document${outstanding === 1 ? '' : 's'} still needed`}</p>
          {submitError && <p role="alert" className="verify-sheet__error"><AlertCircle size={16} aria-hidden="true" /> {submitError}</p>}
          <button type="button" className="aid-primary-button" disabled={!readiness.canSubmit || isSubmitting} onClick={() => void handleSubmit()}>
            {isSubmitting ? 'Submitting…' : 'Submit for review'}
          </button>
        </footer>
      )}

      {activeType && <UploadSheet type={activeType} onClose={() => setActiveType(null)} />}
    </div>
  )
}
