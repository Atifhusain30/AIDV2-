/**
 * B12: chat between the customer and the driver of a job (text only), and blocking — the rules.
 *
 *   searching ─▶ accepted / en_route / arrived / in_progress ─▶ completed / cancelled
 *   (no chat)    ◀────────────── open: both can send ─────────▶  read-only for 24 h, then hidden
 *                                                                 from the apps (admins keep it)
 *
 *   • Only the job's own customer and its assigned driver take part; anyone else gets 404.
 *   • A block (either direction, between these two people) closes the chat for good and keeps them
 *     apart in dispatch. It never cancels the job by itself.
 *   • Messages carry no phone number, email or account id of either person — only "mine or theirs",
 *     the sender's role, the text and times. What people type themselves is sent as typed.
 *   • 30 messages a minute per person; 1–1000 characters after trimming; control characters removed.
 */

const MESSAGE_MAX = 1000;
const MESSAGES_PER_MINUTE = 30;
const READ_ONLY_HOURS = 24;
// Statuses in which both people can send (same as when contact details are shared).
const OPEN_STATUSES = Object.freeze(['accepted', 'en_route', 'arrived', 'in_progress']);
// Ended jobs whose chat stays readable for READ_ONLY_HOURS.
const ENDED_STATUSES = Object.freeze(['completed', 'cancelled']);
// Polling page size: the newest messages first time, then everything after the cursor.
const PAGE_SIZE = 200;

const CHAT_CODES = Object.freeze({
  notOpen: 'chat_not_open', // no driver yet
  readOnly: 'chat_read_only',
  closed: 'chat_closed', // past the read-only window
  blocked: 'chat_blocked',
  rateLimited: 'chat_rate_limited',
  noOneToBlock: 'block_no_party',
});

/** When the read-only window of an ended job closes (ISO), or null. */
function readOnlyUntil(booking, hours = READ_ONLY_HOURS) {
  if (!booking || !ENDED_STATUSES.includes(booking.status)) return null;
  const ended = booking.status === 'completed' ? booking.completedAt : booking.cancelledAt;
  const at = ended ? new Date(ended).getTime() : NaN;
  return Number.isFinite(at) ? new Date(at + hours * 3600000).toISOString() : null;
}

/**
 * The chat state for one participant. `booking` is their own view (customerId/driverId/status/
 * completedAt/cancelledAt); `block` is { byMe, byThem } between the two of them.
 *   open       — both can send
 *   read_only  — job ended < 24 h ago: history visible, no sending
 *   blocked    — either blocked the other: history visible, no sending (until the job's chat is hidden)
 *   closed     — job ended ≥ 24 h ago: hidden from the apps
 *   unavailable — no driver has accepted (nobody to talk to)
 */
function chatState(booking, block = {}, now = Date.now(), hours = READ_ONLY_HOURS) {
  if (!booking || !booking.driverId || !booking.customerId) return 'unavailable';
  const live = OPEN_STATUSES.includes(booking.status);
  const until = readOnlyUntil(booking, hours);
  const visible = live || (until !== null && now < new Date(until).getTime());
  if (!visible) return ENDED_STATUSES.includes(booking.status) ? 'closed' : 'unavailable';
  if (block.byMe || block.byThem) return 'blocked';
  return live ? 'open' : 'read_only';
}

/** Plain-language reason a message can't be sent in `state` (409), or null when it can. */
function sendRefusal(state) {
  switch (state) {
    case 'open': return null;
    case 'read_only': return { code: CHAT_CODES.readOnly, error: 'This job has ended, so the chat is read-only.' };
    case 'blocked': return { code: CHAT_CODES.blocked, error: 'Chat is closed for this job.' };
    case 'closed': return { code: CHAT_CODES.closed, error: 'This chat is no longer available.' };
    default: return { code: CHAT_CODES.notOpen, error: 'You can message once a driver accepts the request.' };
  }
}

// C0 controls except tab/newline, DEL, C1 controls, and bidi overrides/zero-width marks that can
// disguise text. Carriage returns become newlines.
// eslint-disable-next-line no-control-regex
const STRIP = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Validate a message body. Returns { ok, body } or { ok: false, error, field }. */
function cleanMessage(input) {
  const raw = input && typeof input === 'object' ? input.body : undefined;
  if (typeof raw !== 'string') return { ok: false, field: 'body', error: 'Write a message' };
  const body = raw.replace(/\r\n?/g, '\n').replace(STRIP, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!body) return { ok: false, field: 'body', error: 'Write a message' };
  if (body.length > MESSAGE_MAX) return { ok: false, field: 'body', error: `Keep messages to ${MESSAGE_MAX} characters or fewer` };
  let clientId = null;
  if (input.clientId != null && input.clientId !== '') {
    if (typeof input.clientId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(input.clientId)) return { ok: false, field: 'clientId', error: 'Invalid message id' };
    clientId = input.clientId;
  }
  return { ok: true, body, clientId };
}

/** Parse the ?after= cursor: a non-negative integer (as a string, seq is bigint), or null for "latest page". */
function parseCursor(value) {
  if (value === undefined || value === null || value === '') return { ok: true, after: null };
  const text = String(value);
  if (!/^\d{1,18}$/.test(text)) return { ok: false };
  return { ok: true, after: text };
}

/** Who the other participant is for `role` on this booking. */
function otherParty(booking, role) {
  if (!booking) return null;
  return role === 'customer' ? booking.driverId || null : role === 'driver' ? booking.customerId || null : null;
}

/** What to tell someone who just blocked the other person during a job that's still going. */
function blockGuidance(role, status) {
  if (!OPEN_STATUSES.includes(status)) return null;
  if (role === 'customer') {
    return ['accepted', 'en_route'].includes(status)
      ? "Blocking doesn't cancel this job. You can cancel the request until your driver arrives, or report a problem to AID. If you're in danger, call 911."
      : "Blocking doesn't cancel this job, and it can't be cancelled in the app after your driver arrives. Report a problem to AID. If you're in danger, call 911.";
  }
  return status === 'in_progress'
    ? "Blocking doesn't cancel this job, and service has started so it can't be cancelled. Report an issue to AID. If you're in danger, call 911."
    : "Blocking doesn't cancel this job. You can cancel it with a reason before service starts, or report an issue to AID. If you're in danger, call 911.";
}

module.exports = {
  MESSAGE_MAX, MESSAGES_PER_MINUTE, READ_ONLY_HOURS, OPEN_STATUSES, ENDED_STATUSES, PAGE_SIZE, CHAT_CODES,
  readOnlyUntil, chatState, sendRefusal, cleanMessage, parseCursor, otherParty, blockGuidance,
};
