/**
 * B18 Help & Support for customers (Account) and drivers (Settings): report a problem, follow your
 * reports, short FAQ about how AID works today, Safety / 911. A support email or phone appears only
 * when the server has one configured (SUPPORT_EMAIL / SUPPORT_PHONE) — none is invented here.
 * F5: My reports shows a skeleton while loading, an error with Try again, and an honest empty state.
 */

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, Inbox, Mail, MessageSquareWarning, Phone } from 'lucide-react'
import { apiService } from '../services/api'
import ReportProblemSheet, { type ReportableJob } from '../components/support/ReportProblemForm'
import { SafetyMenuItem } from '../components/safety/Safety'
import { List, ListRow } from '../components/ui/ListRow'
import SectionHeader from '../components/ui/SectionHeader'
import { SkeletonRows } from '../components/ui/Skeleton'
import { EmptyState, ErrorState } from '../components/ui/States'
import { FAQ, REPORT_STATUS_LABELS, type SupportAudience, type SupportConfig, type SupportReport } from '../lib/support'

const shortDate = (value: string | Date) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const STATUS_TONE: Record<SupportReport['status'], string> = { open: 'brand', in_review: 'warning', resolved: 'success' }

export function MyReports({ reports, error, onRetry }: { reports: SupportReport[] | null; error: string | null; onRetry: () => void }) {
  if (error) return <ErrorState compact title="Couldn't load your reports" body={error} onRetry={onRetry} />
  if (!reports) return <SkeletonRows count={2} label="Loading your reports" />
  if (reports.length === 0) {
    return <EmptyState compact headingLevel={3} icon={<Inbox size={22} />} title="No reports yet" body="Anything you report shows up here with its status." />
  }
  return (
    <ul className="ui-list support-reports" aria-label="My reports">
      {reports.map((report) => (
        <li key={report.id} className="support-report">
          <div className="support-report__top">
            <strong>{report.categoryLabel}</strong>
            <span className={`ui-chip ui-chip--${STATUS_TONE[report.status] ?? 'brand'}`}>{REPORT_STATUS_LABELS[report.status]}</span>
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
    <div className="ui-screen support-screen">
      <button type="button" className="ui-back" onClick={onBack}><ChevronLeft size={22} aria-hidden="true" /> Back</button>
      <header className="ui-screen-title">
        <h1>Help &amp; Support</h1>
        <p>{audience === 'driver' ? 'For AID drivers' : 'Questions and problems'}</p>
      </header>

      <section className="ui-section" aria-labelledby="support-report-title">
        <SectionHeader id="support-report-title" title="Get help" />
        <List>
          <ListRow icon={<MessageSquareWarning size={19} />} title="Report a problem" subtitle="A job, a payment or the app" hasPopup onClick={() => setReporting(true)} />
          <SafetyMenuItem audience={audience} />
          {email && (
            <a className="ui-row" href={`mailto:${email}`}>
              <span className="ui-row__icon" aria-hidden="true"><Mail size={19} /></span>
              <span className="ui-row__text"><strong>Email support</strong><small>{email}</small></span>
            </a>
          )}
          {phone && (
            <a className="ui-row" href={`tel:${phone.replace(/[^+\d]/g, '')}`}>
              <span className="ui-row__icon" aria-hidden="true"><Phone size={19} /></span>
              <span className="ui-row__text"><strong>Call support</strong><small>{phone}</small></span>
            </a>
          )}
        </List>
      </section>

      <section className="ui-section" aria-labelledby="support-mine-title">
        <SectionHeader id="support-mine-title" title="My reports" />
        <MyReports reports={reports} error={reportsError} onRetry={() => void loadReports()} />
      </section>

      <section className="ui-section" aria-labelledby="support-faq-title">
        <SectionHeader id="support-faq-title" title="Common questions" />
        <div className="ui-list support-faq">
          {FAQ[audience].map((item) => (
            <details key={item.q}>
              <summary><span>{item.q}</span><ChevronDown size={18} aria-hidden="true" /></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {reporting && (
        <ReportProblemSheet audience={audience} jobs={jobs} titleId="report-problem-title" onSent={() => void loadReports()} onClose={() => setReporting(false)} closeLabel="Cancel" />
      )}
    </div>
  )
}
