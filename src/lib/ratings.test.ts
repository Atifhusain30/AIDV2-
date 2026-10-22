import { beforeEach, describe, expect, it } from 'vitest'
import {
  MIN_RATINGS_TO_SHOW, jobCountLabel, markRatingReminded, markRatingSkipped, pickReminder, ratingSummary, shouldAutoAsk, type PendingRating,
} from './ratings'

const pending = (bookingId: string): PendingRating => ({
  bookingId, serviceName: 'Towing', completedAt: '2026-10-22T12:00:00.000Z', rateeRole: 'driver', rateeFirstName: 'Marcus',
  rateBy: '2026-10-29T12:00:00.000Z', tags: [], commentMaxLength: 500,
})

beforeEach(() => localStorage.clear())

describe('rating display thresholds (B15)', () => {
  it('shows an average only from 3 ratings', () => {
    expect(MIN_RATINGS_TO_SHOW).toBe(3)
    expect(ratingSummary(null)).toBeNull()
    expect(ratingSummary({ rating: null, ratingCount: 0 })).toBeNull()
    expect(ratingSummary({ rating: 5, ratingCount: 1 })).toBeNull()
    expect(ratingSummary({ rating: 4.5, ratingCount: 2 })).toBeNull()
    expect(ratingSummary({ rating: 4, ratingCount: 3 })).toEqual({ value: '4.0', count: 3, label: 'Rated 4.0 out of 5 from 3 ratings' })
    expect(ratingSummary({ rating: 4.86, ratingCount: 41 })?.value).toBe('4.9')
  })

  it('counts jobs honestly', () => {
    expect(jobCountLabel(0)).toBeNull()
    expect(jobCountLabel(undefined)).toBeNull()
    expect(jobCountLabel(1)).toBe('1 job')
    expect(jobCountLabel(12)).toBe('12 jobs')
  })
})

describe('when to ask for a rating', () => {
  it('asks on the receipt until skipped, then reminds once on the next open, then never by itself', () => {
    expect(shouldAutoAsk('u1', 'b1')).toBe(true)
    markRatingSkipped('u1', 'b1')
    expect(shouldAutoAsk('u1', 'b1')).toBe(false)
    expect(pickReminder('u1', [pending('b1')])?.bookingId).toBe('b1')
    markRatingReminded('u1', 'b1')
    expect(pickReminder('u1', [pending('b1')])).toBeNull()
  })

  it('reminds about a job completed while the app was closed, but never the one whose receipt is open', () => {
    expect(pickReminder('u1', [pending('b2'), pending('b1')])?.bookingId).toBe('b2')
    expect(pickReminder('u1', [pending('b2'), pending('b1')], 'b2')?.bookingId).toBe('b1')
    expect(pickReminder('u1', [pending('b2')], 'b2')).toBeNull()
  })

  it('is remembered per account', () => {
    markRatingReminded('u1', 'b1')
    expect(pickReminder('u2', [pending('b1')])?.bookingId).toBe('b1')
  })

  it('survives unreadable storage', () => {
    localStorage.setItem('aid.ratingPrompts.u1', '{not json')
    expect(shouldAutoAsk('u1', 'b1')).toBe(true)
    markRatingSkipped('u1', 'b1')
    expect(shouldAutoAsk('u1', 'b1')).toBe(false)
  })
})
