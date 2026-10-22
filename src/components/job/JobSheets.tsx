/**
 * Bottom sheets shared by the driver job screen, customer tracking and chat: a confirm step (with
 * an optional reason picker) and an issue report (B18 report sheet, job fixed). The one
 * bottom-sheet style (F2): title, short explanation, choices, actions pinned at the bottom.
 */

import { Check, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import ReportProblemSheet from '../support/ReportProblemForm'
import BottomSheet from '../ui/BottomSheet'
import Button from '../ui/Button'
import type { SupportAudience } from '../../lib/support'
import type { Choice } from '../../lib/jobLifecycle'

function ChoiceList({ name, choices, value, onChange }: { name: string; choices: Choice[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="choice-list" role="radiogroup" aria-label={name}>
      {choices.map((choice) => (
        <label key={choice.id} className={`choice${value === choice.id ? ' is-selected' : ''}`}>
          <input type="radio" name={name} value={choice.id} checked={value === choice.id} onChange={() => onChange(choice.id)} />
          <span>{choice.label}</span>
          <span className="choice__check" aria-hidden="true">{value === choice.id && <Check size={14} strokeWidth={3} />}</span>
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
  /** Destructive actions (cancel, block) use the red button; completing uses the primary one. */
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
    <BottomSheet
      title={title} titleId={`${id}-title`} describedBy={`${id}-text`} role="alertdialog" dismissible={!busy} showClose={false} onClose={onClose}
      footer={(
        <>
          {error && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
          <Button variant={tone === 'danger' ? 'destructive' : 'primary'} block size="lg" disabled={blocked} loading={busy} loadingLabel={busyLabel} onClick={() => onConfirm(reason)}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" block disabled={busy} onClick={onClose}>{keepLabel}</Button>
        </>
      )}
    >
      <p id={`${id}-text`} className="sheet-text">{text}</p>
      {reasons && (
        <div className="sheet-fieldset">
          <p className="sheet-label">{reasonRequired ? 'Why are you cancelling?' : 'Why are you cancelling? (optional)'}</p>
          <ChoiceList name="Cancellation reason" choices={reasons} value={reason} onChange={setReason} />
        </div>
      )}
    </BottomSheet>
  )
}

/** "Report an issue" on an active job — the same report sheet and table as Help & Support (B18). */
export function ReportIssueSheet({ bookingId, audience, onClose, initialCategory }: { bookingId: string; audience: SupportAudience; onClose: () => void; initialCategory?: string }) {
  return <ReportProblemSheet audience={audience} bookingId={bookingId} titleId="report-issue-title" onClose={onClose} initialCategory={initialCategory} />
}
