/**
 * Driver verification — individual providers upload four documents, submit
 * for review, and follow the admin decision. All rules are enforced by the
 * server (server/verification.js); this screen mirrors them for guidance.
 * Design system: status card, documents and vehicle as one list with status chips, the upload in
 * the one bottom-sheet style, Submit pinned in the thumb zone. F5: skeleton while loading, an
 * error with Try again.
 */

import { useCallback, useEffect, useId, useState } from 'react'
import { AlertCircle, Camera, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileText, Lock, ShieldAlert, ShieldCheck, Truck } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useDriverStore } from '../../store/useDriverStore'
import { documentService, DOCUMENT_REQUIREMENTS, REQUIRED_DOCUMENT_TYPES } from '../../services/documents'
import type { Driver, DriverDocument, DriverDocumentType, DriverVerification } from '../../types'
import { driverVehicleSummary, equipmentLabel, vehicleComplete } from '../../lib/driverVehicle'
import { formatCalendarDate } from '../../lib/dates'
import BottomSheet from '../../components/ui/BottomSheet'
import Button from '../../components/ui/Button'
import SectionHeader from '../../components/ui/SectionHeader'
import { Skeleton, SkeletonRows } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/States'
import StickyActionBar from '../../components/ui/StickyActionBar'

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
  const view = (() => {
    switch (verification.status) {
      case 'under_review':
        return { tone: 'progress', Icon: Clock3, title: 'Your application is under review', text: 'We review applications in the order received and will update this screen when a decision is made.' }
      case 'verified':
        return {
          tone: 'success', Icon: ShieldCheck, title: "You're verified",
          text: verification.credentialsValidUntil ? `Eligible to drive through ${formatDate(verification.credentialsValidUntil)}. Upload renewals before then to keep driving.` : 'Your documents are approved.',
        }
      case 'rejected':
        return { tone: 'danger', Icon: AlertCircle, title: 'Changes needed', text: verification.reviewNotes || 'Some documents need to be replaced before we can approve you.' }
      case 'suspended':
        return { tone: 'danger', Icon: ShieldAlert, title: 'Your account is suspended', text: verification.reviewNotes || 'Contact AID support for details.' }
      default:
        return { tone: 'neutral', Icon: ShieldCheck, title: 'Become a verified driver', text: 'Upload the four documents below, then submit them for review. Customers only see verified drivers.' }
    }
  })()
  const { Icon } = view
  return (
    <header className={`verify-hero is-${view.tone}`}>
      <span className="verify-hero__icon" aria-hidden="true"><Icon size={22} /></span>
      <h1>{view.title}</h1>
      <p>{view.text}</p>
    </header>
  )
}

function UploadSheet({ type, onClose }: { type: DriverDocumentType; onClose: () => void }) {
  const requirement = DOCUMENT_REQUIREMENTS[type]
  const uploadVerificationDocument = useDriverStore((state) => state.uploadVerificationDocument)
  const [expiresOn, setExpiresOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const titleId = useId()
  const dateId = useId()

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
    <BottomSheet title={requirement.label} titleId={titleId} subtitle={requirement.hint} className="verify-sheet" dismissible={!isUploading} onClose={onClose}
      footer={(
        <>
          {error && <p role="alert" className="ui-alert ui-alert--danger"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
          <Button block size="lg" icon={<Camera size={18} aria-hidden="true" />} loading={isUploading} loadingLabel="Uploading…" onClick={() => void choose('photo')}>Choose photo</Button>
          <Button variant="secondary" block icon={<FileText size={18} aria-hidden="true" />} disabled={isUploading} onClick={() => void choose('pdf')}>Choose PDF</Button>
        </>
      )}>
      {requirement.requiresExpiration && (
        <label className="ui-field" htmlFor={dateId}>
          <span>Expiration date</span>
          <input id={dateId} className="ui-input" type="date" min={tomorrowIso()} value={expiresOn} disabled={isUploading} onChange={(event) => setExpiresOn(event.target.value)} />
        </label>
      )}
      <p className="verify-sheet__privacy"><Lock size={14} aria-hidden="true" /> Stored privately. Only the AID review team sees your documents.</p>
    </BottomSheet>
  )
}

function DocIcon({ tone, Fallback }: { tone: ChipTone; Fallback: typeof FileText }) {
  return (
    <span className={`ui-row__icon verify-icon is-${tone}`} aria-hidden="true">
      {tone === 'success' ? <CheckCircle2 size={20} /> : tone === 'danger' ? <AlertCircle size={20} /> : <Fallback size={20} />}
    </span>
  )
}

export default function DriverOnboardingScreen({ onComplete, onOpenVehicle }: DriverOnboardingScreenProps) {
  const { verification, fetchVerification, submitVerification } = useDriverStore()
  const user = useAuthStore((state) => state.user) as Driver | null
  const [activeType, setActiveType] = useState<DriverDocumentType | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [load, setLoad] = useState<'loading' | 'error' | 'ready'>('loading')

  const reload = useCallback(async () => {
    setLoad('loading')
    setLoad((await fetchVerification()) ? 'ready' : 'error')
  }, [fetchVerification])
  useEffect(() => { void reload() }, [reload])

  const back = <button type="button" className="ui-back" onClick={onComplete}><ChevronLeft size={22} aria-hidden="true" /> Back to work</button>

  if (!verification) {
    return (
      <div className="ui-screen driver-form safe-top">
        {back}
        <h1 className="sr-only">Driver verification</h1>
        {load === 'error' ? (
          <ErrorState title="Couldn't load your verification" body={useDriverStore.getState().error || 'Check your connection and try again.'} onRetry={() => void reload()} />
        ) : (
          <div className="verify-loading" role="status" aria-label="Loading your verification">
            <Skeleton height={132} radius={16} />
            <Skeleton width={120} height={16} />
            <SkeletonRows count={4} label="Loading your documents" />
          </div>
        )}
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
  const done = REQUIRED_DOCUMENT_TYPES.length - outstanding
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
    <div className="ui-screen driver-form safe-top">
      {back}
      <StatusHeader verification={verification} />

      <section className="ui-section" aria-labelledby="documents-title">
        <SectionHeader id="documents-title" title="Documents">
          <span className="ui-chip" aria-label={`${Math.max(0, done)} of ${REQUIRED_DOCUMENT_TYPES.length} ready`}>{Math.max(0, done)} of {REQUIRED_DOCUMENT_TYPES.length}</span>
        </SectionHeader>
        <ul className="ui-list verify-docs">
          {REQUIRED_DOCUMENT_TYPES.map((type) => {
            const document = latest[type]
            const state = documentState(document, verification.status)
            const requirement = DOCUMENT_REQUIREMENTS[type]
            return (
              <li key={type}>
                <button type="button" className="ui-row verify-row" onClick={() => setActiveType(type)} aria-haspopup="dialog">
                  <DocIcon tone={state.tone} Fallback={FileText} />
                  <span className="ui-row__text">
                    <strong>{requirement.label}</strong>
                    <small>
                      <span className={`verify-state is-${state.tone}`}>{state.label}</span>
                      {document?.expiresOn ? ` · Expires ${formatDate(document.expiresOn)}` : document ? ` · ${document.fileName}` : ''}
                    </small>
                    {document?.status === 'rejected' && document.reviewNotes && <em>{document.reviewNotes}</em>}
                  </span>
                  <ChevronRight className="ui-row__chevron" size={18} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="ui-section" aria-labelledby="vehicle-title">
        <SectionHeader id="vehicle-title" title="Service vehicle" />
        <div className="ui-list">
          <button type="button" className="ui-row verify-row" onClick={onOpenVehicle}>
            <DocIcon tone={vehicleState.tone} Fallback={Truck} />
            <span className="ui-row__text">
              <strong>Vehicle &amp; equipment</strong>
              <small>
                <span className={`verify-state is-${vehicleState.tone}`}>{vehicleState.label}</span>
                {' · '}<span>{vehicleSummary ? `${vehicleSummary}${equipment ? ` · ${equipment}` : ''}` : 'Required to go online'}</span>
              </small>
            </span>
            <ChevronRight className="ui-row__chevron" size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      {canApply && (
        <StickyActionBar hint={readiness.canSubmit ? 'All documents uploaded. Submit when ready.' : `${outstanding} document${outstanding === 1 ? '' : 's'} still needed`}>
          {submitError && <p role="alert" className="ui-alert ui-alert--danger"><AlertCircle size={16} aria-hidden="true" /> {submitError}</p>}
          <Button block size="lg" disabled={!readiness.canSubmit} loading={isSubmitting} loadingLabel="Submitting…" onClick={() => void handleSubmit()}>
            Submit for review
          </Button>
        </StickyActionBar>
      )}

      {activeType && <UploadSheet type={activeType} onClose={() => setActiveType(null)} />}
    </div>
  )
}
