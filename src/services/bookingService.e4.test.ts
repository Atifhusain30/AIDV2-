import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking } from '../types'
import { useAppStore } from '../store/useAppStore'
import { apiService } from './api'
import { offerAlerts } from '../lib/alertsPrompt'
import { reconcileManagedBooking, requestAndStartBooking, settleStaleActiveBooking } from './bookingService'

vi.mock('./api', () => ({ apiService: { createBooking: vi.fn(), getActiveBooking: vi.fn(), getBooking: vi.fn() } }))
vi.mock('../lib/alertsPrompt', () => ({ offerAlerts: vi.fn(async () => undefined) }))

const booking = (overrides: Partial<Booking> = {}) => ({
  id: 'booking-1',
  customerId: 'customer-1',
  service: { id: 'battery_jump', name: "Won't start", description: '', basePrice: 69, estimatedTime: 30 },
  status: 'searching',
  location: { address: '100 Main Street', lat: 32.77, lng: -96.79 },
  estimatedPrice: 69,
  createdAt: new Date('2026-10-22T12:00:00Z'),
  ...overrides,
}) as Booking

const input = {
  service: { id: 'flat_tire', name: 'Flat tire', description: '', basePrice: 79, estimatedTime: 35 },
  locationLabel: '500 Elm St', locationCoords: { lat: 33, lng: -97 },
} as Parameters<typeof requestAndStartBooking>[0]

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ activeBooking: null, bookingHistory: [], endedBookingNotice: null, activeRequestRedirect: false })
})

describe('one active request per customer (E4)', () => {
  it('takes the customer to the request they already have instead of erroring', async () => {
    const existing = booking({ id: 'booking-existing', status: 'en_route' })
    vi.mocked(apiService.createBooking).mockResolvedValue({ success: false, error: 'You already have an active request.', code: 'active_request_exists' })
    vi.mocked(apiService.getActiveBooking).mockResolvedValue({ success: true, data: existing })

    const outcome = await requestAndStartBooking(input)

    expect(outcome).toEqual({ booking: existing, alreadyActive: true })
    expect(useAppStore.getState().activeBooking?.id).toBe('booking-existing')
    expect(useAppStore.getState().bookingHistory.map((item) => item.id)).toEqual(['booking-existing'])
  })

  it('still reports other refusals as errors', async () => {
    vi.mocked(apiService.createBooking).mockResolvedValue({ success: false, error: 'A valid service location is required' })
    await expect(requestAndStartBooking(input)).rejects.toThrow('A valid service location is required')
    expect(apiService.getActiveBooking).not.toHaveBeenCalled()
  })

  it('a new request clears any earlier "already in progress" notice', async () => {
    useAppStore.setState({ activeRequestRedirect: true })
    vi.mocked(apiService.createBooking).mockResolvedValue({ success: true, data: booking({ id: 'booking-new' }) })
    expect(await requestAndStartBooking(input)).toEqual({ booking: expect.objectContaining({ id: 'booking-new' }), alreadyActive: false })
    expect(useAppStore.getState().activeRequestRedirect).toBe(false)
    // Sending a request is the contextual moment to offer alerts (explainer, then system prompt).
    expect(offerAlerts).toHaveBeenCalledWith('customer')
  })

  it('does not offer alerts when the customer was only taken to an existing request', async () => {
    vi.mocked(apiService.createBooking).mockResolvedValue({ success: false, error: 'busy', code: 'active_request_exists' })
    vi.mocked(apiService.getActiveBooking).mockResolvedValue({ success: true, data: booking({ id: 'booking-existing' }) })
    await requestAndStartBooking(input)
    expect(offerAlerts).not.toHaveBeenCalled()
  })
})

describe('requests the server ended on its own (E4)', () => {
  it('an expired request ends with "no drivers were available"', () => {
    useAppStore.setState({ activeBooking: booking(), bookingHistory: [booking()] })
    reconcileManagedBooking(booking({ status: 'expired', endReason: 'no_driver_found' }))
    expect(useAppStore.getState().activeBooking).toBeNull()
    expect(useAppStore.getState().endedBookingNotice).toEqual({ bookingId: 'booking-1', serviceName: "Won't start", reason: 'expired' })
    expect(useAppStore.getState().bookingHistory[0].status).toBe('expired')
  })

  it('a job released because the driver went silent says so', () => {
    useAppStore.setState({ activeBooking: booking({ status: 'en_route' }) })
    reconcileManagedBooking(booking({ status: 'cancelled', cancelledBy: 'system', endReason: 'driver_unresponsive', driver: { id: 'd', name: 'Sam T.', firstName: 'Sam' } as never }))
    expect(useAppStore.getState().endedBookingNotice).toMatchObject({ reason: 'driver_unresponsive', driverName: 'Sam' })
  })

  it('after the app was closed, a request that expired meanwhile is reported, not silently dropped', async () => {
    const previous = booking()
    vi.mocked(apiService.getBooking).mockResolvedValue({ success: true, data: booking({ status: 'expired' }) })
    await settleStaleActiveBooking(previous, null)
    expect(apiService.getBooking).toHaveBeenCalledWith('booking-1')
    expect(useAppStore.getState().activeBooking).toBeNull()
    expect(useAppStore.getState().endedBookingNotice?.reason).toBe('expired')
  })

  it('uses the server active request when there is one', async () => {
    const active = booking({ id: 'booking-2', status: 'accepted' })
    await settleStaleActiveBooking(booking(), active)
    expect(useAppStore.getState().activeBooking?.id).toBe('booking-2')
    expect(apiService.getBooking).not.toHaveBeenCalled()
  })
})
