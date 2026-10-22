/**
 * The in-app explainer shown before the system notification prompt (see src/lib/alertsPrompt.ts):
 * why alerts help, then "Turn on alerts" (system prompt) or "Not now".
 */

import { BellRing } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import Button from './ui/Button'
import { answerAlerts, useAlertsPrompt } from '../lib/alertsPrompt'

const COPY = {
  customer: {
    title: 'Get alerts when your driver is on the way',
    body: "We'll let you know when a driver accepts, is on the way and has arrived — even when AID is in the background.",
  },
  driver: {
    title: 'Get alerts about your jobs',
    body: "We'll let you know when a job you've accepted changes — for example if the customer cancels — even when AID is in the background.",
  },
}

export default function AlertsExplainer() {
  const audience = useAlertsPrompt((state) => state.audience)
  if (!audience) return null
  const copy = COPY[audience]
  return (
    <BottomSheet title={copy.title} onClose={() => void answerAlerts(false)} closeLabel="Not now" className="alerts-sheet"
      footer={(
        <>
          <Button block size="lg" onClick={() => void answerAlerts(true)}>Turn on alerts</Button>
          <Button block variant="ghost" onClick={() => void answerAlerts(false)}>Not now</Button>
        </>
      )}>
      <div className="alerts-sheet__body">
        <span className="alerts-sheet__icon" aria-hidden="true"><BellRing size={24} /></span>
        <p className="sheet-text">{copy.body}</p>
      </div>
    </BottomSheet>
  )
}
