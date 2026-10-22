/**
 * B18 Help & Support: report categories (mirror of server/support.js — a test keeps them equal; the
 * server rejects anything else), status labels and the FAQ. The FAQ only describes what the app does
 * today; when a rule changes on the server (cancel window, expiry, rating window), change it here too.
 */

import type { Choice } from './jobLifecycle'

export type SupportAudience = 'customer' | 'driver'
export type ReportStatus = 'open' | 'in_review' | 'resolved'

export const REPORT_MESSAGE_MAX = 2000
export const REPORTS_PER_HOUR = 10

export const REPORT_CATEGORIES: Record<SupportAudience, Choice[]> = {
  customer: [
    { id: 'driver_behaviour', label: 'Driver behaviour' },
    { id: 'vehicle_damage', label: 'Damage to my vehicle' },
    { id: 'pricing', label: 'Pricing or charge' },
    { id: 'service_problem', label: "Service wasn't completed" },
    { id: 'app_problem', label: 'App problem' },
    { id: 'safety', label: 'Safety concern (non-emergency)' },
    { id: 'other', label: 'Other' },
  ],
  driver: [
    { id: 'customer_behaviour', label: 'Customer behaviour' },
    { id: 'payment', label: 'Payment or earnings' },
    { id: 'vehicle_damage', label: 'Damage to my vehicle or equipment' },
    { id: 'service_problem', label: "Service couldn't be completed" },
    { id: 'app_problem', label: 'App problem' },
    { id: 'safety', label: 'Safety concern (non-emergency)' },
    { id: 'other', label: 'Other' },
  ],
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Received',
  in_review: 'In review',
  resolved: 'Resolved',
}

/** A message is required unless the report is about a job and the category says enough ("Other" always needs words). */
export function reportMessageRequired(category: string | null, bookingId: string | null): boolean {
  return !bookingId || category === 'other'
}

export interface SupportReport {
  id: string
  category: string
  categoryLabel: string
  message: string
  status: ReportStatus
  booking: { id: string; serviceName: string } | null
  createdAt: string
  updatedAt: string | null
  resolvedAt: string | null
}

export interface SupportConfig {
  /** From server config; null = not set up yet, so the app shows no contact option. */
  contact: { email: string | null; phone: string | null }
  messageMaxLength: number
  reportsPerHour: number
}

export interface FaqItem { q: string; a: string }

const SHARED_SAFETY: FaqItem = {
  q: 'What should I do in an emergency?',
  a: 'Call 911. AID is not an emergency service and does not contact 911, police or medical help for you. The Safety button (and Call 911) is on the job screen and below in Safety. Reports sent here are reviewed later — no one is alerted right away.',
}

const SHARED_REPORTS: FaqItem = {
  q: 'What happens after I report a problem?',
  a: 'The AID team reviews reports and updates the status you see under My reports: Received, In review, then Resolved. There is no chat or reply inside the app yet, so include anything we need to know in your message.',
}

export const FAQ: Record<SupportAudience, FaqItem[]> = {
  customer: [
    {
      q: 'How does a request work?',
      a: 'Choose a service, confirm where you are (and the drop-off for a tow) and send the request. The price is shown before you request. Nearby verified drivers with the right equipment can accept it; once one does, you see their name, vehicle, plate and location on the map until they arrive.',
    },
    {
      q: 'Can I cancel?',
      a: "Yes — until your driver arrives. Once the driver is with you, you can't cancel in the app; talk to your driver or report a problem. A driver can also cancel (with a reason) before service starts. No cancellation fee is charged.",
    },
    {
      q: 'What if no driver accepts my request?',
      a: "If no driver accepts within 15 minutes, the request ends on its own and you'll see \"No drivers were available\" with a button to request again. If a driver accepts but then stops responding for an hour before arriving, the job is cancelled so you can request again.",
    },
    {
      q: 'How do ratings work?',
      a: "After a completed job you can rate your driver once, within 7 days: 1–5 stars, optional tags and an optional private note that only the AID team sees. A driver's average is shown once they have at least 3 ratings; until then they show as \"New on AID\". Drivers rate customers the same way.",
    },
    SHARED_REPORTS,
    SHARED_SAFETY,
  ],
  driver: [
    {
      q: 'How do I get approved to drive?',
      a: 'Upload your driver\'s license, government ID, commercial auto insurance and vehicle registration, then submit. The AID team reviews each document. Once you are verified and have added your vehicle and equipment, you can go online.',
    },
    {
      q: 'Which requests do I see?',
      a: 'While you are online and sharing your location, you see open requests near you that your equipment can handle, nearest first. You can have one job at a time.',
    },
    {
      q: 'Can I cancel a job?',
      a: "Yes, with a reason, until you start the service. After that you can't cancel — complete the job or report a problem. The customer can cancel until you arrive.",
    },
    {
      q: 'What if I lose signal or stop responding?',
      a: "If an accepted job gets no location update or status change from you for 60 minutes before you arrive, it is cancelled automatically and the customer can request again. Requests no driver accepts within 15 minutes expire.",
    },
    {
      q: 'How do ratings work?',
      a: "After a completed job you can rate the customer once, within 7 days. Customers rate you the same way. Your average is shown to customers once you have at least 3 ratings; until then you show as \"New on AID\". Private notes are only seen by the AID team.",
    },
    SHARED_REPORTS,
    SHARED_SAFETY,
  ],
}
