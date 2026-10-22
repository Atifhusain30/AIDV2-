import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { DRIVER_JOB_POLL_MS, useDriverJobSync } from './useDriverJobSync'
import { useDriverStore } from '../store/useDriverStore'
import { apiService } from '../services/api'
import type { Booking } from '../types'

vi.mock('../services/api', () => ({ apiService: { getBooking: vi.fn() } }))

const job = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-9', customerId: 'customer-1', driverId: 'driver-1', status: 'en_route',
  service: { id: 'flat_tire', name: 'Flat tire', description: '', basePrice: 79, estimatedTime: 35 },
  location: { address: '500 Elm St', lat: 33.21, lng: -97.13 }, estimatedPrice: 79,
  customer: { name: 'Casey C.', firstName: 'Casey' }, createdAt: new Date(),
  ...overrides,
})

function Harness() { useDriverJobSync(); return null }
const tick = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms) }) }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useDriverStore.getState().reset()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('driver job sync', () => {
  it('ends the job and tells the driver when the customer cancels, then stops polling', async () => {
    useDriverStore.setState({ activeBooking: job() })
    vi.mocked(apiService.getBooking).mockResolvedValue({ success: true, data: job({ status: 'cancelled', cancelledBy: 'customer' }) })
    render(<Harness />)
    await tick(DRIVER_JOB_POLL_MS)
    expect(useDriverStore.getState().activeBooking).toBeNull()
    expect(useDriverStore.getState().jobEndedNotice?.customerName).toBe('Casey')
    await tick(DRIVER_JOB_POLL_MS * 3)
    expect(apiService.getBooking).toHaveBeenCalledTimes(1)
  })

  it('does not poll without an active job', async () => {
    render(<Harness />)
    await tick(DRIVER_JOB_POLL_MS * 3)
    expect(apiService.getBooking).not.toHaveBeenCalled()
  })
})
