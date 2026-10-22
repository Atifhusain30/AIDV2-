import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import RequestSheet from './RequestSheet'
import { useAppStore } from '../../store/useAppStore'
import { apiService } from '../../services/api'
import * as bookingService from '../../services/bookingService'
import { searchAddressSuggestions } from '../../services/locationService'

vi.mock('../../services/api', () => ({ apiService: { listServices: vi.fn(), quoteBooking: vi.fn() } }))
vi.mock('../../services/bookingService', () => ({ requestAndStartBooking: vi.fn() }))
vi.mock('../../services/locationService', () => ({ searchAddressSuggestions: vi.fn() }))

const CATALOG = [
  { id: 'battery_jump', name: "Won't start", description: 'Battery jump-start', basePrice: 69, estimatedTime: 30, available: true, requiresDropoff: false },
  { id: 'flat_tire', name: 'Flat tire', description: 'Tire change', basePrice: 79, estimatedTime: 35, available: true, requiresDropoff: false },
  { id: 'towing', name: 'Towing', description: 'Includes the first 5 miles', basePrice: 95, estimatedTime: 60, available: true, requiresDropoff: true,
    pricing: { hookup: 95, includedMiles: 5, perMile: 4.5, maxMiles: 100 } },
  { id: 'detailing', name: 'Detailing', description: 'Detailing', basePrice: 150, estimatedTime: 120, available: false, requiresDropoff: false },
]
const HERE = { lat: 33.01, lng: -97.02 }

function open(selectedService: string | null, extra: Record<string, unknown> = {}) {
  useAppStore.setState({
    activeModal: 'services',
    currentScreen: 'home',
    serviceFormData: { selectedService: selectedService as never, problemDescription: '', vehicleType: null, dropoff: null },
    userLocationLabel: '500 Elm St, Denton, TX',
    userCoords: HERE,
    pendingReturnModal: null,
    vehicles: [{ id: 'veh-1', make: 'Honda', model: 'Civic', year: 2020, color: 'Blue', plate: 'ABC123' }] as never,
    activeVehicleId: 'veh-1',
    activeBooking: null,
    ...extra,
  })
  render(<RequestSheet />)
  return screen.getByRole('dialog')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiService.listServices).mockResolvedValue({ success: true, data: CATALOG as never })
  vi.mocked(bookingService.requestAndStartBooking).mockResolvedValue({ id: 'booking-1' } as never)
  vi.mocked(apiService.quoteBooking).mockResolvedValue({ success: true, data: { serviceType: 'towing', price: 162.5, distanceMiles: 20 } as never })
})
afterEach(() => cleanup())

describe('request sheet', () => {
  it('requests a service at the confirmed location for the server price', async () => {
    const sheet = open('battery_jump')
    expect(within(sheet).getByRole('heading', { name: "Won't start" })).toBeTruthy()
    const request = await within(sheet).findByRole('button', { name: /request · \$69/i })
    expect(within(sheet).getByText('500 Elm St, Denton, TX')).toBeTruthy()
    expect(within(sheet).getByText(/2020 Honda Civic/)).toBeTruthy()
    fireEvent.change(within(sheet).getByLabelText(/anything the driver should know/i), { target: { value: 'Parked behind the gas station' } })
    fireEvent.click(request)

    await waitFor(() => expect(bookingService.requestAndStartBooking).toHaveBeenCalledWith(expect.objectContaining({
      service: expect.objectContaining({ id: 'battery_jump', basePrice: 69 }),
      locationLabel: '500 Elm St, Denton, TX',
      locationCoords: HERE,
      notes: 'Parked behind the gas station',
      dropoffLocation: undefined,
    })))
    await waitFor(() => expect(useAppStore.getState().currentScreen).toBe('chat'))
    expect(useAppStore.getState().activeModal).toBeNull()
  })

  it('asks for a location before requesting when none is confirmed', async () => {
    const sheet = open('flat_tire', { userLocationLabel: '', userCoords: null })
    fireEvent.click(await within(sheet).findByRole('button', { name: /set your location/i }))
    expect(useAppStore.getState().activeModal).toBe('locationConfirm')
    expect(useAppStore.getState().pendingReturnModal).toBe('services')
    expect(bookingService.requestAndStartBooking).not.toHaveBeenCalled()
  })

  it('lets the customer pick a service, showing only services offered now', async () => {
    const sheet = open(null)
    const picker = await within(sheet).findByRole('list', { name: /services/i })
    expect(within(picker).queryByText('Detailing')).toBeNull()
    fireEvent.click(within(picker).getByRole('button', { name: /flat tire/i }))
    expect(await within(sheet).findByRole('button', { name: /request · \$79/i })).toBeTruthy()
  })

  it('requires a real drop-off address for towing and shows the exact distance price', async () => {
    vi.mocked(searchAddressSuggestions).mockResolvedValue([{ id: 's1', label: "Joe's Garage, 12 Oak St", lat: 33.05, lng: -97.1 }])
    const sheet = open('towing')
    const waiting = await within(sheet).findByRole('button', { name: /request · from \$95/i }) as HTMLButtonElement
    expect(waiting.disabled).toBe(true)
    expect(within(sheet).getByText(/\$95 includes the first 5 miles, then \$4\.50 per mile/i)).toBeTruthy()

    fireEvent.change(within(sheet).getByLabelText(/tow to/i), { target: { value: 'Joe' } })
    fireEvent.click(await within(sheet).findByRole('option', { name: /joe's garage/i }, { timeout: 2000 }))
    const request = await within(sheet).findByRole('button', { name: /request · \$162\.50/i }) as HTMLButtonElement
    expect(apiService.quoteBooking).toHaveBeenCalledWith({
      serviceType: 'towing',
      location: { address: '500 Elm St, Denton, TX', ...HERE },
      dropoffLocation: { address: "Joe's Garage, 12 Oak St", lat: 33.05, lng: -97.1 },
    })
    expect(within(sheet).getByText(/20 mi tow/i)).toBeTruthy()
    expect(request.disabled).toBe(false)
    fireEvent.click(request)
    await waitFor(() => expect(bookingService.requestAndStartBooking).toHaveBeenCalledWith(expect.objectContaining({
      dropoffLocation: { address: "Joe's Garage, 12 Oak St", lat: 33.05, lng: -97.1 },
    })))
  })

  it('blocks a tow the server cannot price, with the reason', async () => {
    vi.mocked(apiService.quoteBooking).mockResolvedValueOnce({ success: false, error: "Tows longer than 100 miles aren't available in the app yet" })
    const sheet = open('towing', { serviceFormData: { selectedService: 'towing', problemDescription: '', vehicleType: null, dropoff: { address: 'Houston', lat: 29.76, lng: -95.37 } } })
    expect((await within(sheet).findByRole('alert')).textContent).toMatch(/longer than 100 miles/)
    expect((within(sheet).getByRole('button', { name: /request · from \$95/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('prefills the tow destination when requesting again', async () => {
    const sheet = open('towing', { serviceFormData: { selectedService: 'towing', problemDescription: '', vehicleType: null, dropoff: { address: 'Home, 9 Pine Rd', lat: 33.2, lng: -97.3 } } })
    expect(await within(sheet).findByText('Home, 9 Pine Rd')).toBeTruthy()
    expect((await within(sheet).findByRole('button', { name: /request · \$162\.50/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows server errors inline instead of an alert', async () => {
    vi.mocked(bookingService.requestAndStartBooking).mockRejectedValueOnce(new Error('A valid service location is required'))
    const sheet = open('battery_jump')
    fireEvent.click(await within(sheet).findByRole('button', { name: /request · \$69/i }))
    expect((await within(sheet).findByRole('alert')).textContent).toMatch(/valid service location/)
    expect(useAppStore.getState().activeModal).toBe('services')
  })

  it('E4: with a request already in progress, opening the sheet goes to that request', async () => {
    useAppStore.setState({
      activeRequestRedirect: false, activeModal: 'services', currentScreen: 'home',
      serviceFormData: { selectedService: 'battery_jump', problemDescription: '', vehicleType: null, dropoff: null },
      activeBooking: { id: 'booking-live', status: 'searching' } as never,
    })
    render(<RequestSheet />)
    await waitFor(() => expect(useAppStore.getState().currentScreen).toBe('chat'))
    expect(useAppStore.getState().activeModal).toBeNull()
    expect(useAppStore.getState().activeRequestRedirect).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(bookingService.requestAndStartBooking).not.toHaveBeenCalled()
  })

  it('E4: when the server says one is already active, the customer is taken to it, not shown an error', async () => {
    useAppStore.setState({ activeRequestRedirect: false })
    vi.mocked(bookingService.requestAndStartBooking).mockResolvedValueOnce({ booking: { id: 'booking-other-device' }, alreadyActive: true } as never)
    const sheet = open('battery_jump', { activeBooking: null })
    fireEvent.click(await within(sheet).findByRole('button', { name: /request · \$69/i }))
    await waitFor(() => expect(useAppStore.getState().currentScreen).toBe('chat'))
    expect(useAppStore.getState().activeRequestRedirect).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not allow requesting without real prices', async () => {
    vi.mocked(apiService.listServices).mockResolvedValueOnce({ success: false, error: 'Unable to reach AID.' })
    const sheet = open('battery_jump')
    expect((await within(sheet).findByRole('alert')).textContent).toMatch(/unable to reach aid/i)
    expect(within(sheet).queryByRole('button', { name: /request ·/i })).toBeNull()
    vi.mocked(apiService.listServices).mockResolvedValueOnce({ success: true, data: CATALOG as never })
    fireEvent.click(within(sheet).getByRole('button', { name: /try again/i }))
    expect(await within(sheet).findByRole('button', { name: /request · \$69/i })).toBeTruthy()
  })
})
