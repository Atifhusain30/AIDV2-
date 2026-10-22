// B15: ratings both directions — the rules, in one place.
//   • Only the customer and the assigned driver of a COMPLETED booking can rate, once each, within
//     RATING_WINDOW_DAYS of completion, and never themselves.
//   • 1–5 whole stars; optional comment up to COMMENT_MAX characters; optional tags from the fixed
//     list for that direction.
//   • Comments are private: they go to admins only, never to the person rated.
//   • An average is shown to anyone but admins only once a person has MIN_RATINGS_TO_SHOW ratings;
//     below that the apps say "New on AID". One or two ratings swing an average too much to be fair.

const RATING_WINDOW_DAYS = 7;
const COMMENT_MAX = 500;
const MIN_RATINGS_TO_SHOW = 3;
// A rating at or below this is a "low rating" on the admin driver page.
const LOW_RATING_MAX_STARS = 2;

const RATING_TAGS = Object.freeze({
  // What a customer can say about their driver…
  customer: Object.freeze([
    { id: 'on_time', label: 'On time' },
    { id: 'professional', label: 'Professional' },
    { id: 'careful_with_vehicle', label: 'Careful with vehicle' },
    { id: 'friendly', label: 'Friendly' },
  ]),
  // …and a driver about their customer.
  driver: Object.freeze([
    { id: 'clear_location', label: 'Clear location' },
    { id: 'ready_on_arrival', label: 'Ready on arrival' },
    { id: 'respectful', label: 'Respectful' },
  ]),
});

const RATING_CODES = Object.freeze({
  notCompleted: 'rating_not_completed',
  windowClosed: 'rating_window_closed',
  alreadyRated: 'already_rated',
  noOneToRate: 'rating_no_ratee',
});

/** When the window to rate this booking closes (ISO), or null without a completion time. */
function ratingDeadline(completedAt, windowDays = RATING_WINDOW_DAYS) {
  const at = completedAt ? new Date(completedAt).getTime() : NaN;
  return Number.isFinite(at) ? new Date(at + windowDays * 86400000).toISOString() : null;
}

/** Validate a submitted rating for `role` (the rater). Returns { ok, rating } or { ok: false, error, field }. */
function cleanRating(body, role) {
  const allowed = RATING_TAGS[role];
  if (!allowed) return { ok: false, error: 'Only the customer or the driver of a job can rate it', field: 'role' };
  const input = body && typeof body === 'object' ? body : {};
  const { stars } = input;
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { ok: false, error: 'Choose 1 to 5 stars', field: 'stars' };
  let comment = null;
  if (input.comment !== undefined && input.comment !== null) {
    if (typeof input.comment !== 'string') return { ok: false, error: 'Comment must be text', field: 'comment' };
    const trimmed = input.comment.trim();
    if (trimmed.length > COMMENT_MAX) return { ok: false, error: `Keep the comment to ${COMMENT_MAX} characters or fewer`, field: 'comment' };
    comment = trimmed || null;
  }
  let tags = [];
  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== 'string')) return { ok: false, error: 'Tags must be a list', field: 'tags' };
    const ids = new Set(allowed.map((tag) => tag.id));
    const unknown = input.tags.find((tag) => !ids.has(tag));
    if (unknown !== undefined) return { ok: false, error: `"${unknown.slice(0, 40)}" isn't one of the options`, field: 'tags' };
    // Keep the fixed order and drop repeats.
    tags = allowed.map((tag) => tag.id).filter((id) => input.tags.includes(id));
  }
  return { ok: true, rating: { stars, comment, tags } };
}

/**
 * Can `role`/`userId` rate this booking now? `booking` is the participant's view (null when they
 * aren't a participant). Returns { ok, rateeId } or { ok: false, status, error, code }.
 */
function checkCanRate({ role, userId, booking, now = Date.now(), windowDays = RATING_WINDOW_DAYS }) {
  if (role !== 'customer' && role !== 'driver') return { ok: false, status: 403, error: 'Only the customer or the driver of a job can rate it' };
  if (!booking) return { ok: false, status: 404, error: 'Booking not found' };
  if (booking.status !== 'completed') return { ok: false, status: 409, code: RATING_CODES.notCompleted, error: 'Only completed jobs can be rated' };
  const deadline = ratingDeadline(booking.completedAt, windowDays);
  if (!deadline || now > new Date(deadline).getTime()) {
    return { ok: false, status: 409, code: RATING_CODES.windowClosed, error: `Jobs can be rated for ${windowDays} days after they're completed` };
  }
  const raterId = role === 'customer' ? booking.customerId : booking.driverId;
  const rateeId = role === 'customer' ? booking.driverId : booking.customerId;
  if (raterId !== userId) return { ok: false, status: 404, error: 'Booking not found' };
  if (!rateeId) return { ok: false, status: 409, code: RATING_CODES.noOneToRate, error: 'There is no one to rate on this job' };
  if (rateeId === userId) return { ok: false, status: 400, error: "You can't rate yourself" };
  return { ok: true, rateeId };
}

/**
 * What a customer or driver may see of someone's ratings: the average (1 decimal) only once there
 * are MIN_RATINGS_TO_SHOW, plus the count. Never comments.
 */
function publicRating(average, count, minimum = MIN_RATINGS_TO_SHOW) {
  const ratingCount = Number(count) || 0;
  const avg = average == null ? null : Number(average);
  return {
    rating: ratingCount >= minimum && Number.isFinite(avg) ? Math.round(avg * 10) / 10 : null,
    ratingCount,
  };
}

module.exports = {
  RATING_WINDOW_DAYS, COMMENT_MAX, MIN_RATINGS_TO_SHOW, LOW_RATING_MAX_STARS, RATING_TAGS, RATING_CODES,
  ratingDeadline, cleanRating, checkCanRate, publicRating,
};
