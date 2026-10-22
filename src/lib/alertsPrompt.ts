/**
 * Contextual notification permission (no system prompt on app start or sign-in).
 *
 * The system "Allow notifications?" prompt is shown only after a short in-app explainer, at the
 * moment alerts become useful: a customer has just sent their first request, or a driver has just
 * gone online for the first time. If permission was already granted, the channel is set up silently.
 * The explainer is offered once per phone; "Not now" is respected.
 */

import { create } from 'zustand'
import { getNotificationPermission, initNotifications } from './notifications'

export type AlertsAudience = 'customer' | 'driver'
const ASKED_KEY = 'aid.alertsExplainer.v1'

export const useAlertsPrompt = create<{ audience: AlertsAudience | null }>(() => ({ audience: null }))

const alreadyAsked = () => {
  try { return localStorage.getItem(ASKED_KEY) === '1' } catch { return false }
}
const rememberAsked = () => {
  try { localStorage.setItem(ASKED_KEY, '1') } catch { /* private mode: ask again next time */ }
}

/** App start / sign-in: never prompts. If alerts are already allowed, make sure the channel exists. */
export async function syncAlertsIfAllowed(): Promise<void> {
  try {
    if (await getNotificationPermission() === 'granted') await initNotifications()
  } catch { /* alerts are optional; never break start-up */ }
}

/** Called right after the contextual moment. Shows the explainer only if the person was never asked. */
export async function offerAlerts(audience: AlertsAudience): Promise<void> {
  let permission: Awaited<ReturnType<typeof getNotificationPermission>>
  try { permission = await getNotificationPermission() } catch { return }
  if (permission === 'granted') { await initNotifications(); return }
  if (permission !== 'prompt' || alreadyAsked()) return
  useAlertsPrompt.setState({ audience })
}

/** The explainer's answer: "Turn on alerts" shows the system prompt; "Not now" doesn't. */
export async function answerAlerts(turnOn: boolean): Promise<void> {
  rememberAsked()
  useAlertsPrompt.setState({ audience: null })
  if (turnOn) await initNotifications()
}
