/**
 * Bottom sheets shared by the driver job screen and customer tracking screen:
 * a confirm step (with optional reason picker) and an issue report.
 */

import { useState, type ReactNode } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { apiService } from '../../services/api'
import type { Choice } from '../../lib/jobLifecycle'

function Sheet({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="account-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="account-sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-sheet__handle" />
        {children}
      </section>
    </div>
  )
}

function ChoiceList({ name, choices, value, onChange }: { name: string; choices: Choice[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="job-choices" role="radiogroup" aria-label={name}>
      {choices.map((choice) => (
        <label key={choice.id} className={`job-choice${value === choice.id ? ' is-selected' : ''}`}>
          <input type="radio" name={name} value={choice.id} checked={value === choice.id} onChange={() => onChange(choice.id)} />
          <span>{choice.label}</span>
          {value === choice.id && <Check size={16} aria-hidden="true" />}
        </label>
      ))}
    </div>
  )
}

interface ConfirmSheetProps {
  id: string
  title: string
  text: string
  confirmLabel: string
  busyLabel: string
  keepLabel: string
  busy: boolean
  /** Destructive actions (cancel) use the red button; completing uses the primary one. */
  tone: 'danger' | 'primary'
  reasons?: Choice[]
  /** When true, a reason must be picked before confirming. */
  reasonRequired?: boolean
  error?: string | null
  onConfirm: (reason: string | null) => void
  onClose: () => void
}

export function ConfirmSheet({ id, title, text, confirmLabel, busyLabel, keepLabel, busy, tone, reasons, reasonRequired, error, onConfirm, onClose }: ConfirmSheetProps) {
  const [reason, setReason] = useState<string | null>(null)
  const blocked = busy || Boolean(reasonRequired && !reason)
  return (
    <Sheet labelledBy={`${id}-title`} onClose={busy ? () => undefined : onClose}>
      <h2 id={`${id}-title`} className="job-confirm__title">{title}</h2>
      <p className="job-confirm__text">{text}</p>
      {reasons && (
        <>
          <p className="job-choices__label">{reasonRequired ? 'Why are you cancelling?' : 'Why are you cancelling? (optional)'}</p>
          <ChoiceList name="Cancellation reason" choices={reasons} value={reason} onChange={setReason} />
        </>
      )}
      {error && <p className="job-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
      <div className="job-confirm__actions">
        <button type="button" className={tone === 'danger' ? 'job-cancel job-cancel--solid' : 'aid-primary-button'} disabled={blocked} onClick={() => onConfirm(reason)}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" className="job-keep" disabled={busy} onClick={onClose}>{keepLabel}</button>
      </div>
    </Sheet>
  )
}

export function ReportIssueSheet({ bookingId, choices, onClose }: { bookingId: string; choices: Choice[]; onClose: () => void }) {
  const [category, setCategory] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const needsDetails = category === 'other' && !details.trim()

  const submit = async () => {
    if (!category) return
    setState('sending')
    setError(null)
    const result = await apiService.reportBookingIssue(bookingId, category, details.trim() || undefined)
    if (!result.success) {
      setState('idle')
      setError(result.error || 'Unable to send your report.')
      return
    }
    setState('sent')
  }

  return (
    <Sheet labelledBy="report-issue-title" onClose={state === 'sending' ? () => undefined : onClose}>
      <h2 id="report-issue-title" className="job-confirm__title">{state === 'sent' ? 'Report saved' : 'Report an issue'}</h2>
      {state === 'sent' ? (
        <>
          <p className="job-confirm__text">Your report is saved to this job's record.{category === 'safety' ? ' If anyone is in danger, call 911 now.' : ''}</p>
          <div className="job-confirm__actions"><button type="button" className="job-keep" onClick={onClose}>Done</button></div>
        </>
      ) : (
        <>
          <p className="job-confirm__text">If anyone is in danger, call 911 first.</p>
          <ChoiceList name="Issue type" choices={choices} value={category} onChange={setCategory} />
          <label className="job-issue-details">
            <span>Details{category === 'other' ? '' : ' (optional)'}</span>
            <textarea value={details} maxLength={1000} rows={3} onChange={(event) => setDetails(event.target.value)} placeholder="What happened?" />
          </label>
          {error && <p className="job-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
          <div className="job-confirm__actions">
            <button type="button" className="aid-primary-button" disabled={!category || needsDetails || state === 'sending'} onClick={() => void submit()}>
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" className="job-keep" disabled={state === 'sending'} onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </Sheet>
  )
}
