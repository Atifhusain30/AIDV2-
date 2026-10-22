/**
 * Honest emergency path (B19). AID is not an emergency service: it never contacts police, EMS
 * or anyone else on the user's behalf. These components only help the person place the call
 * themselves (tel:911, behind a confirm step so a stray tap can't dial) and show plain safety tips.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Phone, ShieldCheck } from 'lucide-react'
import Dialog from '../ui/Dialog'
import { ListRow } from '../ui/ListRow'

export type SafetyAudience = 'customer' | 'driver'

export const NOT_EMERGENCY_SERVICE = 'AID is not an emergency service and does not contact 911, police or medical help for you.'

const GUIDANCE: Record<SafetyAudience, string[]> = {
  customer: [
    "If you're in danger, call 911.",
    'If you can, move to a safe place away from traffic.',
    "On a highway shoulder, stay in your vehicle with your seatbelt on and hazard lights on.",
    "Before you interact, check that the driver's name, vehicle and plate match what's shown in the app.",
  ],
  driver: [
    "If you or anyone else is in danger, call 911.",
    'Park where you can work away from moving traffic, with hazard lights on.',
    "Check the customer's name and vehicle match the job before you start.",
    "If a situation feels unsafe, leave and use Report an issue once you're safe.",
  ],
}

/** Shared accessible sheet (F4): focus trap, Escape/backdrop close, focus returns to the trigger. */
function SafetyDialog({ labelledBy, describedBy, role, onClose, children }: { labelledBy: string; describedBy?: string; role?: 'dialog' | 'alertdialog'; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog labelledBy={labelledBy} describedBy={describedBy} role={role} className="account-sheet safety-sheet" onClose={onClose}>
      {children}
    </Dialog>
  )
}

/** Confirm step before dialing. The tel:911 link only exists here, never one tap from a screen. */
function Call911Confirm({ onBack, backLabel }: { onBack: () => void; backLabel: string }) {
  return (
    <>
      <h2 id="call-911-title" className="job-confirm__title" tabIndex={-1}>Call 911?</h2>
      <p id="call-911-text" className="job-confirm__text">This opens your phone to call 911. {NOT_EMERGENCY_SERVICE}</p>
      <div className="job-confirm__actions">
        <a className="safety-call safety-call--solid" href="tel:911" aria-label="Call 911 now">
          <Phone size={18} aria-hidden="true" /> Call 911 now
        </a>
        <button type="button" className="job-keep" onClick={onBack}>{backLabel}</button>
      </div>
      <p className="safety-fallback">If this device can't make calls, dial <strong>911</strong> from any phone.</p>
    </>
  )
}

/** "Call 911" button that asks for confirmation before dialing. */
export function Call911Button({ className = 'safety-call' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Phone size={17} aria-hidden="true" /> Call 911
      </button>
      {open && (
        <SafetyDialog labelledBy="call-911-title" describedBy="call-911-text" role="alertdialog" onClose={() => setOpen(false)}>
          <Call911Confirm onBack={() => setOpen(false)} backLabel="Cancel" />
        </SafetyDialog>
      )}
    </>
  )
}

/** Safety information sheet with its own Call 911 (still behind the confirm step). */
export function SafetySheet({ audience, onClose }: { audience: SafetyAudience; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false)
  // Switching step replaces the focused button: move focus to the new step's title so a
  // screen reader announces it and keyboard focus stays in the sheet.
  const switched = useRef(false)
  useEffect(() => {
    if (!switched.current) { switched.current = true; return }
    document.getElementById(confirming ? 'call-911-title' : 'safety-title')?.focus()
  }, [confirming])
  return (
    <SafetyDialog labelledBy={confirming ? 'call-911-title' : 'safety-title'} describedBy={confirming ? 'call-911-text' : 'safety-text'} onClose={onClose}>
      {confirming ? (
        <Call911Confirm onBack={() => setConfirming(false)} backLabel="Back" />
      ) : (
        <>
          <h2 id="safety-title" className="job-confirm__title" tabIndex={-1}>Safety</h2>
          <p id="safety-text" className="safety-statement">{NOT_EMERGENCY_SERVICE}</p>
          <ul className="safety-tips">
            {GUIDANCE[audience].map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
          <div className="job-confirm__actions">
            <button type="button" className="safety-call" aria-haspopup="dialog" onClick={() => setConfirming(true)}>
              <Phone size={17} aria-hidden="true" /> Call 911
            </button>
            <button type="button" className="job-keep" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </SafetyDialog>
  )
}

/**
 * Quiet rows on the active-job / tracking screens: Safety info and Call 911 (still behind the
 * confirm step). Reachable in one tap, but styled as list rows so they never compete with the
 * screen's one primary action. Render inside a <List>.
 */
export function SafetyActions({ audience }: { audience: SafetyAudience }) {
  const [open, setOpen] = useState<'safety' | '911' | null>(null)
  return (
    <>
      <ListRow icon={<ShieldCheck size={19} />} title="Safety" hasPopup onClick={() => setOpen('safety')} />
      <ListRow icon={<Phone size={18} />} title="Call 911" tone="danger" hasPopup chevron={false} onClick={() => setOpen('911')} />
      {open === 'safety' && <SafetySheet audience={audience} onClose={() => setOpen(null)} />}
      {open === '911' && (
        <SafetyDialog labelledBy="call-911-title" describedBy="call-911-text" role="alertdialog" onClose={() => setOpen(null)}>
          <Call911Confirm onBack={() => setOpen(null)} backLabel="Cancel" />
        </SafetyDialog>
      )}
    </>
  )
}

/** Menu row for settings / account screens. */
export function SafetyMenuItem({ audience }: { audience: SafetyAudience; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ListRow icon={<ShieldCheck size={19} />} title="Safety" subtitle="Safety tips and calling 911" hasPopup onClick={() => setOpen(true)} />
      {open && <SafetySheet audience={audience} onClose={() => setOpen(false)} />}
    </>
  )
}
