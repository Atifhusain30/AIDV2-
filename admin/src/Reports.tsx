/**
 * B18: the reports inbox — every problem customers and drivers report (Help & Support and "Report an
 * issue" on a job, including the B10 job reports copied in by the migration). Filter by status and
 * category, open one to see the linked job and both parties, move it open → in review → resolved and
 * add internal notes (never shown to the reporter). Safety reports are highlighted and listed first.
 */

import { useCallback, useEffect, useId, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, Check, Flag, MessageSquareText, RefreshCw } from 'lucide-react'
import { adminApi } from './api'
import type { ReportCategory, ReportChat, ReportCounts, ReportDetail, ReportFilter, ReportStatus, ReportSummary } from './types'

const STATUS_LABELS: Record<ReportStatus, string> = { open: 'Open', in_review: 'In review', resolved: 'Resolved' }
const FILTERS: { id: ReportFilter; label: string }[] = [
  { id: 'active', label: 'Needs attention' },
  { id: 'open', label: 'Open' },
  { id: 'in_review', label: 'In review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
]
// Mirrors server/support.js ADMIN_CATEGORY_LABELS.
export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  safety: 'Safety concern', driver_behaviour: 'Driver behaviour', customer_behaviour: 'Customer behaviour',
  vehicle_damage: 'Vehicle or equipment damage', pricing: 'Pricing or charge', payment: 'Payment or earnings',
  service_problem: 'Service not completed', app_problem: 'App problem', other: 'Other',
}
/** Mirrors server/support.js TRANSITIONS so only allowed moves are offered. */
export const REPORT_ACTIONS: Record<ReportStatus, { to: ReportStatus; label: string; tone: 'primary' | 'secondary' | 'success' }[]> = {
  open: [{ to: 'in_review', label: 'Start review', tone: 'primary' }, { to: 'resolved', label: 'Resolve', tone: 'success' }],
  in_review: [{ to: 'resolved', label: 'Resolve', tone: 'success' }, { to: 'open', label: 'Move back to open', tone: 'secondary' }],
  resolved: [{ to: 'in_review', label: 'Reopen', tone: 'secondary' }],
}
const BOOKING_STATUS: Record<string, string> = {
  pending: 'Pending', searching: 'Waiting for a driver', accepted: 'Accepted', en_route: 'On the way', arrived: 'Arrived',
  in_progress: 'In service', completed: 'Completed', cancelled: 'Cancelled', expired: 'Expired',
}

const dateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')
function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}
const countFor = (counts: ReportCounts | null, filter: ReportFilter) => {
  if (!counts) return null
  if (filter === 'active') return counts.open + counts.in_review
  if (filter === 'all') return counts.open + counts.in_review + counts.resolved
  return counts[filter]
}

function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <span className={`badge badge--report-${status}`}>{STATUS_LABELS[status]}</span>
}
function CategoryTag({ report }: { report: Pick<ReportSummary, 'category' | 'categoryLabel' | 'isSafety'> }) {
  return report.isSafety
    ? <span className="report-tag report-tag--safety"><AlertTriangle size={13} aria-hidden="true" />{report.categoryLabel}</span>
    : <span className="report-tag">{report.categoryLabel}</span>
}

// ---------- Detail ----------

function Party({ title, party }: { title: string; party: { name: string; email: string; phone: string } | null }) {
  return (
    <div className="report-party">
      <dt>{title}</dt>
      <dd>{party ? <><strong>{party.name}</strong><span className="muted">{[party.email, party.phone].filter(Boolean).join(' · ') || 'No contact on file'}</span></> : <span className="muted">None</span>}</dd>
    </div>
  )
}

/** B12: the chat between the job's customer and driver (admins see it here even after the apps stop showing it). */
function ReportChatCard({ reportId }: { reportId: string }) {
  const [chat, setChat] = useState<ReportChat | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    adminApi.getReportChat(reportId).then((result) => { if (live) setChat(result) }, (chatError) => { if (live) setError(errorText(chatError)) })
    return () => { live = false }
  }, [reportId])
  return (
    <div className="card">
      <h2>Chat on this job{chat ? ` (${chat.messages.length})` : ''}</h2>
      {error && <p className="muted">Couldn't load the chat: {error}</p>}
      {!chat && !error && <p className="muted" aria-busy="true">Loading chat…</p>}
      {chat && chat.blocks.length > 0 && (
        <ul className="report-chat__blocks">
          {chat.blocks.map((block) => (
            <li key={`${block.blockerRole}-${block.createdAt}`}>
              <Ban size={14} aria-hidden="true" /> {block.blockerName} ({block.blockerRole}) blocked the other person{block.sameJob ? ' on this job' : ' on another job'} · {dateTime(block.createdAt)}
            </li>
          ))}
        </ul>
      )}
      {chat && chat.messages.length === 0 && <p className="muted">No messages were sent on this job.</p>}
      {chat && chat.messages.length > 0 && (
        <ol className="report-chat" aria-label="Chat messages">
          {chat.messages.map((message) => (
            <li key={message.id} className={`report-chat__message report-chat__message--${message.senderRole}`}>
              <div className="report-chat__meta"><strong>{message.senderName}</strong> <span className="muted">({message.senderRole}) · {dateTime(message.createdAt)}{message.readAt ? ' · read' : ''}</span></div>
              <p>{message.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function ReportView({ reportId, onBack, onChanged, notify }: { reportId: string; onBack: () => void; onChanged: () => void; notify: (text: string) => void }) {
  const [report, setReport] = useState<ReportDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteId = useId()
  const titleId = useId()

  const load = useCallback(async () => {
    try {
      setReport(await adminApi.getReport(reportId))
      setLoadError(null)
    } catch (detailError) {
      setLoadError(errorText(detailError))
    }
  }, [reportId])
  useEffect(() => { setReport(null); void load() }, [load])

  const update = async (change: { status?: ReportStatus; note?: string }, done: string) => {
    setBusy(true)
    setError(null)
    try {
      setReport(await adminApi.updateReport(reportId, change))
      if (change.note) setNote('')
      notify(done)
      onChanged()
    } catch (updateError) {
      setError(errorText(updateError))
      void load()
    } finally {
      setBusy(false)
    }
  }

  const back = <button type="button" className="btn btn--ghost" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back to reports</button>
  if (loadError) return <div className="page">{back}<p role="alert" className="alert">{loadError}</p></div>
  if (!report) return <div className="page">{back}<div className="skeleton" aria-busy="true">Loading report…</div></div>

  const job = report.booking
  return (
    <section className="page" role="region" aria-labelledby={titleId}>
      <div className="page__nav">{back}</div>
      <header className={`report-head${report.isSafety ? ' report-head--safety' : ''}`}>
        <div className="profile__title">
          <h1 id={titleId}>{report.categoryLabel}</h1>
          <ReportStatusBadge status={report.status} />
          {report.isSafety && <span className="report-tag report-tag--safety"><AlertTriangle size={13} aria-hidden="true" />Safety</span>}
        </div>
        <p className="muted">
          From {report.reporterName} ({report.reporterRole}) · received {dateTime(report.createdAt)}
          {report.fromJobIssue ? ' · job issue report from before the inbox existed' : ''}
        </p>
      </header>
      {report.isSafety && report.status !== 'resolved' && (
        <p className="alert alert--safety">Safety report. AID does not contact emergency services; if someone may be in danger now, reach the reporter directly and tell them to call 911.</p>
      )}

      <div className="review">
        <div className="review__main report-main">
          <div className="card">
            <h2>Message</h2>
            {report.message ? <p className="report-message">{report.message}</p> : <p className="muted">No message — only the category was chosen.</p>}
          </div>

          <div className="card">
            <h2>Linked job</h2>
            {job ? (
              <dl className="report-facts">
                <div><dt>Service</dt><dd>{job.serviceName}</dd></div>
                <div><dt>Status now</dt><dd>{BOOKING_STATUS[job.status] || job.status}</dd></div>
                {job.statusWhenReported && <div><dt>When reported</dt><dd>{BOOKING_STATUS[job.statusWhenReported] || job.statusWhenReported}</dd></div>}
                <div><dt>Requested</dt><dd>{dateTime(job.createdAt)}</dd></div>
                {job.price != null && <div><dt>Price</dt><dd>${job.price.toFixed(2)}</dd></div>}
                <div className="report-facts__wide"><dt>Pickup</dt><dd>{job.address}</dd></div>
                {job.dropoffAddress && <div className="report-facts__wide"><dt>Drop-off</dt><dd>{job.dropoffAddress}</dd></div>}
                <Party title="Customer" party={job.customer} />
                <Party title="Driver" party={job.driver} />
                <div className="report-facts__wide"><dt>Job ID</dt><dd><code>{job.id}</code></dd></div>
              </dl>
            ) : <p className="muted">Not about a specific job.</p>}
          </div>
          {job && <ReportChatCard reportId={report.id} />}
        </div>

        <aside className="review__side">
          <div className="card">
            <h2>Triage</h2>
            <div className="decision-actions">
              {REPORT_ACTIONS[report.status].map((action) => (
                <button key={action.to} type="button" className={`btn btn--${action.tone} btn--block`} disabled={busy}
                  onClick={() => void update({ status: action.to }, `Report ${action.to === 'resolved' ? 'resolved' : action.to === 'in_review' ? (report.status === 'resolved' ? 'reopened' : 'in review') : 'moved back to open'}`)}>
                  {action.to === 'resolved' && <Check size={16} aria-hidden="true" />}{action.label}
                </button>
              ))}
            </div>
            {report.resolvedAt && <p className="hint">Resolved {dateTime(report.resolvedAt)}{report.resolvedBy ? ` by ${report.resolvedBy.name}` : ''}.</p>}
            <div className="reason report-note">
              <label htmlFor={noteId}>Internal note (only admins see this)</label>
              <textarea id={noteId} rows={3} maxLength={2000} value={note} placeholder="What you checked, who you contacted, what was decided" onChange={(event) => setNote(event.target.value)} />
              <button type="button" className="btn btn--secondary" disabled={busy || !note.trim()} onClick={() => void update({ note: note.trim() }, 'Note added')}>
                <MessageSquareText size={16} aria-hidden="true" />Add note
              </button>
            </div>
            {error && <p role="alert" className="alert">{error}</p>}
          </div>

          <div className="card">
            <h2>Reporter</h2>
            {report.reporter ? (
              <dl className="report-facts report-facts--stack">
                <Party title={report.reporter.role === 'driver' ? 'Driver' : 'Customer'} party={report.reporter} />
                <div><dt>Other reports</dt><dd>{report.reporter.otherReports}</dd></div>
              </dl>
            ) : <p className="muted">This account was deleted.</p>}
          </div>

          <div className="card">
            <h2>Activity</h2>
            {report.events.length === 0 ? <p className="muted">No activity yet.</p> : (
              <ol className="timeline">
                {report.events.map((event) => (
                  <li key={event.id} className={`timeline__item timeline__item--report-${event.toStatus || 'note'}`}>
                    <span className="timeline__dot" aria-hidden="true" />
                    <div>
                      <strong>{event.action === 'note_added' ? 'Note' : `${STATUS_LABELS[event.fromStatus || 'open']} → ${STATUS_LABELS[event.toStatus || 'open']}`}</strong>
                      <span className="muted"> · {event.actor?.name || 'Admin'} · {dateTime(event.createdAt)}</span>
                      {event.note && <p>{event.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

// ---------- Inbox ----------

export default function ReportsInbox({ notify, onCounts }: { notify: (text: string) => void; onCounts: (counts: ReportCounts) => void }) {
  const [filter, setFilter] = useState<ReportFilter>('active')
  const [category, setCategory] = useState<ReportCategory | ''>('')
  const [reports, setReports] = useState<ReportSummary[] | null>(null)
  const [counts, setCounts] = useState<ReportCounts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const categoryId = useId()

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await adminApi.listReports(filter, category)
      setReports(result.reports)
      setCounts(result.counts)
      onCounts(result.counts)
      setError(null)
    } catch (listError) {
      setError(errorText(listError))
    } finally {
      setRefreshing(false)
    }
  }, [filter, category, onCounts])
  useEffect(() => { setReports(null); void refresh() }, [refresh])

  if (selected) return <ReportView reportId={selected} onBack={() => setSelected(null)} onChanged={() => void refresh()} notify={notify} />

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Reports</h1>
          <p className="muted">Problems customers and drivers reported in the app. Safety reports are listed first.</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'spin' : undefined} aria-hidden="true" />Refresh</button>
      </header>

      {counts && counts.safetyActive > 0 && (
        <p className="alert alert--safety" role="status"><AlertTriangle size={15} aria-hidden="true" /> {counts.safetyActive} safety report{counts.safetyActive === 1 ? '' : 's'} not yet resolved.</p>
      )}

      <div className="card card--flush">
        <div className="toolbar">
          <div role="tablist" aria-label="Report status" className="tabs">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className="tab" onClick={() => setFilter(item.id)}>
                {item.label}{countFor(counts, item.id) != null && <span className="tab__count">{countFor(counts, item.id)}</span>}
              </button>
            ))}
          </div>
          <label className="select-field" htmlFor={categoryId}>
            <span className="sr-only">Category</span>
            <select id={categoryId} value={category} onChange={(event) => setCategory(event.target.value as ReportCategory | '')}>
              <option value="">All categories</option>
              {(Object.keys(CATEGORY_LABELS) as ReportCategory[]).map((id) => <option key={id} value={id}>{CATEGORY_LABELS[id]}</option>)}
            </select>
          </label>
        </div>

        {error && <p role="alert" className="alert alert--inset">{error}</p>}
        {reports === null && !error && <div className="skeleton" aria-busy="true">Loading reports…</div>}
        {reports?.length === 0 && (
          <div className="empty-state">
            <Flag size={28} aria-hidden="true" />
            <strong>{filter === 'active' && !category ? 'Nothing needs attention' : 'No reports here'}</strong>
            <span className="muted">{filter === 'active' && !category ? 'New reports from the apps will appear here.' : 'Try another status or category.'}</span>
          </div>
        )}
        {reports && reports.length > 0 && (
          <table className="table">
            <thead>
              <tr><th>Category</th><th>From</th><th>Message</th><th>Job</th><th>Status</th><th>Received</th><th aria-label="Open" /></tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className={report.isSafety && report.status !== 'resolved' ? 'row--safety' : undefined} onClick={() => setSelected(report.id)}>
                  <td>
                    <button type="button" className="report-open" aria-label={`Open ${report.categoryLabel} report from ${report.reporterName}`} onClick={(event) => { event.stopPropagation(); setSelected(report.id) }}>
                      <CategoryTag report={report} />
                    </button>
                  </td>
                  <td><span className="person__text"><strong>{report.reporterName}</strong><small>{report.reporterRole === 'driver' ? 'Driver' : 'Customer'}</small></span></td>
                  <td className="report-preview">{report.message || <span className="muted">No message</span>}</td>
                  <td>{report.booking ? report.booking.serviceName : <span className="muted">—</span>}</td>
                  <td><ReportStatusBadge status={report.status} /></td>
                  <td>{timeAgo(report.createdAt)}</td>
                  <td className="table__chevron" aria-hidden="true"><ArrowRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
