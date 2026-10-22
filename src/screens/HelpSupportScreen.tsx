/**
 * B18 Help & Support for customers (Account) and drivers (Settings): report a problem, follow your
 * reports, short FAQ about how AID works today, Safety / 911. A support email or phone appears only
 * when the server has one configured (SUPPORT_EMAIL / SUPPORT_PHONE) — none is invented here.
 */

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ChevronDown, ChevronRight, Mail, MessageSquareWarning, Phone, RefreshCw } from 'lucide-react'
import { apiService } from '../services/api'
import ReportProblemForm, { type ReportableJob } from '../components/support/ReportProblemForm'
import { SafetyMenuItem } from '../components/safety/Safety'
import { FAQ, REPORT_STATUS_LABELS, type SupportAudience, type SupportConfig, type SupportReport } from '../lib/support'

const shortDate = (value: string | Date) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function ReportSheet({ audience, jobs, onSent, onClose }: { audience: SupportAudience; jobs: ReportableJob[]; onSent: () => void; onClose: () => void }) {
  return createPortal(
    <div className="account-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="account-sheet" role="dialog" aria-modal="true" aria-labelledby="report-problem-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-sheet__handle" />
        <ReportProblemForm audience={audience} jobs={jobs} titleId="report-problem-title" onSent={onSent} onClose={onClose} closeLabel="Cancel" />
      </section>
    </div>,
    document.body,
  )
}

export function MyReports({ reports, error, onRetry }: { reports: SupportReport[] | null; error: string | null; onRetry: () => void }) {
  if (error) {
    return (
      <div className="support-empty" role="alert">
        <p>{error}</p>
        <button type="button" className="support-retry" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Try again</button>
      </div>
    )
  }
  if (!reports) return <p className="support-empty" role="status">Loading your reports…</p>
  if (reports.length === 0) return <p className="support-empty">No reports yet. Anything you report shows up here with its status.</p>
  return (
    <ul className="support-reports" aria-label="My reports">
      {reports.map((report) => (
        <li key={report.id} className="support-report">
          <div className="support-report__top">
            <strong>{report.categoryLabel}</strong>
            <span className={`support-status support-status--${report.status}`}>{REPORT_STATUS_LABELS[report.status]}</span>
          </div>
          <small>
            Sent {shortDate(report.createdAt)}
            {report.booking ? ` · ${report.booking.serviceName} job` : ''}
            {report.resolvedAt ? ` · Resolved ${shortDate(report.resolvedAt)}` : ''}
          </small>
          {report.message && <p>{report.message}</p>}
        </li>
      ))}
    </ul>
  )
}

export default function HelpSupportScreen({ audience, onBack }: { audience: SupportAudience; onBack: () => void }) {
  const [config, setConfig] = useState<SupportConfig | null>(null)
  const [reports, setReports] = useState<SupportReport[] | null>(null)
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<ReportableJob[]>([])
  const [reporting, setReporting] = useState(false)

  const loadReports = useCallback(async () => {
    setReportsError(null)
    const result = await apiService.listSupportReports()
    if (result.success && result.data) setReports(result.data)
    else setReportsError(result.error || 'Unable to load your reports.')
  }, [])

  useEffect(() => {
    void loadReports()
    void apiService.getSupportConfig().then((result) => { if (result.success && result.data) setConfig(result.data) })
    void apiService.listBookings().then((result) => {
      if (!result.success || !result.data) return
      setJobs([...result.data]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10)
        .map((booking) => ({ id: booking.id, label: `${booking.service.name} · ${shortDate(booking.createdAt)} · ${booking.status.replace('_', ' ')}` })))
    })
  }, [loadReports])

  const email = config?.contact.email
  const phone = config?.contact.phone

  return (
    <div className="account-screen support-screen">
      <button type="button" className="support-back" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" /> Back</button>
      <header className="account-header"><p>{audience === 'driver' ? 'For AID drivers' : 'Questions and problems'}</p><h1>Help &amp; Support</h1></header>

      <section className="account-section" aria-labelledby="support-report-title">
        <div className="account-section__heading"><div><p>SOMETHING WRONG?</p><h2 id="support-report-title">Report a problem</h2></div></div>
        <div className="account-menu">
          <button type="button" aria-haspopup="dialog" onClick={() => setReporting(true)}>
            <span className="account-menu__icon"><MessageSquareWarning size={20} aria-hidden="true" /></span>
            <span><strong>Report a problem</strong><small>About a job, a payment, the app or anything else</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <SafetyMenuItem audience={audience} />
          {email && (
            <a href={`mailto:${email}`}>
              <span className="account-menu__icon"><Mail size={20} aria-hidden="true" /></span>
              <span><strong>Email support</strong><small>{email}</small></span>
              <span aria-hidden="true" />
            </a>
          )}
          {phone && (
            <a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>
              <span className="account-menu__icon"><Phone size={20} aria-hidden="true" /></span>
              <span><strong>Call support</strong><small>{phone}</small></span>
              <span aria-hidden="true" />
            </a>
          )}
        </div>
      </section>

      <section className="account-section" aria-labelledby="support-mine-title">
        <div className="account-section__heading"><div><p>STATUS</p><h2 id="support-mine-title">My reports</h2></div></div>
        <MyReports reports={reports} error={reportsError} onRetry={() => void loadReports()} />
      </section>

      <section className="account-section" aria-labelledby="support-faq-title">
        <div className="account-section__heading"><div><p>HOW AID WORKS</p><h2 id="support-faq-title">Common questions</h2></div></div>
        <div className="support-faq">
          {FAQ[audience].map((item) => (
            <details key={item.q}>
              <summary><span>{item.q}</span><ChevronDown size={17} aria-hidden="true" /></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {reporting && <ReportSheet audience={audience} jobs={jobs} onSent={() => void loadReports()} onClose={() => setReporting(false)} />}
    </div>
  )
}
