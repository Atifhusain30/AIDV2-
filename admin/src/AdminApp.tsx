import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { adminApi } from './api'
import type { AdminProfile, DriverDecision, DriverDetail, DriverSummary, QueueFilter, ReviewDocument, VerificationStatus } from './types'

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: 'needs_review', label: 'Needs review' },
  { id: 'verified', label: 'Verified' },
  { id: 'expiring', label: 'Expiring soon' },
  { id: 'rejected', label: 'Changes requested' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'all', label: 'All drivers' },
]

const DOC_LABELS: Record<ReviewDocument['type'], string> = {
  drivers_license: "Driver's license",
  identification: 'Government ID',
  insurance: 'Commercial auto insurance',
  vehicle_registration: 'Vehicle registration',
}

const STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: 'Not submitted',
  under_review: 'Under review',
  verified: 'Verified',
  rejected: 'Changes requested',
  suspended: 'Suspended',
}

/** Mirrors server/verification.js DRIVER_DECISIONS so only valid actions are offered. */
const DECISIONS: Record<DriverDecision, { label: string; from: VerificationStatus[]; needsReason: boolean; tone: 'primary' | 'danger' }> = {
  verify: { label: 'Verify driver', from: ['under_review', 'rejected', 'pending'], needsReason: false, tone: 'primary' },
  reinstate: { label: 'Reinstate', from: ['suspended'], needsReason: false, tone: 'primary' },
  reject: { label: 'Request changes', from: ['pending', 'under_review', 'verified'], needsReason: true, tone: 'danger' },
  suspend: { label: 'Suspend', from: ['verified', 'under_review'], needsReason: true, tone: 'danger' },
}

const name = (person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}`.trim() || 'Unnamed driver'
const dateOnly = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

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
        <p className="eyebrow">AID ADMIN</p>
        <h1>Driver review</h1>
        <label>Email<input name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  )
}

function DocumentCard({ document, onReview }: { document: ReviewDocument; onReview: (decision: 'approve' | 'reject', notes?: string) => Promise<void> }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reasonId = useId()
  const label = DOC_LABELS[document.type]
  const expired = Boolean(document.expiresOn && document.expiresOn <= new Date().toISOString().slice(0, 10))

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
    <article className="doc" aria-label={label}>
      <div className="doc__preview">
        {document.fileUrl
          ? document.mimeType.startsWith('image/') && document.mimeType !== 'image/heic'
            ? <a href={document.fileUrl} target="_blank" rel="noreferrer"><img src={document.fileUrl} alt={`${label} upload`} /></a>
            : <a href={document.fileUrl} target="_blank" rel="noreferrer" className="doc__file">Open {document.mimeType === 'application/pdf' ? 'PDF' : 'file'}</a>
          : <span className="doc__file">Preview unavailable</span>}
      </div>
      <div className="doc__body">
        <header>
          <h3>{label}</h3>
          <span className={`chip chip--${document.status}`}>{document.status === 'pending' ? 'Pending' : document.status === 'approved' ? 'Approved' : 'Rejected'}</span>
        </header>
        <dl>
          <dt>Expires</dt><dd className={expired ? 'danger' : undefined}>{document.expiresOn ? `${dateOnly(document.expiresOn)}${expired ? ' (expired)' : ''}` : 'No expiration'}</dd>
          <dt>Uploaded</dt><dd>{dateTime(document.uploadedAt)}</dd>
          <dt>File</dt><dd>{document.fileName}</dd>
        </dl>
        {document.reviewNotes && <p className="note">Reviewer note: {document.reviewNotes}</p>}
        {rejecting ? (
          <div className="reason">
            <label htmlFor={reasonId}>Reason (shown to the driver)</label>
            <textarea id={reasonId} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="row">
              <button type="button" className="btn btn--danger" disabled={busy || !reason.trim()} onClick={() => void run('reject')}>Confirm rejection</button>
              <button type="button" className="btn" disabled={busy} onClick={() => setRejecting(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn btn--primary" disabled={busy || document.status === 'approved' || expired} onClick={() => void run('approve')}>Approve</button>
            <button type="button" className="btn" disabled={busy || document.status === 'rejected'} onClick={() => setRejecting(true)}>Reject</button>
          </div>
        )}
        {error && <p role="alert" className="error">{error}</p>}
      </div>
    </article>
  )
}

function DriverPanel({ driverId, onChanged }: { driverId: string; onChanged: () => void }) {
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

  if (loadError) return <section className="panel"><p role="alert" className="error">{loadError}</p></section>
  if (!detail) return <section className="panel"><p className="muted">Loading driver…</p></section>

  const { driver, documents, events, readiness } = detail
  const status = driver.verificationStatus
  const outstanding = readiness.missing.length + readiness.rejected.length + readiness.unapproved.length + readiness.expired.length
  const available = (Object.keys(DECISIONS) as DriverDecision[]).filter((decision) => DECISIONS[decision].from.includes(status))

  const reviewDocument = async (documentId: string, decision: 'approve' | 'reject', notes?: string) => {
    await adminApi.reviewDocument(documentId, decision, notes)
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
      await load()
      onChanged()
    } catch (decisionError) {
      setError(message(decisionError))
    } finally {
      setBusy(false)
    }
  }

  // Newest upload per type is the one under review; older uploads are history.
  const latest = new Map<string, ReviewDocument>()
  for (const document of documents) {
    const current = latest.get(document.type)
    if (!current || document.uploadedAt > current.uploadedAt) latest.set(document.type, document)
  }

  return (
    <section className="panel" role="region" aria-labelledby={titleId}>
      <header className="panel__header">
        <div>
          <h2 id={titleId}>{name(driver)}</h2>
          <p className="muted">{driver.email} · {driver.phone || 'No phone'} · joined {dateOnly(driver.createdAt)}</p>
        </div>
        <span className={`chip chip--${status}`}>{STATUS_LABELS[status]}</span>
      </header>

      {driver.reviewNotes && <p className="note">Last decision note: {driver.reviewNotes}</p>}
      {driver.credentialsValidUntil && <p className="muted">Eligible to drive through {dateOnly(driver.credentialsValidUntil)}</p>}

      <h3 className="section-title">Documents</h3>
      {readiness.missing.length > 0 && <p className="note">Not uploaded yet: {readiness.missing.map((type) => DOC_LABELS[type]).join(', ')}</p>}
      <div className="docs">
        {[...latest.values()].map((document) => (
          <DocumentCard key={document.id} document={document} onReview={(decision, notes) => reviewDocument(document.id, decision, notes)} />
        ))}
      </div>

      <h3 className="section-title">Decision</h3>
      {available.includes('verify') && !readiness.canVerify && (
        <p className="muted">{outstanding} document{outstanding === 1 ? '' : 's'} not yet approved. Approve every document to verify this driver.</p>
      )}
      {pending ? (
        <div className="reason">
          <label htmlFor={reasonId}>Reason (shown to the driver)</label>
          <textarea id={reasonId} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="row">
            <button type="button" className="btn btn--danger" disabled={busy || !reason.trim()} onClick={() => void decide(pending)}>Confirm {DECISIONS[pending].label.toLowerCase()}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row">
          {available.map((decision) => {
            const rule = DECISIONS[decision]
            const blocked = (decision === 'verify' || decision === 'reinstate') && !readiness.canVerify
            return (
              <button
                key={decision}
                type="button"
                className={`btn btn--${rule.tone}`}
                disabled={busy || blocked}
                onClick={() => (rule.needsReason ? setPending(decision) : void decide(decision))}
              >
                {rule.label}
              </button>
            )
          })}
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}

      <h3 className="section-title">History</h3>
      <ol className="history">
        {events.map((event) => (
          <li key={event.id}>
            <strong>{event.action.replace(/_/g, ' ')}</strong>
            <span className="muted"> · {event.actor?.name || 'System'} · {dateTime(event.createdAt)}</span>
            {event.notes && <p>{event.notes}</p>}
          </li>
        ))}
        {events.length === 0 && <li className="muted">No activity yet.</li>}
      </ol>
    </section>
  )
}

function Dashboard({ admin, onSignOut }: { admin: AdminProfile; onSignOut: () => void }) {
  const [filter, setFilter] = useState<QueueFilter>('needs_review')
  const [drivers, setDrivers] = useState<DriverSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setDrivers(await adminApi.listDrivers(filter))
      setError(null)
    } catch (listError) {
      setError(message(listError))
    }
  }, [filter])

  useEffect(() => {
    setDrivers(null)
    void refresh()
  }, [refresh])

  return (
    <div className="layout">
      <header className="topbar">
        <strong>AID Admin · Driver review</strong>
        <span className="muted">{admin.email}</span>
        <button type="button" className="btn" onClick={onSignOut}>Sign out</button>
      </header>
      <aside className="queue">
        <div role="tablist" aria-label="Driver filters" className="tabs">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className="tab" onClick={() => setFilter(item.id)}>{item.label}</button>
          ))}
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        {drivers === null && !error && <p className="muted">Loading…</p>}
        {drivers?.length === 0 && <p className="muted">No drivers here.</p>}
        <ul className="queue__list">
          {drivers?.map((driver) => (
            <li key={driver.id}>
              <button type="button" className={`queue__item${selected === driver.id ? ' is-selected' : ''}`} onClick={() => setSelected(driver.id)}>
                <span><strong>{name(driver)}</strong><small>{driver.email}</small></span>
                <span className="queue__meta">
                  <span className={`chip chip--${driver.verificationStatus}`}>{STATUS_LABELS[driver.verificationStatus]}</span>
                  {driver.pendingDocuments > 0 && <small>{driver.pendingDocuments} pending</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="detail">
        {selected ? <DriverPanel driverId={selected} onChanged={() => void refresh()} /> : <p className="muted empty">Select a driver to review.</p>}
      </main>
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
  }, [])

  if (checking) return <p className="muted empty">Loading…</p>
  if (!admin) return <SignIn onSignedIn={setAdmin} initialError={error} />
  return <Dashboard admin={admin} onSignOut={() => { void adminApi.signOut(); setAdmin(null) }} />
}
