import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CustomerTrackingScreen from './CustomerTrackingScreen'
import { useAppStore } from '../../store/useAppStore'
import { apiService } from '../../services/api'
import type { Booking } from '../../types'

vi.mock('../../components/tracking/LiveDriverMap', () => ({
  default: (props: { driver: { lat: number; lng: number } | null; stale?: boolean }) => (
    <div data-testid="map" data-driver={props.driver ? `${props.driver.lat},${props.driver.lng}` : 'none'} data-stale={String(Boolean(props.stale))} />
  ),
}))
vi.mock('../../services/api', () => ({ apiService: { updateBookingStatus: vi.fn() } }))

const NOW = Date.parse('2026-10-22T19:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const job = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-9', customerId: 'customer-1', driverId: 'driver-1', status: 'en_route',
  service: { id: 'towing', name: 'Towing', description: '', basePrice: 152.15, estimatedTime: 60 },
  location: { address: '500 Elm St, Denton, TX', lat: 33.21, lng: -97.13 },
  dropoffLocation: { address: "Joe's Garage", lat: 33.05, lng: -96.99 },
  estimatedPrice: 152.15,
  driver: {
    id: 'driver-1', name: 'Marcus T.', firstName: 'Marcus', phone: '+19405550199', rating: 4.9, totalJobs: 212,
    vehicle: { make: 'Ford', model: 'F-550 Flatbed', color: 'White', plate: 'TOW-77' },
  },
  driverLocation: { lat: 33.1, lng: -97.0, updatedAt: ago(8000) },
  driverEta: { miles: 13.4, minutes: 27, approximate: true, fromLocationAt: ago(8000) },
  createdAt: new Date(NOW - 600_000),
  ...overrides,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  useAppStore.setState({ activeBooking: null, bookingHistory: [] })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('customer live tracking', () => {
  it('shows who is coming, what they drive, and an approximate ETA', async () => {
    render(<CustomerTrackingScreen booking={job()} />)
    expect(screen.getByRole('heading', { name: '27 min' })).toBeTruthy()
    expect(screen.getByText(/13\.4 mi away/)).toBeTruthy()
    expect(screen.getByText(/Approximate/)).toBeTruthy()
    expect(screen.getByText('Marcus T.')).toBeTruthy()
    expect(screen.getByText(/4\.9 · 212 jobs/)).toBeTruthy()
    expect(screen.getByText('White Ford F-550 Flatbed')).toBeTruthy()
    expect(screen.getByText('TOW-77')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Call Marcus' }).getAttribute('href')).toBe('tel:+19405550199')
    expect(screen.getByRole('status').textContent).toBe('Live')
    const map = await screen.findByTestId('map')
    expect(map.getAttribute('data-driver')).toBe('33.1,-97')
    expect(map.getAttribute('data-stale')).toBe('false')
  })

  it('waits for the first location instead of placing a fake marker', async () => {
    render(<CustomerTrackingScreen booking={job({ status: 'accepted', driverLocation: undefined, driverEta: undefined })} />)
    expect(screen.getByRole('heading', { name: 'Marcus accepted your request' })).toBeTruthy()
    expect(screen.getByText("Waiting for Marcus's location…")).toBeTruthy()
    expect((await screen.findByTestId('map')).getAttribute('data-driver')).toBe('none')
    expect(screen.queryByText(/Approximate/)).toBeNull()
  })

  it('warns when the location is stale and hides an ETA that is too old to trust', async () => {
    render(<CustomerTrackingScreen booking={job({ driverLocation: { lat: 33.1, lng: -97.0, updatedAt: ago(12 * 60_000) } })} />)
    expect(screen.getByRole('status').textContent).toBe('Last seen 12 min ago')
    expect(screen.getByRole('alert').textContent).toMatch(/last updated 12 min ago.*call them.*ETA is hidden/)
    expect(screen.getByRole('heading', { name: 'Marcus is on the way' })).toBeTruthy()
    expect((await screen.findByTestId('map')).getAttribute('data-stale')).toBe('true')
  })

  it('tells the customer what to look for once the driver arrives', () => {
    render(<CustomerTrackingScreen booking={job({ status: 'arrived', driverEta: undefined })} />)
    expect(screen.getByRole('heading', { name: 'Marcus has arrived' })).toBeTruthy()
    expect(screen.getByText('Look for the White Ford F-550 Flatbed · TOW-77')).toBeTruthy()
  })

  it('does not invent a vehicle or rating the driver has not provided', () => {
    const driver = { ...job().driver!, rating: 0, totalJobs: 0, vehicle: null, phone: undefined }
    render(<CustomerTrackingScreen booking={job({ driver })} />)
    expect(screen.getByText('Vehicle details not added yet')).toBeTruthy()
    expect(screen.getByText('New on AID')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Call/ })).toBeNull()
  })

  it('lets the customer cancel only before the driver is on the way', async () => {
    vi.mocked(apiService.updateBookingStatus).mockResolvedValue({ success: true, data: job({ status: 'cancelled' }) })
    useAppStore.setState({ activeBooking: job({ status: 'accepted' }) })
    const { unmount } = render(<CustomerTrackingScreen booking={job({ status: 'accepted' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel request' }))
    await waitFor(() => expect(useAppStore.getState().activeBooking).toBeNull())
    expect(apiService.updateBookingStatus).toHaveBeenCalledWith('booking-9', 'cancelled')
    unmount()
    render(<CustomerTrackingScreen booking={job({ status: 'en_route' })} />)
    expect(screen.queryByRole('button', { name: 'Cancel request' })).toBeNull()
  })
})
