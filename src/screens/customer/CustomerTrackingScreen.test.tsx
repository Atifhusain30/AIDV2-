import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import CustomerTrackingScreen from './CustomerTrackingScreen'
import { useAppStore } from '../../store/useAppStore'
import { apiService } from '../../services/api'
import type { Booking } from '../../types'

vi.mock('../../components/tracking/LiveDriverMap', () => ({
  default: (props: { driver: { lat: number; lng: number } | null; stale?: boolean }) => (
    <div data-testid="map" data-driver={props.driver ? `${props.driver.lat},${props.driver.lng}` : 'none'} data-stale={String(Boolean(props.stale))} />
  ),
}))
vi.mock('../../services/api', () => ({ apiService: { updateBookingStatus: vi.fn(), reportBookingIssue: vi.fn() } }))

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

  it('lets the customer cancel while the driver is on the way, with confirmation and an optional reason', async () => {
    vi.mocked(apiService.updateBookingStatus).mockResolvedValue({ success: true, data: job({ status: 'cancelled' }) })
    useAppStore.setState({ activeBooking: job({ status: 'en_route' }) })
    render(<CustomerTrackingScreen booking={job({ status: 'en_route' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel this request?' })
    expect(within(dialog).getByText(/Marcus is already on the way/)).toBeTruthy()
    fireEvent.click(within(dialog).getByLabelText('Wait is too long'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, cancel request' }))
    await waitFor(() => expect(useAppStore.getState().activeBooking).toBeNull())
    expect(apiService.updateBookingStatus).toHaveBeenCalledWith('booking-9', 'cancelled', 'wait_too_long')
  })

  it('keeps the request when the customer backs out of cancelling', () => {
    render(<CustomerTrackingScreen booking={job({ status: 'accepted' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep request' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(apiService.updateBookingStatus).not.toHaveBeenCalled()
  })

  it('shows the server reason when a cancel is refused (e.g. the driver just arrived)', async () => {
    vi.mocked(apiService.updateBookingStatus).mockResolvedValue({ success: false, error: 'Your driver has already arrived, so this request can no longer be cancelled in the app.' })
    render(<CustomerTrackingScreen booking={job({ status: 'en_route' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel request' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/already arrived/)
  })

  it('once the driver arrives there is no cancel, only reporting a problem', () => {
    for (const status of ['arrived', 'in_progress'] as const) {
      render(<CustomerTrackingScreen booking={job({ status, driverEta: undefined })} />)
      expect(screen.queryByRole('button', { name: 'Cancel request' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Report a problem' })).toBeTruthy()
      expect(screen.getByText(status === 'arrived' ? /Marcus is here, so this request can't be cancelled/ : /Service has started/)).toBeTruthy()
      cleanup()
    }
  })

  it('shows the right headline for every step, including the tow to the drop-off', () => {
    const cases: [Booking['status'], RegExp][] = [
      ['accepted', /DRIVER CONFIRMED/], ['en_route', /DRIVER ON THE WAY/], ['arrived', /DRIVER HAS ARRIVED/], ['in_progress', /SERVICE IN PROGRESS/],
    ]
    for (const [status, label] of cases) {
      render(<CustomerTrackingScreen booking={job({ status })} />)
      expect(screen.getByText(label)).toBeTruthy()
      cleanup()
    }
    render(<CustomerTrackingScreen booking={job({ status: 'in_progress' })} />)
    expect(screen.getByRole('heading', { name: 'On the way to drop-off' })).toBeTruthy()
  })

  it('reports a problem to the server', async () => {
    vi.mocked(apiService.reportBookingIssue).mockResolvedValue({ success: true, data: { id: '1' } })
    render(<CustomerTrackingScreen booking={job({ status: 'in_progress' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }))
    const send = screen.getByRole('button', { name: 'Send report' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Damage to my vehicle'))
    fireEvent.click(send)
    expect(await screen.findByRole('heading', { name: 'Report saved' })).toBeTruthy()
    expect(apiService.reportBookingIssue).toHaveBeenCalledWith('booking-9', 'vehicle_damage', undefined)
  })

  it('offers Safety and Call 911 (confirm first) on the tracking screen', () => {
    render(<CustomerTrackingScreen booking={job()} />)
    expect(screen.queryByRole('link', { name: /911/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Call 911' }))
    const confirm = screen.getByRole('dialog', { name: 'Call 911?' })
    expect(within(confirm).getByRole('link', { name: 'Call 911 now' }).getAttribute('href')).toBe('tel:911')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Safety' }))
    const sheet = screen.getByRole('dialog', { name: 'Safety' })
    expect(within(sheet).getByText(/driver's name, vehicle and plate/)).toBeTruthy()
  })
})
