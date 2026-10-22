/**
 * B18: help & support reports. One table (support_reports) holds every report a customer or driver
 * sends — general ones from Help & Support and job-linked ones from "Report an issue" on a job
 * (the B10 job issue reports, which used to live only on booking_events, are moved here by the
 * migration). Rules here; the API (app.js) is the only writer.
 *
 *   open ──▶ in_review ──▶ resolved
 *     │          ▲  │          │
 *     └──────────┼──┴──────────┘   (open → resolved directly; in_review → open; resolved → in_review to reopen)
 *
 * Reports are not an emergency channel: nobody is alerted when one arrives.
 */

const MESSAGE_MAX = 2000;
const NOTE_MAX = 2000;
const REPORTS_PER_HOUR = 10;

// Labels shown to the person reporting (mirrored in src/lib/support.ts; a test keeps them equal).
const CATEGORIES = Object.freeze({
  customer: Object.freeze({
    driver_behaviour: 'Driver behaviour',
    vehicle_damage: 'Damage to my vehicle',
    pricing: 'Pricing or charge',
    service_problem: "Service wasn't completed",
    app_problem: 'App problem',
    safety: 'Safety concern (non-emergency)',
    other: 'Other',
  }),
  driver: Object.freeze({
    customer_behaviour: 'Customer behaviour',
    payment: 'Payment or earnings',
    vehicle_damage: 'Damage to my vehicle or equipment',
    service_problem: "Service couldn't be completed",
    app_problem: 'App problem',
    safety: 'Safety concern (non-emergency)',
    other: 'Other',
  }),
});
const ALL_CATEGORIES = Object.freeze([...new Set([...Object.keys(CATEGORIES.customer), ...Object.keys(CATEGORIES.driver)])]);
// Admin labels name the side, e.g. "Damage to vehicle".
const ADMIN_CATEGORY_LABELS = Object.freeze({
  driver_behaviour: 'Driver behaviour', customer_behaviour: 'Customer behaviour', vehicle_damage: 'Vehicle or equipment damage',
  pricing: 'Pricing or charge', payment: 'Payment or earnings', service_problem: 'Service not completed',
  app_problem: 'App problem', safety: 'Safety concern', other: 'Other',
});

const STATUSES = Object.freeze(['open', 'in_review', 'resolved']);
// Allowed status changes (admin only).
const TRANSITIONS = Object.freeze({
  open: Object.freeze(['in_review', 'resolved']),
  in_review: Object.freeze(['open', 'resolved']),
  resolved: Object.freeze(['in_review']),
});
// Admin inbox filters: 'active' = open + in review (the default view).
const STATUS_FILTERS = Object.freeze({ active: ['open', 'in_review'], open: ['open'], in_review: ['in_review'], resolved: ['resolved'], all: [...STATUSES] });

// B10 job issue codes → B18 categories (used by the migration's backfill; kept here for the tests).
const LEGACY_ISSUE_CATEGORIES = Object.freeze({
  customer: { safety: 'safety', driver_issue: 'driver_behaviour', vehicle_damage: 'vehicle_damage', cannot_complete: 'service_problem', price: 'pricing', other: 'other', customer_issue: 'other' },
  driver: { safety: 'safety', customer_issue: 'customer_behaviour', vehicle_damage: 'vehicle_damage', cannot_complete: 'service_problem', price: 'payment', other: 'other', driver_issue: 'other' },
});

const isRole = (role) => role === 'customer' || role === 'driver';
const categoriesFor = (role) => (isRole(role) ? Object.entries(CATEGORIES[role]).map(([id, label]) => ({ id, label })) : []);
const categoryLabel = (role, category) => (isRole(role) && CATEGORIES[role][category]) || ADMIN_CATEGORY_LABELS[category] || category;

/**
 * Validate a new report from `role`. A message is required unless the report is tied to a job and
 * the category says enough on its own ("Other" always needs words). Returns { ok, report } or { ok:false, status, error, field }.
 */
function cleanReport(body, role) {
  if (!isRole(role)) return { ok: false, status: 403, error: 'Only customers and drivers can send reports' };
  const input = body && typeof body === 'object' ? body : {};
  const category = input.category;
  if (typeof category !== 'string' || !Object.hasOwn(CATEGORIES[role], category)) return { ok: false, status: 400, field: 'category', error: 'Choose what the problem is about' };
  if (input.message != null && typeof input.message !== 'string') return { ok: false, status: 400, field: 'message', error: 'Message must be text' };
  const message = (input.message || '').trim();
  if (message.length > MESSAGE_MAX) return { ok: false, status: 400, field: 'message', error: `Keep the message under ${MESSAGE_MAX} characters` };
  let bookingId = null;
  if (input.bookingId != null && input.bookingId !== '') {
    if (typeof input.bookingId !== 'string' || input.bookingId.length > 64) return { ok: false, status: 400, field: 'bookingId', error: 'That job could not be found' };
    bookingId = input.bookingId;
  }
  if (!message && (!bookingId || category === 'other')) return { ok: false, status: 400, field: 'message', error: 'Tell us what happened' };
  return { ok: true, report: { category, message, bookingId } };
}

/** Validate an admin update: { status?, note? } with at least one; the transition is checked against `current`. */
function checkAdminUpdate(body, current) {
  const input = body && typeof body === 'object' ? body : {};
  const status = input.status == null || input.status === '' ? null : input.status;
  if (input.note != null && typeof input.note !== 'string') return { ok: false, status: 400, error: 'Note must be text' };
  const note = (input.note || '').trim();
  if (note.length > NOTE_MAX) return { ok: false, status: 400, error: `Keep the note under ${NOTE_MAX} characters` };
  if (status !== null && !STATUSES.includes(status)) return { ok: false, status: 400, error: 'Status must be open, in_review or resolved' };
  if (status === null && !note) return { ok: false, status: 400, error: 'Change the status or add a note' };
  if (status !== null && current && status !== current && !TRANSITIONS[current].includes(status)) {
    return { ok: false, status: 409, error: `A report that is ${current.replace('_', ' ')} cannot be moved to ${status.replace('_', ' ')}` };
  }
  if (status !== null && current && status === current && !note) return { ok: false, status: 409, error: `This report is already ${current.replace('_', ' ')}` };
  return { ok: true, status: status === current ? null : status, note: note || null };
}

/** Public support contact from server config. Unset or malformed values are hidden, never invented. */
function supportContactFromEnv(env = process.env) {
  const email = String(env.SUPPORT_EMAIL || '').trim();
  const phone = String(env.SUPPORT_PHONE || '').trim();
  return {
    email: /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(email) && !/example\.|placeholder|your_/i.test(email) ? email : null,
    phone: /^\+?[0-9 ().-]{7,20}$/.test(phone) ? phone : null,
  };
}

module.exports = {
  MESSAGE_MAX, NOTE_MAX, REPORTS_PER_HOUR, CATEGORIES, ALL_CATEGORIES, ADMIN_CATEGORY_LABELS, STATUSES, TRANSITIONS, STATUS_FILTERS,
  LEGACY_ISSUE_CATEGORIES, categoriesFor, categoryLabel, cleanReport, checkAdminUpdate, supportContactFromEnv,
};
