/**
 * Client mirror of the server's job lifecycle (server/lifecycle.js is authoritative — the server
 * rejects anything else). Used to pick the one next action, the cancel options and the copy.
 *
 *   accepted → en_route → arrived → in_progress → completed
 *   Customer cancels: before the driver arrives (pending, searching, accepted, en_route).
 *   Driver cancels:   with a reason, before service starts (accepted, en_route, arrived).
 *   After service starts: no cancelling — complete the job or report an issue.
 */

import type { Booking, BookingStatus } from '../types'

export const CUSTOMER_CANCELLABLE: ReadonlySet<BookingStatus> = new Set<BookingStatus>(['pending', 'searching', 'accepted', 'en_route'])
export const DRIVER_CANCELLABLE: ReadonlySet<BookingStatus> = new Set<BookingStatus>(['accepted', 'en_route', 'arrived'])
export const REPORTABLE: ReadonlySet<BookingStatus> = new Set<BookingStatus>(['accepted', 'en_route', 'arrived', 'in_progress'])
export const isJobOver = (status: BookingStatus) => status === 'completed' || status === 'cancelled' || status === 'expired'
/** Server answer codes (server/app.js). */
export const ACTIVE_REQUEST_CODE = 'active_request_exists'
export const REQUEST_EXPIRED_CODE = 'request_expired'

export interface Choice { id: string; label: string }

// Codes must match server/lifecycle.js.
export const DRIVER_CANCEL_REASONS: Choice[] = [
  { id: 'cannot_reach_customer', label: "Can't reach the customer" },
  { id: 'vehicle_problem', label: 'Problem with my vehicle or equipment' },
  { id: 'customer_asked', label: 'Customer asked me to cancel' },
  { id: 'unsafe_location', label: 'Location is unsafe or inaccessible' },
  { id: 'wrong_service', label: 'Job needs a different service' },
  { id: 'other', label: 'Other' },
]
export const CUSTOMER_CANCEL_REASONS: Choice[] = [
  { id: 'no_longer_needed', label: 'No longer need help' },
  { id: 'found_other_help', label: 'Found other help' },
  { id: 'wait_too_long', label: 'Wait is too long' },
  { id: 'wrong_details', label: 'Wrong location or details' },
  { id: 'other', label: 'Other' },
]
export const DRIVER_ISSUES: Choice[] = [
  { id: 'safety', label: 'Safety concern' },
  { id: 'customer_issue', label: 'Problem with the customer' },
  { id: 'vehicle_damage', label: 'Vehicle damage' },
  { id: 'cannot_complete', label: "Service can't be completed" },
  { id: 'price', label: 'Price or payment question' },
  { id: 'other', label: 'Something else' },
]
export const CUSTOMER_ISSUES: Choice[] = [
  { id: 'safety', label: 'Safety concern' },
  { id: 'driver_issue', label: 'Problem with the driver' },
  { id: 'vehicle_damage', label: 'Damage to my vehicle' },
  { id: 'cannot_complete', label: "Service can't be completed" },
  { id: 'price', label: 'Price or payment question' },
  { id: 'other', label: 'Something else' },
]

export interface DriverAction {
  next: BookingStatus
  label: string
  /** One line under the button saying when to tap it. */
  hint: string
  /** Completing ends the job, so it asks first. */
  confirm: boolean
}

type JobLike = Pick<Booking, 'status' | 'dropoffLocation'>
const isTow = (job: JobLike) => Boolean(job.dropoffLocation)

/** The single primary action for the driver's current step (null once the job is over). */
export function driverNextAction(job: JobLike, customerName = 'the customer'): DriverAction | null {
  switch (job.status) {
    case 'accepted': return { next: 'en_route', label: 'Start driving', hint: `Lets ${customerName} know you're on the way`, confirm: false }
    case 'en_route': return { next: 'arrived', label: "I've arrived", hint: isTow(job) ? 'Tap when you reach the pickup' : 'Tap when you reach the service location', confirm: false }
    case 'arrived': return isTow(job)
      ? { next: 'in_progress', label: 'Start tow', hint: 'Tap once the vehicle is loaded and you leave for the drop-off', confirm: false }
      : { next: 'in_progress', label: 'Start service', hint: 'Tap when you start working on the vehicle', confirm: false }
    case 'in_progress': return { next: 'completed', label: 'Complete job', hint: isTow(job) ? 'Tap once the vehicle is dropped off' : 'Tap when the service is finished', confirm: true }
    default: return null
  }
}

/** What the customer sees on the home card for each status. */
export function customerStatusLine(job: JobLike & { driver?: { firstName?: string } }): string {
  const name = job.driver?.firstName
  switch (job.status) {
    case 'pending':
    case 'searching': return 'Finding your driver'
    case 'accepted': return name ? `${name} accepted your request` : 'Driver confirmed'
    case 'en_route': return name ? `${name} is on the way` : 'Your driver is on the way'
    case 'arrived': return name ? `${name} has arrived` : 'Your driver has arrived'
    case 'in_progress': return isTow(job)
      ? (name ? `${name} is towing your vehicle` : 'Towing to drop-off')
      : (name ? `${name} is working on your vehicle` : 'Service in progress')
    case 'completed': return 'Service complete'
    case 'cancelled': return 'Request cancelled'
    case 'expired': return 'No drivers were available'
  }
}

/** Confirmation text before the customer cancels, by status. */
export function customerCancelText(status: BookingStatus, driverName = 'Your driver'): string {
  if (status === 'en_route') return `${driverName} is already on the way and will be told you no longer need help.`
  if (status === 'accepted') return `${driverName} has already accepted and will be told you no longer need help.`
  return "We'll stop looking for a driver."
}

/** Why the customer can no longer cancel. */
export function customerNoCancelText(status: BookingStatus, driverName = 'Your driver'): string | null {
  if (status === 'arrived') return `${driverName} is here, so this request can't be cancelled in the app. Talk to ${driverName} or report a problem.`
  if (status === 'in_progress') return "Service has started, so this request can't be cancelled. Report a problem if something is wrong."
  return null
}
