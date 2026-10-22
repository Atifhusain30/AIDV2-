import { describe, expect, it } from 'vitest'
import { completedTodayCount, driverRatingLabel, timeOfDayGreeting } from './driverStats'

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

  it('shows a rating only when real ratings exist', () => {
    expect(driverRatingLabel({ rating: 0, totalJobs: 0 })).toBe('—')
    expect(driverRatingLabel({ rating: 4.8, totalJobs: 0 })).toBe('—')
    expect(driverRatingLabel(null)).toBe('—')
    expect(driverRatingLabel({ rating: 4.76, totalJobs: 12 })).toBe('4.8')
  })

  it('greets by time of day', () => {
    expect(timeOfDayGreeting(new Date(2026, 0, 1, 8))).toBe('Good morning')
    expect(timeOfDayGreeting(new Date(2026, 0, 1, 13))).toBe('Good afternoon')
    expect(timeOfDayGreeting(new Date(2026, 0, 1, 20))).toBe('Good evening')
  })
})
