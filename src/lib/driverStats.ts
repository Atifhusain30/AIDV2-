/**
 * Driver "Today" figures derived only from the driver's real job history (GET /api/bookings).
 * Earnings are not shown: payouts (B17) don't exist yet, and a job's price is what the customer
 * is charged, not what the driver is paid.
 */

import type { Booking } from '../types'

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

/** A rating is only shown once real ratings exist; the server default of 0 means "none yet". */
export function driverRatingLabel(driver: { rating?: number; totalJobs?: number } | null | undefined): string {
  return driver && (driver.rating ?? 0) > 0 && (driver.totalJobs ?? 0) > 0 ? driver.rating!.toFixed(1) : '—'
}

/** Greeting that matches the driver's local time of day. */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
