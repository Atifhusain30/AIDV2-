/**
 * B18: the one "report a problem" form, used by Help & Support (general, or pick one of your recent
 * jobs) and by "Report an issue" on an active job (job fixed). Everything goes to POST /support/reports;
 * the server re-checks the category list, the job (yours only), the message and the hourly limit.
 */

import { useId, useState, type FormEvent } from 'react'
import { AlertCircle, Check, CheckCircle2 } from 'lucide-react'
import { apiService } from '../../services/api'
import { REPORT_CATEGORIES, REPORT_MESSAGE_MAX, reportMessageRequired, type SupportAudience, type SupportReport } from '../../lib/support'
import { Call911Button } from '../safety/Safety'

export interface ReportableJob { id: string; label: string }

interface ReportProblemFormProps {
  audience: SupportAudience
  /** Report about this job (from the job screen): no job picker. */
  bookingId?: string
  /** Recent jobs the person can attach (Help & Support). */
  jobs?: ReportableJob[]
  /** Heading id for the surrounding dialog/section. */
  titleId: string
  onSent?: (report: SupportReport) => void
  onClose: () => void
  closeLabel?: string
}

export default function ReportProblemForm({ audience, bookingId, jobs = [], titleId, onSent, onClose, closeLabel = 'Close' }: ReportProblemFormProps) {
  const [category, setCategory] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ category?: string; message?: string; bookingId?: string }>({})
  const ids = { category: useId(), job: useId(), message: useId(), count: useId() }
  const linkedJob = bookingId || jobId || null
  const needsMessage = reportMessageRequired(category, linkedJob)
  const choices = REPORT_CATEGORIES[audience]

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const errors: typeof fieldErrors = {}
    if (!category) errors.category = 'Choose what the problem is about.'
    if (needsMessage && !message.trim()) errors.message = 'Tell us what happened.'
    setFieldErrors(errors)
    if (errors.category || errors.message) return
    setState('sending')
    setError(null)
    const result = await apiService.createSupportReport({ category: category!, message: message.trim() || undefined, bookingId: linkedJob })
    if (!result.success || !result.data) {
      setState('idle')
      const field = (result as { field?: string }).field
      if (field === 'category' || field === 'message' || field === 'bookingId') setFieldErrors({ [field]: result.error })
      else setError(result.error || 'Unable to send your report. Try again.')
      return
    }
    setState('sent')
    onSent?.(result.data)
  }

  if (state === 'sent') {
    return (
      <div className="support-sent" role="status">
        <CheckCircle2 size={34} aria-hidden="true" className="support-sent__icon" />
        <h2 id={titleId} className="job-confirm__title">Report sent</h2>
        <p className="job-confirm__text">
          The AID team will review it. You can follow its status under My reports in Help &amp; Support.
          {category === 'safety' ? ' If anyone is in danger, call 911 now.' : ''}
        </p>
        <div className="job-confirm__actions">
          {category === 'safety' && <Call911Button />}
          <button type="button" className="job-keep" onClick={onClose}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} aria-labelledby={titleId}>
      <h2 id={titleId} className="job-confirm__title">{bookingId ? 'Report an issue' : 'Report a problem'}</h2>
      <p className="job-confirm__text">
        Not for emergencies: reports are reviewed later — no one is alerted right away. If anyone is in danger, call 911 first.
      </p>

      <fieldset className="support-fieldset" aria-describedby={fieldErrors.category ? ids.category : undefined}>
        <legend className="job-choices__label">What is it about?</legend>
        <div className="job-choices">
          {choices.map((choice) => (
            <label key={choice.id} className={`job-choice${category === choice.id ? ' is-selected' : ''}${choice.id === 'safety' ? ' job-choice--safety' : ''}`}>
              <input type="radio" name="report-category" value={choice.id} checked={category === choice.id} onChange={() => { setCategory(choice.id); setFieldErrors((e) => ({ ...e, category: undefined })) }} />
              <span>{choice.label}</span>
              {category === choice.id && <Check size={16} aria-hidden="true" />}
            </label>
          ))}
        </div>
        {fieldErrors.category && <p id={ids.category} className="support-field-error" role="alert">{fieldErrors.category}</p>}
      </fieldset>

      {!bookingId && jobs.length > 0 && (
        <label className="job-issue-details" htmlFor={ids.job}>
          <span>Which job? (optional)</span>
          <select id={ids.job} className="support-select" value={jobId} onChange={(event) => setJobId(event.target.value)} aria-invalid={Boolean(fieldErrors.bookingId)}>
            <option value="">Not about a specific job</option>
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.label}</option>)}
          </select>
          {fieldErrors.bookingId && <span className="support-field-error" role="alert">{fieldErrors.bookingId}</span>}
        </label>
      )}

      <label className="job-issue-details" htmlFor={ids.message}>
        <span>What happened?{needsMessage ? '' : ' (optional)'}</span>
        <textarea
          id={ids.message}
          value={message}
          maxLength={REPORT_MESSAGE_MAX}
          rows={4}
          aria-invalid={Boolean(fieldErrors.message)}
          aria-describedby={`${ids.count}${fieldErrors.message ? ` ${ids.message}-error` : ''}`}
          onChange={(event) => { setMessage(event.target.value); setFieldErrors((e) => ({ ...e, message: undefined })) }}
          placeholder="Describe what happened, when, and anything we should know"
        />
        <small id={ids.count} className="support-count">{message.length} / {REPORT_MESSAGE_MAX}</small>
        {fieldErrors.message && <span id={`${ids.message}-error`} className="support-field-error" role="alert">{fieldErrors.message}</span>}
      </label>

      {error && <p className="job-error support-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
      <div className="job-confirm__actions">
        <button type="submit" className="aid-primary-button" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send report'}</button>
        <button type="button" className="job-keep" disabled={state === 'sending'} onClick={onClose}>{closeLabel}</button>
      </div>
    </form>
  )
}
