/**
 * Driver "Today" figures derived only from the driver's real job history (GET /api/bookings).
 * Earnings are not shown: payouts (B17) don't exist yet, and a job's price is what the customer
 * is charged, not what the driver is paid.
 */

import type { Booking } from '../types'
import { MIN_RATINGS_TO_SHOW, ratingSummary } from './ratings'

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Jobs this driver completed today (local time), counted from server booking records. */
export function completedTodayCount(bookings: Pick<Booking, 'status' | 'completedAt'>[], now: Date = new Date()): number {
  return bookings.filter((booking) => {
    if (booking.status !== 'completed' || !booking.completedAt) return false
    const completedAt = new Date(booking.completedAt)
    return !Number.isNaN(completedAt.getTime()) && sameLocalDay(completedAt, now)
  }).length
}

type RatedDriver = { rating?: number | null; ratingCount?: number } | null | undefined

/** B15: the driver's real average from customer ratings, or '—' until there are enough to show. */
export function driverRatingLabel(driver: RatedDriver): string {
  return ratingSummary(driver)?.value ?? '—'
}

/** What the Today note says about the rating. */
export function driverRatingNote(driver: RatedDriver): string {
  const summary = ratingSummary(driver)
  if (summary) return `Rating from ${summary.count} customer ${summary.count === 1 ? 'rating' : 'ratings'}.`
  const count = driver?.ratingCount ?? 0
  return `Your rating shows once ${MIN_RATINGS_TO_SHOW} customers have rated you${count > 0 ? ` (${count} so far)` : ''}.`
}

/** Greeting that matches the driver's local time of day. */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
