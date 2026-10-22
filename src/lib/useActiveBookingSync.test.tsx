import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useActiveBookingSync, BOOKING_POLL_MS } from './useActiveBookingSync'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { apiService } from '../services/api'
import type { Booking } from '../types'

vi.mock('../services/api', () => ({ apiService: { getBooking: vi.fn() } }))
vi.mock('../lib/notifications', () => ({ notifyBookingStatus: vi.fn(), initNotifications: vi.fn() }))

const job = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-9', customerId: 'customer-1', status: 'en_route',
  service: { id: 'flat_tire', name: 'Flat tire', description: '', basePrice: 79, estimatedTime: 35 },
  location: { address: '500 Elm St', lat: 33.21, lng: -97.13 }, estimatedPrice: 79, createdAt: new Date(),
  driver: { id: 'driver-1', name: 'Marcus T.', firstName: 'Marcus', rating: 4.9, totalJobs: 3, vehicle: null },
  ...overrides,
})

function Harness() { useActiveBookingSync(); return null }
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useAuthStore.setState({ token: 'token-1' })
  useAppStore.setState({ activeBooking: job({ status: 'accepted' }), bookingHistory: [job({ status: 'accepted' })], endedBookingNotice: null, receiptBookingId: null })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('active booking sync', () => {
  it('polls the server and applies the latest driver location', async () => {
    vi.mocked(apiService.getBooking).mockResolvedValue({ success: true, data: job({ driverLocation: { lat: 33.15, lng: -97.05, updatedAt: new Date().toISOString() } }) })
    render(<Harness />)
    await flush()
    expect(apiService.getBooking).toHaveBeenCalledWith('booking-9')
    expect(useAppStore.getState().activeBooking?.driverLocation).toMatchObject({ lat: 33.15, lng: -97.05 })
    await act(async () => { vi.advanceTimersByTime(BOOKING_POLL_MS) })
    await flush()
    expect(apiService.getBooking).toHaveBeenCalledTimes(2)
  })

  it('stops and tells the customer when the job is cancelled', async () => {
    vi.mocked(apiService.getBooking).mockResolvedValue({ success: true, data: job({ status: 'cancelled' }) })
    render(<Harness />)
    await flush()
    expect(useAppStore.getState().activeBooking).toBeNull()
    expect(useAppStore.getState().endedBookingNotice).toEqual({ bookingId: 'booking-9', serviceName: 'Flat tire', driverName: 'Marcus' })
    await act(async () => { vi.advanceTimersByTime(BOOKING_POLL_MS * 3) })
    expect(apiService.getBooking).toHaveBeenCalledTimes(1)
  })

  it('opens the receipt when the job is completed', async () => {
    vi.mocked(apiService.getBooking).mockResolvedValue({ success: true, data: job({ status: 'completed' }) })
    render(<Harness />)
    await flush()
    expect(useAppStore.getState().activeBooking).toBeNull()
    expect(useAppStore.getState().receiptBookingId).toBe('booking-9')
    expect(useAppStore.getState().endedBookingNotice).toBeNull()
  })

  it('does nothing for signed-out guests', async () => {
    useAuthStore.setState({ token: null })
    render(<Harness />)
    await flush()
    expect(apiService.getBooking).not.toHaveBeenCalled()
  })
})
