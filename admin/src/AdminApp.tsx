import { useCallback, useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft, ArrowRight, Ban, CalendarClock, Check, ExternalLink, FileText, Flag, Inbox, LogOut,
  Maximize2, RefreshCw, Search, ShieldCheck, UserCheck, Users, X,
} from 'lucide-react'
import { adminApi } from './api'
import Dialog from '../../src/components/ui/Dialog'
import FilterTabs, { tabId } from './FilterTabs'
import ReportsInbox from './Reports'
import { EmptyState, LoadError, SkeletonDetail, SkeletonTable } from './ui'
import type { AdminProfile, DocumentType, DriverDecision, DriverDetail, DriverRatings, DriverSummary, QueueFilter, ReportCounts, ReviewDocument, ReviewEvent, VerificationStatus } from './types'

// ---------- Copy & rules ----------

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: 'needs_review', label: 'Needs review' },
  { id: 'expiring', label: 'Expiring soon' },
  { id: 'verified', label: 'Verified' },
  { id: 'rejected', label: 'Changes requested' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'all', label: 'All drivers' },
]

const DOC_ORDER: DocumentType[] = ['drivers_license', 'identification', 'insurance', 'vehicle_registration']
const DOC_LABELS: Record<DocumentType, string> = {
  drivers_license: "Driver's license",
  identification: 'Government ID',
  insurance: 'Commercial auto insurance',
  vehicle_registration: 'Vehicle registration',
}

const COMMON_REASONS = ['Photo is blurry or unreadable', 'Document is expired', "Name doesn't match the account", 'Wrong document uploaded']
const DOC_REASONS: Partial<Record<DocumentType, string[]>> = {
  insurance: ["Policy doesn't cover business use of the vehicle"],
  vehicle_registration: ["Vehicle doesn't match the registered vehicle"],
}

const STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: 'Not submitted',
  under_review: 'Under review',
  verified: 'Verified',
  rejected: 'Changes requested',
  suspended: 'Suspended',
}

/** Mirrors server/verification.js DRIVER_DECISIONS so only valid actions are offered. */
const DECISIONS: Record<DriverDecision, { label: string; past: string; from: VerificationStatus[]; needsReason: boolean; tone: 'primary' | 'danger' | 'secondary' }> = {
  verify: { label: 'Verify driver', past: 'verified', from: ['under_review', 'rejected', 'pending'], needsReason: false, tone: 'primary' },
  reinstate: { label: 'Reinstate', past: 'reinstated', from: ['suspended'], needsReason: false, tone: 'primary' },
  reject: { label: 'Request changes', past: 'sent back for changes', from: ['pending', 'under_review', 'verified'], needsReason: true, tone: 'secondary' },
  suspend: { label: 'Suspend', past: 'suspended', from: ['verified', 'under_review'], needsReason: true, tone: 'danger' },
}

const EVENT_LABELS: Record<string, string> = {
  submitted: 'Submitted application',
  document_approved: 'Approved a document',
  document_rejected: 'Rejected a document',
  verified: 'Verified driver',
  rejected: 'Requested changes',
  suspended: 'Suspended driver',
  reinstated: 'Reinstated driver',
}

// ---------- Helpers ----------

const fullName = (person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}`.trim() || 'Unnamed driver'
const initials = (person: { firstName: string; lastName: string }) => `${person.firstName[0] || ''}${person.lastName[0] || ''}`.toUpperCase() || '?'
const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)
const dateOnly = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** Same rules as server REVIEW_LIST_FILTERS, used for tab counts. */
function inFilter(driver: DriverSummary, filter: QueueFilter): boolean {
  switch (filter) {
    case 'needs_review': return driver.verificationStatus === 'under_review' || driver.pendingDocuments > 0
    case 'expiring': return driver.verificationStatus === 'verified' && Boolean(driver.credentialsValidUntil && driver.credentialsValidUntil.slice(0, 10) < isoDay(30))
    case 'all': return true
    default: return driver.verificationStatus === filter
  }
}

// ---------- Shared UI ----------

/** The AID mark ("A" + location dot) + "Admin", same glyph as the apps and the app icon (src/components/brand/AidBrand.tsx). */
function Brand() {
  return (
    <div className="brand">
      <span className="brand__mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" focusable="false">
          <path d="M8.6 25 L16 7.5 L23.4 25" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="19.4" r="2.3" fill="currentColor" />
        </svg>
      </span>
      <span className="brand__name">AID <span>Admin</span></span>
    </div>
  )
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  return <span className={`badge badge--${status}`}>{STATUS_LABELS[status]}</span>
}

/** A document's own review state — an uploaded document waiting for review is "To review", never "Not submitted". */
const DOC_STATUS_LABELS: Record<ReviewDocument['status'], string> = { pending: 'To review', approved: 'Approved', rejected: 'Rejected' }
function DocumentBadge({ status }: { status: ReviewDocument['status'] }) {
  return <span className={`badge badge--doc-${status}`}>{DOC_STATUS_LABELS[status]}</span>
}

/** Same accessible dialog as the apps (F4): focus trap, Escape, inert background, focus returns. */
function Modal({ title, onClose, children, wide = false, dismissible = true }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; dismissible?: boolean }) {
  const titleId = useId()
  return (
    <Dialog labelledBy={titleId} onClose={onClose} dismissible={dismissible} handle={false} backdropClassName="modal-backdrop" className={`modal${wide ? ' modal--wide' : ''}`}>
      <header className="modal__header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      {children}
    </Dialog>
  )
}

function ReasonField({ id, value, onChange, suggestions }: { id: string; value: string; onChange: (value: string) => void; suggestions: string[] }) {
  return (
    <div className="reason">
      <label htmlFor={id}>Reason (shown to the driver)</label>
      {suggestions.length > 0 && (
        <div className="reason__chips">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className={`reason-chip${value === suggestion ? ' is-active' : ''}`} onClick={() => onChange(suggestion)}>{suggestion}</button>
          ))}
        </div>
      )}
      <textarea id={id} rows={3} maxLength={500} placeholder="Explain what the driver needs to fix" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

// ---------- Sign in ----------

function SignIn({ onSignedIn, initialError }: { onSignedIn: (admin: AdminProfile) => void; initialError: string | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Read the fields directly: browser autofill (notably Safari) can skip React's change events.
    const form = new FormData(event.currentTarget)
    const typedEmail = String(form.get('email') || email).trim()
    const typedPassword = String(form.get('password') || password)
    if (!typedEmail || !typedPassword) {
      setError('Enter your admin email and password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSignedIn(await adminApi.signIn(typedEmail, typedPassword))
    } catch (signInError) {
      setError(message(signInError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="signin">
      <form noValidate onSubmit={(event) => void submit(event)} className="signin__card">
        <Brand />
        <div>
          <h1>Sign in</h1>
          <p className="muted">Review drivers and reports.</p>
        </div>
        <label className="field">Email<input name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Password<input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p role="alert" className="alert">{error}</p>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  )
}

// ---------- Documents ----------

function DocumentCard({ type, document, driverVerified, onReview }: { type: DocumentType; document?: ReviewDocument; driverVerified: boolean; onReview: (decision: 'approve' | 'reject', notes?: string) => Promise<void> }) {
  const [rejecting, setRejecting] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reasonId = useId()
  const label = DOC_LABELS[type]

  if (!document) {
    return (
      <article className="doc doc--missing" aria-label={label}>
        <div className="doc__preview"><FileText size={28} aria-hidden="true" /></div>
        <div className="doc__body"><h3>{label}</h3><p className="muted">Not uploaded yet</p></div>
      </article>
    )
  }

  const expired = Boolean(document.expiresOn && document.expiresOn <= isoDay())
  const expiringSoon = !expired && Boolean(document.expiresOn && document.expiresOn < isoDay(30))
  const isImage = document.mimeType.startsWith('image/') && document.mimeType !== 'image/heic'

  const run = async (decision: 'approve' | 'reject') => {
    setBusy(true)
    setError(null)
    try {
      await onReview(decision, decision === 'reject' ? reason.trim() : undefined)
      setRejecting(false)
      setReason('')
    } catch (reviewError) {
      setError(message(reviewError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={`doc doc--${document.status}`} aria-label={label}>
      <div className="doc__preview">
        {document.fileUrl && isImage ? (
          <button type="button" className="doc__thumb" aria-label={`Enlarge ${label}`} onClick={() => setViewing(true)}>
            <img src={document.fileUrl} alt="" />
            <span className="doc__zoom"><Maximize2 size={14} aria-hidden="true" /> Enlarge</span>
          </button>
        ) : document.fileUrl ? (
          <a className="doc__file" href={document.fileUrl} target="_blank" rel="noreferrer"><FileText size={26} aria-hidden="true" />Open {document.mimeType === 'application/pdf' ? 'PDF' : 'file'}<ExternalLink size={13} aria-hidden="true" /></a>
        ) : (
          <span className="doc__file muted">Preview unavailable</span>
        )}
      </div>

      <div className="doc__body">
        <header className="doc__header">
          <h3>{label}</h3>
          <DocumentBadge status={document.status} />
        </header>
        <dl className="doc__meta">
          <div><dt>Expires</dt><dd className={expired ? 'text-danger' : expiringSoon ? 'text-warn' : undefined}>{document.expiresOn ? `${dateOnly(document.expiresOn)}${expired ? ' · expired' : expiringSoon ? ' · soon' : ''}` : 'No expiration'}</dd></div>
          <div><dt>Uploaded</dt><dd>{dateTime(document.uploadedAt)}</dd></div>
        </dl>
        {document.reviewNotes && <p className="doc__note">“{document.reviewNotes}”</p>}

        {rejecting ? (
          <div className="doc__reject">
            {driverVerified && <p className="alert">This driver is verified. Rejecting this document takes them offline until they upload a replacement and you approve it.</p>}
            <ReasonField id={reasonId} value={reason} onChange={setReason} suggestions={[...(DOC_REASONS[type] || []), ...COMMON_REASONS]} />
            <div className="actions">
              <button type="button" className="btn btn--danger" disabled={busy || !reason.trim()} onClick={() => void run('reject')}>Confirm rejection</button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setRejecting(false); setReason('') }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="actions">
            {document.status !== 'approved' && (
              <button type="button" className="btn btn--success" disabled={busy || expired} onClick={() => void run('approve')}><Check size={16} aria-hidden="true" />Approve</button>
            )}
            {document.status !== 'rejected' && (
              <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setRejecting(true)}><X size={16} aria-hidden="true" />{document.status === 'approved' ? 'Revoke approval' : 'Reject'}</button>
            )}
            {document.status === 'rejected' && <span className="hint hint--inline">Waiting for the driver to upload a replacement.</span>}
          </div>
        )}
        {expired && document.status !== 'approved' && <p className="hint">Expired documents can't be approved. Reject it so the driver uploads a current one.</p>}
        {error && <p role="alert" className="alert">{error}</p>}
      </div>

      {viewing && document.fileUrl && (
        <Modal title={label} onClose={() => setViewing(false)} wide>
          <div className="viewer"><img src={document.fileUrl} alt={`${label} uploaded by the driver`} /></div>
          <div className="modal__footer"><a className="btn btn--ghost" href={document.fileUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden="true" />Open original</a></div>
        </Modal>
      )}
    </article>
  )
}

function Timeline({ events }: { events: ReviewEvent[] }) {
  if (events.length === 0) return <p className="muted">No activity yet.</p>
  return (
    <ol className="timeline">
      {events.map((event) => (
        <li key={event.id} className={`timeline__item timeline__item--${event.action}`}>
          <span className="timeline__dot" aria-hidden="true" />
          <div>
            <strong>{EVENT_LABELS[event.action] || event.action.replace(/_/g, ' ')}</strong>
            <span className="muted"> · {event.actor?.name || 'System'} · {dateTime(event.createdAt)}</span>
            {event.notes && <p>{event.notes}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

// B15: what customers said about this driver. Admins see the true average (customers see it only
// from 3 ratings) and recent low ratings with their private notes, which the driver never sees.
function RatingsCard({ ratings }: { ratings?: DriverRatings }) {
  if (!ratings) return null
  return (
    <div className="card">
      <h2>Customer ratings</h2>
      {ratings.count === 0 ? (
        <p className="muted">No ratings yet.</p>
      ) : (
        <p><strong>{ratings.average?.toFixed(2)}</strong> <span className="muted">average from {ratings.count} rating{ratings.count === 1 ? '' : 's'}</span></p>
      )}
      {ratings.recentLow.length > 0 && (
        <>
          <h3 className="small muted">Recent low ratings ({ratings.lowRatingMaxStars}★ or less)</h3>
          <ul className="timeline">
            {ratings.recentLow.map((item) => (
              <li key={`${item.bookingId}-${item.createdAt}`} className="timeline__item">
                <span className="timeline__dot" aria-hidden="true" />
                <div>
                  <strong aria-label={`${item.stars} out of 5 stars`}>{'★'.repeat(item.stars)}{'☆'.repeat(5 - item.stars)}</strong>
                  <span className="muted"> · {item.serviceName} · {item.raterFirstName || 'Customer'} · {dateTime(item.createdAt)}</span>
                  {item.comment ? <p>“{item.comment}”</p> : <p className="muted small">No note</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// ---------- Driver review ----------

function DriverReview({ driverId, nextDriverId, onNext, onBack, onChanged, notify }: {
  driverId: string
  nextDriverId: string | null
  onNext: (id: string) => void
  onBack: () => void
  onChanged: () => void
  notify: (text: string) => void
}) {
  const [detail, setDetail] = useState<DriverDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, setPending] = useState<DriverDecision | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reasonId = useId()
  const titleId = useId()

  const load = useCallback(async () => {
    try {
      setDetail(await adminApi.getDriver(driverId))
      setLoadError(null)
    } catch (detailError) {
      setLoadError(message(detailError))
    }
  }, [driverId])

  useEffect(() => {
    setDetail(null)
    setPending(null)
    setError(null)
    void load()
  }, [load])

  const latest = useMemo(() => {
    const byType = new Map<DocumentType, ReviewDocument>()
    for (const document of detail?.documents || []) {
      const current = byType.get(document.type)
      if (!current || document.uploadedAt > current.uploadedAt) byType.set(document.type, document)
    }
    return byType
  }, [detail])

  const back = <button type="button" className="btn btn--ghost" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back to queue</button>
  if (loadError) return <div className="page"><div className="page__nav">{back}</div><LoadError title="Couldn't load this driver" message={loadError} onRetry={() => void load()} /></div>
  if (!detail) return <div className="page"><div className="page__nav">{back}</div><SkeletonDetail label="Loading driver" /></div>

  const { driver, events, readiness } = detail
  const status = driver.verificationStatus
  const approved = DOC_ORDER.filter((type) => latest.get(type)?.status === 'approved').length
  const outstanding = readiness.missing.length + readiness.rejected.length + readiness.unapproved.length + readiness.expired.length
  const available = (Object.keys(DECISIONS) as DriverDecision[]).filter((decision) => DECISIONS[decision].from.includes(status))

  const reviewDocument = async (documentId: string, decision: 'approve' | 'reject', notes?: string) => {
    await adminApi.reviewDocument(documentId, decision, notes)
    notify(decision === 'approve' ? 'Document approved' : 'Document rejected — the driver will see your reason')
    await load()
    onChanged()
  }

  const decide = async (decision: DriverDecision) => {
    setBusy(true)
    setError(null)
    try {
      await adminApi.decide(driver.id, decision, DECISIONS[decision].needsReason ? reason.trim() : undefined)
      setPending(null)
      setReason('')
      notify(`${fullName(driver)} ${DECISIONS[decision].past}`)
      await load()
      onChanged()
    } catch (decisionError) {
      setPending(null)
      setError(message(decisionError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page" role="region" aria-labelledby={titleId}>
      <div className="page__nav">
        {back}
        {nextDriverId && <button type="button" className="btn btn--ghost" onClick={() => onNext(nextDriverId)}>Next driver<ArrowRight size={16} aria-hidden="true" /></button>}
      </div>

      <header className="profile">
        <span className="avatar avatar--lg" aria-hidden="true">{initials(driver)}</span>
        <div className="profile__text">
          <div className="profile__title"><h1 id={titleId}>{fullName(driver)}</h1><StatusBadge status={status} /></div>
          <p className="muted">{driver.email} · {driver.phone || 'No phone'} · Joined {dateOnly(driver.createdAt)}{driver.submittedAt ? ` · Submitted ${timeAgo(driver.submittedAt)}` : ''}</p>
        </div>
      </header>

      <div className="review">
        <div className="review__main">
          <div className="section-head">
            <h2>Documents</h2>
            <span className="muted">{approved} of 4 approved</span>
          </div>
          <div className="progress" aria-hidden="true"><span style={{ width: `${(approved / 4) * 100}%` }} /></div>
          <div className="docs">
            {DOC_ORDER.map((type) => {
              const document = latest.get(type)
              return <DocumentCard key={document?.id || type} type={type} document={document} driverVerified={status === 'verified'} onReview={(decision, notes) => reviewDocument(document!.id, decision, notes)} />
            })}
          </div>
        </div>

        <aside className="review__side">
          <div className="card">
            <h2>Decision</h2>
            {driver.reviewNotes && <p className="doc__note">Last note: “{driver.reviewNotes}”</p>}
            {driver.credentialsValidUntil && <p className="muted small"><CalendarClock size={14} aria-hidden="true" /> Eligible through {dateOnly(driver.credentialsValidUntil)}</p>}
            <ul className="checklist">
              {DOC_ORDER.map((type) => {
                const document = latest.get(type)
                const ok = document?.status === 'approved'
                return <li key={type} className={ok ? 'is-ok' : undefined}>{ok ? <Check size={14} aria-hidden="true" /> : <span className="checklist__dot" aria-hidden="true" />}{DOC_LABELS[type]}</li>
              })}
            </ul>
            {available.includes('verify') && !readiness.canVerify && (
              <p className="hint">{outstanding} document{outstanding === 1 ? '' : 's'} not yet approved. Approve every document to verify this driver.</p>
            )}
            <div className="decision-actions">
              {available.map((decision) => {
                const rule = DECISIONS[decision]
                const blocked = (decision === 'verify' || decision === 'reinstate') && !readiness.canVerify
                return (
                  <button
                    key={decision}
                    type="button"
                    className={`btn btn--${rule.tone} btn--block`}
                    disabled={busy || blocked}
                    onClick={() => (rule.needsReason ? setPending(decision) : void decide(decision))}
                  >
                    {decision === 'verify' || decision === 'reinstate' ? <UserCheck size={16} aria-hidden="true" /> : decision === 'suspend' ? <Ban size={16} aria-hidden="true" /> : null}
                    {rule.label}
                  </button>
                )
              })}
            </div>
            {error && <p role="alert" className="alert">{error}</p>}
          </div>

          <RatingsCard ratings={detail.ratings} />

          <div className="card">
            <h2>Activity</h2>
            <Timeline events={events} />
          </div>
        </aside>
      </div>

      {pending && (
        <Modal title={`${DECISIONS[pending].label}: ${fullName(driver)}`} dismissible={!busy} onClose={() => !busy && setPending(null)}>
          <p className="muted">
            {pending === 'suspend' ? 'The driver will be taken offline and cannot accept jobs until reinstated.' : 'The driver will be asked to fix their application and resubmit.'}
          </p>
          <ReasonField id={reasonId} value={reason} onChange={setReason} suggestions={[]} />
          <div className="modal__footer">
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
            <button type="button" className="btn btn--danger" disabled={busy || !reason.trim()} onClick={() => void decide(pending)}>Confirm {DECISIONS[pending].label.toLowerCase()}</button>
          </div>
        </Modal>
      )}
    </section>
  )
}

// ---------- Queue ----------

function Queue({ filter, setFilter, drivers, counts, error, search, setSearch, onOpen, onRefresh, refreshing }: {
  filter: QueueFilter
  setFilter: (filter: QueueFilter) => void
  drivers: DriverSummary[] | null
  counts: Record<QueueFilter, number> | null
  error: string | null
  search: string
  setSearch: (value: string) => void
  onOpen: (id: string) => void
  onRefresh: () => void
  refreshing: boolean
}) {
  const stats: { id: QueueFilter; label: string; icon: ReactNode; tone: string }[] = [
    { id: 'needs_review', label: 'Waiting for review', icon: <Inbox size={18} />, tone: 'warn' },
    { id: 'expiring', label: 'Expiring in 30 days', icon: <CalendarClock size={18} />, tone: 'warn' },
    { id: 'verified', label: 'Verified drivers', icon: <ShieldCheck size={18} />, tone: 'ok' },
    { id: 'suspended', label: 'Suspended', icon: <Ban size={18} />, tone: 'danger' },
  ]
  const panelId = useId()

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Driver verification</h1>
          <p className="muted">Review documents and approve drivers before they can take jobs.</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onRefresh} disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'spin' : undefined} aria-hidden="true" />Refresh</button>
      </header>

      <div className="stats">
        {stats.map((stat) => (
          <button key={stat.id} type="button" className={`stat stat--${stat.tone}${filter === stat.id ? ' is-active' : ''}`} onClick={() => setFilter(stat.id)}>
            <span className="stat__icon" aria-hidden="true">{stat.icon}</span>
            <span className="stat__value">{counts ? counts[stat.id] : '–'}</span>
            <span className="stat__label">{stat.label}</span>
          </button>
        ))}
      </div>

      <div className="card card--flush">
        <div className="toolbar">
          <FilterTabs label="Driver filters" tabs={FILTERS} value={filter} onChange={setFilter} panelId={panelId}
            count={(id) => counts && <span className="tab__count">{counts[id]}</span>} />
          <label className="search">
            <Search size={16} aria-hidden="true" />
            <input type="search" aria-label="Search drivers" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </div>

        <div role="tabpanel" id={panelId} aria-labelledby={tabId(panelId, filter)}>
        {error && drivers === null && <LoadError title="Couldn't load drivers" message={error} onRetry={onRefresh} retrying={refreshing} />}
        {error && drivers !== null && <p role="alert" className="alert alert--inset">Couldn't refresh: {error}</p>}
        {drivers === null && !error && <SkeletonTable rows={6} cols={6} label="Loading drivers" />}
        {drivers?.length === 0 && (
          <EmptyState
            icon={filter === 'needs_review' && !search ? <ShieldCheck size={22} /> : <Users size={22} />}
            title={search ? 'No drivers match your search' : filter === 'needs_review' ? 'All caught up' : 'No drivers here'}
            body={search ? 'Try a different name or email.' : filter === 'needs_review' ? 'New applications will appear here.' : 'Try another filter.'}
          />
        )}
        {drivers && drivers.length > 0 && (
          <table className="table">
            <caption className="sr-only">Drivers — {FILTERS.find((item) => item.id === filter)?.label}</caption>
            <thead>
              <tr><th scope="col">Driver</th><th scope="col">Status</th><th scope="col">Documents</th><th scope="col">Submitted</th><th scope="col">Eligible through</th><th scope="col"><span className="sr-only">Open</span></th></tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id} onClick={() => onOpen(driver.id)}>
                  <td>
                    <button type="button" className="person" onClick={(event) => { event.stopPropagation(); onOpen(driver.id) }}>
                      <span className="avatar" aria-hidden="true">{initials(driver)}</span>
                      <span className="person__text"><strong>{fullName(driver)}</strong><small>{driver.email}</small></span>
                    </button>
                  </td>
                  <td><StatusBadge status={driver.verificationStatus} /></td>
                  <td>{driver.pendingDocuments > 0 ? <span className="pending-count">{driver.pendingDocuments} to review</span> : <span className="muted">—</span>}</td>
                  <td>{timeAgo(driver.submittedAt)}</td>
                  <td>{driver.credentialsValidUntil ? dateOnly(driver.credentialsValidUntil) : <span className="muted">—</span>}</td>
                  <td className="table__chevron" aria-hidden="true"><ArrowRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </div>
    </div>
  )
}

// ---------- Shell ----------

function Dashboard({ admin, onSignOut }: { admin: AdminProfile; onSignOut: () => void }) {
  const [filter, setFilter] = useState<QueueFilter>('needs_review')
  const [drivers, setDrivers] = useState<DriverSummary[] | null>(null)
  const [everyone, setEveryone] = useState<DriverSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [section, setSection] = useState<'drivers' | 'reports'>('drivers')
  const [reportCounts, setReportCounts] = useState<ReportCounts | null>(null)

  // B18: the Reports badge (open + in review) is shown before the inbox is opened.
  useEffect(() => {
    adminApi.listReports('active').then((result) => setReportCounts(result.counts)).catch(() => {})
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [list, all] = await Promise.all([adminApi.listDrivers(filter), adminApi.listDrivers('all')])
      setDrivers(list)
      setEveryone(all)
      setError(null)
    } catch (listError) {
      setError(message(listError))
    } finally {
      setRefreshing(false)
    }
  }, [filter])

  useEffect(() => {
    setDrivers(null)
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const counts = useMemo(() => {
    if (!everyone) return null
    return Object.fromEntries(FILTERS.map((item) => [item.id, everyone.filter((driver) => inFilter(driver, item.id)).length])) as Record<QueueFilter, number>
  }, [everyone])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!drivers || !query) return drivers
    return drivers.filter((driver) => `${fullName(driver)} ${driver.email} ${driver.phone}`.toLowerCase().includes(query))
  }, [drivers, search])

  const nextDriverId = useMemo(() => {
    if (!selected || !visible) return null
    const index = visible.findIndex((driver) => driver.id === selected)
    return index >= 0 ? visible[index + 1]?.id ?? null : null
  }, [selected, visible])

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Admin">
        <Brand />
        <button type="button" className={`nav-item${section === 'drivers' ? ' is-active' : ''}`} aria-current={section === 'drivers' ? 'page' : undefined} onClick={() => { setSection('drivers'); setSelected(null) }}>
          <ShieldCheck size={18} aria-hidden="true" />Driver verification
          {counts && counts.needs_review > 0 && <span className="nav-item__count">{counts.needs_review}</span>}
        </button>
        <button type="button" className={`nav-item${section === 'reports' ? ' is-active' : ''}`} aria-current={section === 'reports' ? 'page' : undefined} onClick={() => setSection('reports')}>
          <Flag size={18} aria-hidden="true" />Reports
          {reportCounts && reportCounts.open + reportCounts.in_review > 0 && (
            <span className={`nav-item__count${reportCounts.safetyActive > 0 ? ' nav-item__count--safety' : ''}`} aria-label={`${reportCounts.open + reportCounts.in_review} need attention${reportCounts.safetyActive > 0 ? `, ${reportCounts.safetyActive} safety` : ''}`}>{reportCounts.open + reportCounts.in_review}</span>
          )}
        </button>
        <div className="sidebar__footer">
          <span className="avatar avatar--sm" aria-hidden="true">{initials(admin)}</span>
          <span className="sidebar__user"><strong>{fullName(admin)}</strong><small>{admin.email}</small></span>
          <button type="button" className="icon-btn icon-btn--dark" aria-label="Sign out" title="Sign out" onClick={onSignOut}><LogOut size={17} aria-hidden="true" /></button>
        </div>
      </nav>

      <main className="content">
        {section === 'reports' ? (
          <ReportsInbox notify={setToast} onCounts={setReportCounts} />
        ) : selected ? (
          <DriverReview
            driverId={selected}
            nextDriverId={nextDriverId}
            onNext={setSelected}
            onBack={() => setSelected(null)}
            onChanged={() => void refresh()}
            notify={setToast}
          />
        ) : (
          <Queue
            filter={filter}
            setFilter={(next) => { setFilter(next); setSearch('') }}
            drivers={visible}
            counts={counts}
            error={error}
            search={search}
            setSearch={setSearch}
            onOpen={setSelected}
            onRefresh={() => void refresh()}
            refreshing={refreshing}
          />
        )}
      </main>

      {toast && <div className="toast" role="status"><Check size={16} aria-hidden="true" />{toast}</div>}
    </div>
  )
}

export default function AdminApp() {
  const [admin, setAdmin] = useState<AdminProfile | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi.currentAdmin()
      .then(setAdmin)
      .catch((sessionError) => setError(message(sessionError)))
      .finally(() => setChecking(false))
    // E6: an expired or revoked session (401) signs the reviewer out and shows the sign-in screen.
    adminApi.onSessionEnded((reason) => { setAdmin(null); setError(reason) })
    return () => adminApi.onSessionEnded(null)
  }, [])

  if (checking) return <div className="boot">Loading…</div>
  if (!admin) return <SignIn onSignedIn={setAdmin} initialError={error} />
  return <Dashboard admin={admin} onSignOut={() => { void adminApi.signOut(); setError(null); setAdmin(null) }} />
}
