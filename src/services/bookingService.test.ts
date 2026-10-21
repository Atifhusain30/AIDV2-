import { beforeEach, describe, expect, it } from 'vitest'
import type { Booking } from '../types'
import { useAppStore } from '../store/useAppStore'
import { reconcileManagedBooking } from './bookingService'

const completedBooking = {
  id: 'booking-complete',
  customerId: 'customer-1',
  service: { id: 'towing', name: 'Towing', description: '', basePrice: 125, estimatedTime: 60 },
  status: 'completed',
  location: { address: '100 Main Street', lat: 32.77, lng: -96.79 },
  estimatedPrice: 125,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  completedAt: new Date('2026-01-01T01:00:00Z'),
} as Booking

describe('managed booking reconciliation', () => {
  beforeEach(() => {
    useAppStore.setState({ activeBooking: completedBooking, bookingHistory: [completedBooking], receiptBookingId: null })
  })

  it('opens the receipt and clears active work when the backend completes a booking', () => {
    reconcileManagedBooking(completedBooking)

    expect(useAppStore.getState().activeBooking).toBeNull()
    expect(useAppStore.getState().receiptBookingId).toBe(completedBooking.id)
    expect(useAppStore.getState().bookingHistory[0].status).toBe('completed')
  })
})
