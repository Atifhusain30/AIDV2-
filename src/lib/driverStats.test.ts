import { describe, expect, it } from 'vitest'
import { completedTodayCount, driverRatingLabel, driverRatingNote, timeOfDayGreeting } from './driverStats'

describe('driver today figures', () => {
  const now = new Date(2026, 9, 22, 15, 0)

  it('counts only jobs completed today (local time)', () => {
    expect(completedTodayCount([
      { status: 'completed', completedAt: new Date(2026, 9, 22, 0, 5) },
      { status: 'completed', completedAt: new Date(2026, 9, 22, 14, 59) },
      { status: 'completed', completedAt: new Date(2026, 9, 21, 23, 59) },
      { status: 'completed', completedAt: undefined },
      { status: 'cancelled', completedAt: new Date(2026, 9, 22, 10, 0) },
    ], now)).toBe(2)
    expect(completedTodayCount([], now)).toBe(0)
  })

  it('shows the real rating only once 3 customers have rated (B15)', () => {
    expect(driverRatingLabel({ rating: null, ratingCount: 0 })).toBe('—')
    expect(driverRatingLabel({ rating: 4.8, ratingCount: 2 })).toBe('—')
    expect(driverRatingLabel(null)).toBe('—')
    expect(driverRatingLabel({ rating: 4.76, ratingCount: 12 })).toBe('4.8')
    expect(driverRatingLabel({ rating: 4, ratingCount: 3 })).toBe('4.0')
  })

  it('explains when the rating will appear', () => {
    expect(driverRatingNote({ rating: null, ratingCount: 0 })).toBe('Your rating shows once 3 customers have rated you.')
    expect(driverRatingNote({ rating: null, ratingCount: 2 })).toBe('Your rating shows once 3 customers have rated you (2 so far).')
    expect(driverRatingNote({ rating: 4.6, ratingCount: 7 })).toBe('Rating from 7 customer ratings.')
  })

  it('greets by time of day', () => {
    expect(timeOfDayGreeting(new Date(2026, 0, 1, 8))).toBe('Good morning')
    expect(timeOfDayGreeting(new Date(2026, 0, 1, 13))).toBe('Good afternoon')
    expect(timeOfDayGreeting(new Date(2026, 0, 1, 20))).toBe('Good evening')
  })
})
