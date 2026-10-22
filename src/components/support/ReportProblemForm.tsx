/**
 * B18: the one "report a problem" sheet, used by Help & Support (general, or pick one of your recent
 * jobs), by "Report an issue" on an active job (job fixed) and from chat. Everything goes to
 * POST /support/reports; the server re-checks the category list, the job (yours only), the message
 * and the hourly limit. One bottom-sheet style (F2) with Send pinned at the bottom.
 */

import { useEffect, useId, useState, type FormEvent } from 'react'
import { AlertCircle, Check, CheckCircle2 } from 'lucide-react'
import { apiService } from '../../services/api'
import { REPORT_CATEGORIES, REPORT_MESSAGE_MAX, reportMessageRequired, type SupportAudience, type SupportReport } from '../../lib/support'
import { Call911Button } from '../safety/Safety'
import BottomSheet from '../ui/BottomSheet'
import Button from '../ui/Button'

export interface ReportableJob { id: string; label: string }

interface ReportProblemSheetProps {
  audience: SupportAudience
  /** Report about this job (from the job screen or chat): no job picker. */
  bookingId?: string
  /** Recent jobs the person can attach (Help & Support). */
  jobs?: ReportableJob[]
  /** Heading id of the sheet. */
  titleId: string
  onSent?: (report: SupportReport) => void
  onClose: () => void
  closeLabel?: string
  /** Pre-selected category (e.g. the other person's behaviour when reporting from chat); can be changed. */
  initialCategory?: string
}

export default function ReportProblemSheet({ audience, bookingId, jobs = [], titleId, onSent, onClose, closeLabel = 'Close', initialCategory }: ReportProblemSheetProps) {
  const [category, setCategory] = useState<string | null>(
    initialCategory && REPORT_CATEGORIES[audience].some((choice) => choice.id === initialCategory) ? initialCategory : null,
  )
  const [jobId, setJobId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ category?: string; message?: string; bookingId?: string }>({})
  const ids = { form: useId(), intro: useId(), category: useId(), job: useId(), message: useId(), count: useId() }
  const linkedJob = bookingId || jobId || null
  const needsMessage = reportMessageRequired(category, linkedJob)
  const choices = REPORT_CATEGORIES[audience]
  const sending = state === 'sending'
  // F4: the form (and its focused Send button) is gone — keep focus in the sheet on the result.
  useEffect(() => { if (state === 'sent') document.getElementById(titleId)?.focus() }, [state, titleId])

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

  // One sheet for both steps (the form, then "Report sent") so focus and the dialog stay put.
  const sent = state === 'sent'
  return (
    <BottomSheet
      title={sent ? 'Report sent' : bookingId ? 'Report an issue' : 'Report a problem'} titleId={titleId} describedBy={sent ? `${ids.intro}-sent` : ids.intro}
      onClose={onClose} dismissible={!sending} showClose={!sent} className="report-sheet"
      footer={sent ? (
        <>
          {category === 'safety' && <Call911Button />}
          <Button variant={category === 'safety' ? 'secondary' : 'primary'} block size="lg" onClick={onClose}>Done</Button>
        </>
      ) : (
        <>
          {error && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
          <Button type="submit" form={ids.form} block size="lg" loading={sending} loadingLabel="Sending…">Send report</Button>
          <Button variant="ghost" block disabled={sending} onClick={onClose}>{closeLabel}</Button>
        </>
      )}
    >
      {sent ? (
        <div className="sheet-result" role="status">
          <span className="sheet-result__icon" aria-hidden="true"><CheckCircle2 size={28} /></span>
          <p id={`${ids.intro}-sent`} className="sheet-text">
            The AID team will review it. You can follow its status under My reports in Help &amp; Support.
            {category === 'safety' ? ' If anyone is in danger, call 911 now.' : ''}
          </p>
        </div>
      ) : (
      <form id={ids.form} noValidate onSubmit={(event) => void submit(event)} aria-labelledby={titleId} className="sheet-form">
        <p id={ids.intro} className="ui-alert sheet-note">
          Not for emergencies: reports are reviewed later — no one is alerted right away. If anyone is in danger, call 911 first.
        </p>

        <fieldset className="sheet-fieldset" aria-describedby={fieldErrors.category ? ids.category : undefined}>
          <legend>What is it about?</legend>
          <div className="choice-list">
            {choices.map((choice) => (
              <label key={choice.id} className={`choice${category === choice.id ? ' is-selected' : ''}`}>
                <input type="radio" name="report-category" value={choice.id} checked={category === choice.id} onChange={() => { setCategory(choice.id); setFieldErrors((e) => ({ ...e, category: undefined })) }} />
                <span>{choice.label}</span>
                <span className="choice__check" aria-hidden="true">{category === choice.id && <Check size={14} strokeWidth={3} />}</span>
              </label>
            ))}
          </div>
          {fieldErrors.category && <p id={ids.category} className="ui-field-error" role="alert">{fieldErrors.category}</p>}
        </fieldset>

        {!bookingId && jobs.length > 0 && (
          <label className="ui-field" htmlFor={ids.job}>
            <span>Which job? (optional)</span>
            <select id={ids.job} className="ui-input ui-select" value={jobId} onChange={(event) => setJobId(event.target.value)} aria-invalid={Boolean(fieldErrors.bookingId)}>
              <option value="">Not about a specific job</option>
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.label}</option>)}
            </select>
            {fieldErrors.bookingId && <span className="ui-field-error" role="alert">{fieldErrors.bookingId}</span>}
          </label>
        )}

        <label className="ui-field" htmlFor={ids.message}>
          <span>What happened?{needsMessage ? '' : ' (optional)'}</span>
          <textarea
            id={ids.message}
            className="ui-input ui-textarea"
            value={message}
            maxLength={REPORT_MESSAGE_MAX}
            rows={4}
            aria-invalid={Boolean(fieldErrors.message)}
            aria-describedby={`${ids.count}${fieldErrors.message ? ` ${ids.message}-error` : ''}`}
            onChange={(event) => { setMessage(event.target.value); setFieldErrors((e) => ({ ...e, message: undefined })) }}
            placeholder="What happened, when, and anything we should know"
          />
          <span className="ui-field__foot">
            {fieldErrors.message ? <span id={`${ids.message}-error`} className="ui-field-error" role="alert">{fieldErrors.message}</span> : <span />}
            <small id={ids.count} className="ui-field__count">{message.length} / {REPORT_MESSAGE_MAX}</small>
          </span>
        </label>
      </form>
      )}
    </BottomSheet>
  )
}
