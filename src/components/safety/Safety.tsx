/**
 * Honest emergency path (B19). AID is not an emergency service: it never contacts police, EMS
 * or anyone else on the user's behalf. These components only help the person place the call
 * themselves (tel:911, behind a confirm step so a stray tap can't dial) and show plain safety tips.
 */

import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Phone, ShieldCheck } from 'lucide-react'

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

function SafetyDialog({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="account-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="account-sheet safety-sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-sheet__handle" />
        {children}
      </section>
    </div>,
    document.body,
  )
}

/** Confirm step before dialing. The tel:911 link only exists here, never one tap from a screen. */
function Call911Confirm({ onBack, backLabel }: { onBack: () => void; backLabel: string }) {
  return (
    <>
      <h2 id="call-911-title" className="job-confirm__title">Call 911?</h2>
      <p className="job-confirm__text">This opens your phone to call 911. {NOT_EMERGENCY_SERVICE}</p>
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
        <SafetyDialog labelledBy="call-911-title" onClose={() => setOpen(false)}>
          <Call911Confirm onBack={() => setOpen(false)} backLabel="Cancel" />
        </SafetyDialog>
      )}
    </>
  )
}

/** Safety information sheet with its own Call 911 (still behind the confirm step). */
export function SafetySheet({ audience, onClose }: { audience: SafetyAudience; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <SafetyDialog labelledBy={confirming ? 'call-911-title' : 'safety-title'} onClose={onClose}>
      {confirming ? (
        <Call911Confirm onBack={() => setConfirming(false)} backLabel="Back" />
      ) : (
        <>
          <h2 id="safety-title" className="job-confirm__title">Safety</h2>
          <p className="safety-statement">{NOT_EMERGENCY_SERVICE}</p>
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

/** Row on the active-job / tracking screens: safety info + Call 911. */
export function SafetyActions({ audience }: { audience: SafetyAudience }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="safety-actions" aria-label="Safety">
      <button type="button" className="job-report" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <ShieldCheck size={17} aria-hidden="true" /> Safety
      </button>
      <Call911Button />
      {open && <SafetySheet audience={audience} onClose={() => setOpen(false)} />}
    </div>
  )
}

/** Menu row for settings / account screens. */
export function SafetyMenuItem({ audience, className }: { audience: SafetyAudience; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="account-menu__icon"><ShieldCheck size={20} aria-hidden="true" /></span>
        <span><strong>Safety</strong><small>Safety tips and calling 911</small></span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      {open && <SafetySheet audience={audience} onClose={() => setOpen(false)} />}
    </>
  )
}
