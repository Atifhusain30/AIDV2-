/**
 * B15 ratings on the client: how a rating is shown, and when to ask for one.
 *
 * Display: the server sends an average only once someone has MIN_RATINGS_TO_SHOW ratings
 * (server/ratings.js); below that the apps show "New on AID". One or two ratings swing an average
 * too much to be fair to a new driver. The client applies the same minimum as a second guard.
 *
 * Asking: right after a job (customer: on the receipt; driver: after completing), then — if
 * skipped — once more the next time the app opens, then never again for that job. The person can
 * still rate from the receipt until the 7-day window closes. Remembered per account on this device.
 */

export const MIN_RATINGS_TO_SHOW = 3

export interface RatingTag { id: string; label: string }

/** A completed job the signed-in person can still rate (GET /api/ratings/pending). */
export interface PendingRating {
  bookingId: string
  serviceName: string
  completedAt: string
  /** Who is being rated: the driver (customer rating) or the customer (driver rating). */
  rateeRole: 'driver' | 'customer'
  rateeFirstName: string
  /** When the window to rate closes (ISO). */
  rateBy: string
  tags: RatingTag[]
  commentMaxLength: number
}

export interface RatingInput { stars: number; tags: string[]; comment?: string }

/** "4.8 (12)" and a screen-reader label — or null when there's no average to show yet. */
export function ratingSummary(person: { rating?: number | null; ratingCount?: number } | null | undefined):
  { value: string; count: number; label: string } | null {
  if (!person || person.rating == null || !Number.isFinite(person.rating)) return null
  const count = person.ratingCount ?? 0
  if (count < MIN_RATINGS_TO_SHOW) return null
  const value = person.rating.toFixed(1)
  return { value, count, label: `Rated ${value} out of 5 from ${count} ratings` }
}

/** "12 jobs" for a driver card, or null before their first completed job. */
export function jobCountLabel(totalJobs: number | undefined): string | null {
  return totalJobs && totalJobs > 0 ? `${totalJobs} ${totalJobs === 1 ? 'job' : 'jobs'}` : null
}

export const STAR_WORDS = ['Poor', 'Fair', 'Okay', 'Good', 'Great'] as const

// ---- when to ask (per account, this device) ----

type PromptState = { skipped: string[]; reminded: string[] }
const KEEP = 50 // remember only the most recent jobs
const key = (userId: string) => `aid.ratingPrompts.${userId}`

function read(userId: string): PromptState {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) || '{}')
    return {
      skipped: Array.isArray(parsed.skipped) ? parsed.skipped.filter((id: unknown) => typeof id === 'string') : [],
      reminded: Array.isArray(parsed.reminded) ? parsed.reminded.filter((id: unknown) => typeof id === 'string') : [],
    }
  } catch {
    return { skipped: [], reminded: [] }
  }
}

function write(userId: string, state: PromptState) {
  try {
    localStorage.setItem(key(userId), JSON.stringify({ skipped: state.skipped.slice(-KEEP), reminded: state.reminded.slice(-KEEP) }))
  } catch { /* storage full or unavailable: worst case we ask once more */ }
}

/** The person chose "Skip" on the after-job sheet. */
export function markRatingSkipped(userId: string, bookingId: string) {
  const state = read(userId)
  if (!state.skipped.includes(bookingId)) write(userId, { ...state, skipped: [...state.skipped, bookingId] })
}

/** The one reminder on app open has been shown for this job. */
export function markRatingReminded(userId: string, bookingId: string) {
  const state = read(userId)
  if (!state.reminded.includes(bookingId)) write(userId, { ...state, reminded: [...state.reminded, bookingId] })
}

/** Open the sheet by itself on the receipt only if the person hasn't already skipped or been reminded. */
export function shouldAutoAsk(userId: string, bookingId: string): boolean {
  const state = read(userId)
  return !state.skipped.includes(bookingId) && !state.reminded.includes(bookingId)
}

/** The newest pending job that hasn't had its one reminder yet (never `except`, e.g. an open receipt). */
export function pickReminder(userId: string, pending: PendingRating[], except?: string | null): PendingRating | null {
  const { reminded } = read(userId)
  return pending.find((item) => item.bookingId !== except && !reminded.includes(item.bookingId)) || null
}
