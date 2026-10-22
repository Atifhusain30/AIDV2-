/**
 * Honest emergency path (B19). AID is not an emergency service: it never contacts police, EMS
 * or anyone else on the user's behalf. These components only help the person place the call
 * themselves (tel:911, behind a confirm step so a stray tap can't dial) and show plain safety tips.
 * Both sheets use the one bottom-sheet style (F2) on the accessible Dialog (F4).
 */

import { useEffect, useRef, useState } from 'react'
import { Car, MapPin, Phone, ShieldCheck, AlertTriangle, UserCheck } from 'lucide-react'
import BottomSheet from '../ui/BottomSheet'
import Button from '../ui/Button'
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
const TIP_ICONS = [AlertTriangle, MapPin, Car, UserCheck]

/** Confirm step before dialing. The tel:911 link only exists here, never one tap from a screen. */
export function Call911Sheet({ onBack, backLabel, onClose }: { onBack: () => void; backLabel: string; onClose: () => void }) {
  return (
    <BottomSheet
      title="Call 911?" titleId="call-911-title" describedBy="call-911-text" role="alertdialog" showClose={false} onClose={onClose}
      footer={(
        <>
          <a className="ui-btn ui-btn--destructive ui-btn--block ui-btn--lg" href="tel:911" aria-label="Call 911 now">
            <Phone size={18} aria-hidden="true" /> Call 911 now
          </a>
          <Button variant="secondary" block onClick={onBack}>{backLabel}</Button>
        </>
      )}
    >
      <p id="call-911-text" className="sheet-text">This opens your phone to call 911. {NOT_EMERGENCY_SERVICE}</p>
      <p className="safety-fallback">If this device can't make calls, dial <strong>911</strong> from any phone.</p>
    </BottomSheet>
  )
}

/** "Call 911" button that asks for confirmation before dialing. */
export function Call911Button({ className = 'ui-btn ui-btn--danger ui-btn--block' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Phone size={17} aria-hidden="true" /> Call 911
      </button>
      {open && <Call911Sheet onBack={() => setOpen(false)} backLabel="Cancel" onClose={() => setOpen(false)} />}
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

  if (confirming) return <Call911Sheet onBack={() => setConfirming(false)} backLabel="Back" onClose={onClose} />
  return (
    <BottomSheet
      title="Safety" titleId="safety-title" describedBy="safety-text" onClose={onClose} closeLabel="Close safety"
      footer={(
        <button type="button" className="ui-btn ui-btn--danger ui-btn--block" aria-haspopup="dialog" onClick={() => setConfirming(true)}>
          <Phone size={17} aria-hidden="true" /> Call 911
        </button>
      )}
    >
      <p id="safety-text" className="ui-alert safety-statement"><ShieldCheck size={18} aria-hidden="true" /> <span>{NOT_EMERGENCY_SERVICE}</span></p>
      <ul className="safety-tips">
        {GUIDANCE[audience].map((tip, index) => {
          const Icon = TIP_ICONS[index] ?? ShieldCheck
          return <li key={tip}><span aria-hidden="true"><Icon size={18} /></span>{tip}</li>
        })}
      </ul>
    </BottomSheet>
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
      {open === '911' && <Call911Sheet onBack={() => setOpen(null)} backLabel="Cancel" onClose={() => setOpen(null)} />}
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
