import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDriverStore } from './useDriverStore'
import { apiService } from '../services/api'
import type { Booking } from '../types'

vi.mock('../services/api', () => ({ apiService: { updateBookingStatus: vi.fn(), getBooking: vi.fn() } }))

const job = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-9', customerId: 'customer-1', driverId: 'driver-1', status: 'en_route',
  service: { id: 'flat_tire', name: 'Flat tire', description: '', basePrice: 79, estimatedTime: 35 },
  location: { address: '500 Elm St', lat: 33.21, lng: -97.13 }, estimatedPrice: 79,
  customer: { name: 'Casey C.', firstName: 'Casey' }, createdAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  useDriverStore.getState().reset()
})

describe('driver job lifecycle in the store', () => {
  it('sends the cancellation reason and frees the driver once the job ends', async () => {
    useDriverStore.setState({ activeBooking: job() })
    vi.mocked(apiService.updateBookingStatus).mockResolvedValue({ success: true, data: job({ status: 'cancelled', cancelledBy: 'driver' }) })
    expect(await useDriverStore.getState().updateJobStatus('cancelled', 'vehicle_problem')).toBe(true)
    expect(apiService.updateBookingStatus).toHaveBeenCalledWith('booking-9', 'cancelled', 'vehicle_problem')
    expect(useDriverStore.getState().activeBooking).toBeNull()
    expect(useDriverStore.getState().jobEndedNotice).toBeNull()
  })

  it('keeps the job with the new status after a normal step', async () => {
    useDriverStore.setState({ activeBooking: job() })
    vi.mocked(apiService.updateBookingStatus).mockResolvedValue({ success: true, data: job({ status: 'arrived' }) })
    await useDriverStore.getState().updateJobStatus('arrived')
    expect(useDriverStore.getState().activeBooking?.status).toBe('arrived')
  })

  it('on a refused step, shows the error and resyncs — ending the job if the customer cancelled', async () => {
    useDriverStore.setState({ activeBooking: job() })
    vi.mocked(apiService.updateBookingStatus).mockResolvedValue({ success: false, error: 'This job was already cancelled.' })
    vi.mocked(apiService.getBooking).mockResolvedValue({ success: true, data: job({ status: 'cancelled', cancelledBy: 'customer' }) })
    expect(await useDriverStore.getState().updateJobStatus('arrived')).toBe(false)
    const state = useDriverStore.getState()
    expect(state.activeBooking).toBeNull()
    expect(state.jobEndedNotice).toEqual({ bookingId: 'booking-9', serviceName: 'Flat tire', customerName: 'Casey' })
  })

  it('on a refused step that is still active, keeps the error and the latest status', async () => {
    useDriverStore.setState({ activeBooking: job({ status: 'accepted' }) })
    vi.mocked(apiService.updateBookingStatus).mockResolvedValue({ success: false, error: 'Do one step at a time' })
    vi.mocked(apiService.getBooking).mockResolvedValue({ success: true, data: job({ status: 'en_route' }) })
    await useDriverStore.getState().updateJobStatus('arrived')
    expect(useDriverStore.getState().error).toBe('Do one step at a time')
    expect(useDriverStore.getState().activeBooking?.status).toBe('en_route')
  })
})
