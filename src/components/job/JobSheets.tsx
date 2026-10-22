/**
 * Bottom sheets shared by the driver job screen and customer tracking screen:
 * a confirm step (with optional reason picker) and an issue report (B18 report form, job fixed).
 */

import { useState, type ReactNode } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import ReportProblemForm from '../support/ReportProblemForm'
import Dialog from '../ui/Dialog'
import type { SupportAudience } from '../../lib/support'
import type { Choice } from '../../lib/jobLifecycle'

function Sheet({ labelledBy, describedBy, role, dismissible = true, onClose, children }: { labelledBy: string; describedBy?: string; role?: 'dialog' | 'alertdialog'; dismissible?: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog labelledBy={labelledBy} describedBy={describedBy} role={role} dismissible={dismissible} onClose={onClose}>
      {children}
    </Dialog>
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
    <Sheet labelledBy={`${id}-title`} describedBy={`${id}-text`} role="alertdialog" dismissible={!busy} onClose={onClose}>
      <h2 id={`${id}-title`} className="job-confirm__title">{title}</h2>
      <p id={`${id}-text`} className="job-confirm__text">{text}</p>
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

/** "Report an issue" on an active job — the same report form and table as Help & Support (B18). */
export function ReportIssueSheet({ bookingId, audience, onClose, initialCategory }: { bookingId: string; audience: SupportAudience; onClose: () => void; initialCategory?: string }) {
  return (
    <Sheet labelledBy="report-issue-title" onClose={onClose}>
      <ReportProblemForm audience={audience} bookingId={bookingId} titleId="report-issue-title" onClose={onClose} initialCategory={initialCategory} />
    </Sheet>
  )
}
