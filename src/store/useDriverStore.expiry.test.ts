import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDriverStore } from './useDriverStore'
import { useAuthStore } from './useAuthStore'
import { apiService } from '../services/api'
import type { Booking, ServiceRequest } from '../types'

vi.mock('../services/api', () => ({ apiService: { acceptServiceRequest: vi.fn(), getServiceRequests: vi.fn(), getBooking: vi.fn() } }))
vi.mock('../lib/nearbyRequests', () => ({
  locateDriver: vi.fn(async () => ({ ok: true, lat: 32.78, lng: -96.8 })),
  requestDriverLocationPermission: vi.fn(),
}))

const request = (id: string) => ({ id, service: { id: 'battery_jump', name: "Won't start" } }) as unknown as ServiceRequest
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
  useAuthStore.setState({ user: { id: 'driver-1', role: 'driver' } as never })
})

describe('driver app and expired requests (E4)', () => {
  it('accepting an expired request shows why, and it disappears from the list', async () => {
    useDriverStore.setState({ isOnline: true, incomingRequests: [request('expired-1'), request('open-2')] })
    vi.mocked(apiService.acceptServiceRequest).mockResolvedValue({
      success: false, code: 'request_expired',
      error: "This request expired — no driver accepted it within 15 minutes, so it's no longer available.",
    })
    // The refreshed list from the server no longer has it either.
    vi.mocked(apiService.getServiceRequests).mockResolvedValue({ success: true, data: { status: 'ok', radiusMiles: 25, requests: [request('open-2')] } })

    expect(await useDriverStore.getState().acceptRequest('expired-1')).toBe(false)
    const state = useDriverStore.getState()
    expect(state.error).toMatch(/This request expired/)
    expect(state.incomingRequests.map((item) => item.id)).toEqual(['open-2'])
    expect(state.activeBooking).toBeNull()
  })

  it('a job the server released because the driver went silent ends with that reason', async () => {
    useDriverStore.setState({ activeBooking: job() })
    vi.mocked(apiService.getBooking).mockResolvedValue({ success: true, data: job({ status: 'cancelled', cancelledBy: 'system', endReason: 'driver_unresponsive' }) })
    await useDriverStore.getState().syncActiveJob()
    expect(useDriverStore.getState().activeBooking).toBeNull()
    expect(useDriverStore.getState().jobEndedNotice).toEqual({ bookingId: 'booking-9', serviceName: 'Flat tire', customerName: 'Casey', bySystem: true })
  })
})
