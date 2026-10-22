/**
 * The one authoritative job lifecycle. Every booking status change goes through checkTransition().
 *
 *   searching ──accept (driver)──▶ accepted ─▶ en_route ─▶ arrived ─▶ in_progress ─▶ completed
 *        │                             │           │           │
 *        └── customer cancel ──────────┴───────────┘           │   (customer: before the driver arrives)
 *                                      └── driver cancel ──────┘   (driver: with a reason, before service starts)
 *
 * After in_progress nobody can cancel: the driver completes the job, or either side reports an issue.
 *
 * The server itself (E4, never a person) ends stale work, with an audit event (actor null, role 'system'):
 *   pending/searching ──no driver within REQUEST_EXPIRY_MINUTES (default 15)──▶ expired   (reason no_driver_found)
 *   accepted/en_route ──driver silent for STALE_JOB_MINUTES (default 60)───────▶ cancelled (reason driver_unresponsive)
 * "Silent" = no location update and no status change. arrived/in_progress are never ended automatically:
 * the driver is with the customer, and either side can report an issue.
 * Towing uses in_progress for "vehicle loaded, heading to the drop-off".
 * Cancellation fees are not charged anywhere (no policy yet — see LAUNCH_CHECKLIST A9/C3).
 */

const DRIVER_STEPS = Object.freeze({ accepted: 'en_route', en_route: 'arrived', arrived: 'in_progress', in_progress: 'completed' });
const CUSTOMER_CANCELLABLE = Object.freeze(['pending', 'searching', 'accepted', 'en_route']);
const DRIVER_CANCELLABLE = Object.freeze(['accepted', 'en_route', 'arrived']);
const TERMINAL = new Set(['completed', 'cancelled', 'expired']);
// Statuses in which a customer has an open request (one at a time; see E4) — also the partial unique index.
const ACTIVE_STATUSES = Object.freeze(['pending', 'searching', 'accepted', 'en_route', 'arrived', 'in_progress']);
// What the server may end on its own, and why (stored as metadata.reason on the audit event).
const EXPIRABLE = Object.freeze(['pending', 'searching']);
const STALE_RELEASABLE = Object.freeze(['accepted', 'en_route']);
const SYSTEM_END_REASONS = Object.freeze({
  no_driver_found: 'No driver accepted the request in time',
  driver_unresponsive: 'The driver stopped responding',
});

const DEFAULT_REQUEST_EXPIRY_MINUTES = 15;
const DEFAULT_STALE_JOB_MINUTES = 60;
const DEFAULT_EXPIRY_SWEEP_SECONDS = 60;
function intFromEnv(value, fallback, min, max) {
  const number = Number(value);
  return value != null && value !== '' && Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}
/** E4 timing from the environment, with safe defaults (missing or out-of-range values use the default). */
function expiryConfigFromEnv(env = process.env) {
  return {
    requestExpiryMinutes: intFromEnv(env.REQUEST_EXPIRY_MINUTES, DEFAULT_REQUEST_EXPIRY_MINUTES, 1, 240),
    staleJobMinutes: intFromEnv(env.STALE_JOB_MINUTES, DEFAULT_STALE_JOB_MINUTES, 15, 1440),
    sweepSeconds: intFromEnv(env.EXPIRY_SWEEP_SECONDS, DEFAULT_EXPIRY_SWEEP_SECONDS, 5, 3600),
  };
}
// Statuses where either party can file an issue report on the job.
const REPORTABLE = Object.freeze(['accepted', 'en_route', 'arrived', 'in_progress']);

const DRIVER_CANCEL_REASONS = Object.freeze({
  vehicle_problem: 'Problem with my vehicle or equipment',
  cannot_reach_customer: "Can't reach the customer",
  customer_asked: 'Customer asked me to cancel',
  unsafe_location: 'Location is unsafe or inaccessible',
  wrong_service: 'Job needs a different service',
  other: 'Other',
});
const CUSTOMER_CANCEL_REASONS = Object.freeze({
  no_longer_needed: 'No longer need help',
  found_other_help: 'Found other help',
  wait_too_long: 'Wait is too long',
  wrong_details: 'Wrong location or details',
  other: 'Other',
});
const ISSUE_CATEGORIES = Object.freeze({
  safety: 'Safety concern',
  customer_issue: 'Problem with the customer',
  driver_issue: 'Problem with the driver',
  vehicle_damage: 'Vehicle damage',
  cannot_complete: "Service can't be completed",
  price: 'Price or payment question',
  other: 'Other',
});

/** Statuses `role` may move a booking *from* to reach `next`, or null when `role` can never set `next`. */
function allowedFrom(role, next) {
  if (role === 'driver') {
    if (next === 'cancelled') return [...DRIVER_CANCELLABLE];
    const from = Object.keys(DRIVER_STEPS).filter((status) => DRIVER_STEPS[status] === next);
    return from.length ? from : null;
  }
  if (role === 'customer') return next === 'cancelled' ? [...CUSTOMER_CANCELLABLE] : null;
  return null;
}

/** A plain-language reason the move from `current` to `next` is not allowed (status 409). */
function rejection(role, current, next) {
  if (current === next) return `This job is already ${label(current)}.`;
  if (current === 'expired') return 'This request expired because no driver accepted it in time. Request again to keep looking.';
  if (TERMINAL.has(current)) return `This job was already ${label(current)}.`;
  if (next === 'cancelled') {
    if (role === 'customer') {
      return current === 'in_progress'
        ? 'Service has already started, so this request can no longer be cancelled. Report a problem if something is wrong.'
        : 'Your driver has already arrived, so this request can no longer be cancelled in the app. Talk to your driver or report a problem.';
    }
    if (current === 'in_progress') return 'Service has started, so this job can no longer be cancelled. Complete it or report an issue.';
    return 'This job cannot be cancelled right now.';
  }
  const expected = DRIVER_STEPS[current];
  return expected
    ? `Do one step at a time: this job is ${label(current)}, so the next step is ${label(expected)}.`
    : `This job is ${label(current)} and cannot move to ${label(next)}.`;
}

const LABELS = {
  pending: 'pending', searching: 'waiting for a driver', accepted: 'accepted', en_route: 'on the way', arrived: 'arrived',
  in_progress: 'in service', completed: 'completed', cancelled: 'cancelled', expired: 'expired',
};
const label = (status) => LABELS[status] || String(status);

/**
 * Step 1 — is this kind of change ever allowed for this party? Checked before loading the booking.
 * Returns { ok: true, from, reason } or { ok: false, status, error }.
 */
function checkRequest({ role, next, reason }) {
  if (role !== 'driver' && role !== 'customer') return { ok: false, status: 403, error: 'Only the customer or the assigned driver can change this job' };
  const from = allowedFrom(role, next);
  if (!from) return { ok: false, status: 400, error: 'Status transition is not allowed' };
  let cleanReason = null;
  if (next === 'cancelled') {
    const reasons = role === 'driver' ? DRIVER_CANCEL_REASONS : CUSTOMER_CANCEL_REASONS;
    if (reason != null && reason !== '' && !Object.hasOwn(reasons, reason)) return { ok: false, status: 400, error: 'Unsupported cancellation reason' };
    if (role === 'driver' && !reason) return { ok: false, status: 400, error: 'A reason is required to cancel a job' };
    cleanReason = reason || null;
  }
  return { ok: true, from, reason: cleanReason };
}

/**
 * Step 2 — is it allowed from where this booking is now? `booking` is the caller's own booking
 * (null when it is missing or belongs to someone else → 404, so other parties learn nothing).
 */
function checkTransition({ role, booking, next, reason }) {
  const request = checkRequest({ role, next, reason });
  if (!request.ok) return request;
  if (!booking) return { ok: false, status: 404, error: 'Booking not found' };
  if (!request.from.includes(booking.status)) return { ok: false, status: 409, error: rejection(role, booking.status, next), currentStatus: booking.status };
  return { ok: true, from: booking.status, reason: request.reason };
}

module.exports = {
  DRIVER_STEPS, CUSTOMER_CANCELLABLE, DRIVER_CANCELLABLE, REPORTABLE, TERMINAL,
  ACTIVE_STATUSES, EXPIRABLE, STALE_RELEASABLE, SYSTEM_END_REASONS, expiryConfigFromEnv,
  DEFAULT_REQUEST_EXPIRY_MINUTES, DEFAULT_STALE_JOB_MINUTES, DEFAULT_EXPIRY_SWEEP_SECONDS,
  DRIVER_CANCEL_REASONS, CUSTOMER_CANCEL_REASONS, ISSUE_CATEGORIES,
  allowedFrom, checkRequest, checkTransition,
};
