import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import DriverJobScreen from './DriverJobScreen'
import { useDriverStore } from '../../store/useDriverStore'
import type { Booking } from '../../types'

const tow = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-9', customerId: 'customer-1', driverId: 'driver-1', status: 'en_route',
  service: { id: 'towing', name: 'Towing', description: '', basePrice: 152.15, estimatedTime: 60 },
  location: { address: '500 Elm St, Denton, TX', lat: 33.21, lng: -97.13 },
  dropoffLocation: { address: "Joe's Garage, 12 Oak St", lat: 33.05, lng: -96.99 },
  estimatedPrice: 152.15, notes: 'Hazards on, behind the gas station',
  vehicle: { vehicleId: 'veh-1', label: '2020 Honda Civic', plate: 'ABC123', color: 'Blue' },
  customer: { name: 'Casey C.', firstName: 'Casey', phone: '+19405550100' },
  createdAt: new Date(),
  ...overrides,
})

const updateJobStatus = vi.fn().mockResolvedValue(true)
function show(booking: Booking | null, extra: Record<string, unknown> = {}) {
  useDriverStore.setState({ activeBooking: booking, updateJobStatus, locationSharing: 'sharing', currentLocation: { lat: 33.1, lng: -97.0 }, ...extra })
  const onBack = vi.fn()
  render(<DriverJobScreen onBack={onBack} />)
  return { onBack }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('driver job screen', () => {
  it('shows who to help: customer, their car, notes, price', () => {
    show(tow())
    expect(screen.getByText('Casey C.')).toBeTruthy()
    expect(screen.getByText(/2020 Honda Civic/)).toBeTruthy()
    expect(screen.getByText(/Blue · ABC123/)).toBeTruthy()
    expect(screen.getByText('Hazards on, behind the gas station')).toBeTruthy()
    expect(screen.getByText('$152.15')).toBeTruthy()
  })

  it('calls the customer with one tap', () => {
    show(tow())
    const call = screen.getByRole('link', { name: /call casey/i })
    expect(call.getAttribute('href')).toBe('tel:+19405550100')
  })

  it('hides the call button when no phone number is shared', () => {
    show(tow({ customer: { name: 'Casey C.', firstName: 'Casey' } }))
    expect(screen.queryByRole('link', { name: /call/i })).toBeNull()
  })

  it('shows pickup and tow drop-off, navigating to pickup first', () => {
    show(tow())
    expect(screen.getByText('500 Elm St, Denton, TX')).toBeTruthy()
    expect(screen.getByText("Joe's Garage, 12 Oak St")).toBeTruthy()
    const nav = screen.getByRole('link', { name: /directions to pickup/i })
    expect(nav.getAttribute('href')).toBe('https://maps.apple.com/?daddr=33.21,-97.13&dirflg=d')
  })

  it('navigates to the drop-off once the vehicle is loaded', () => {
    show(tow({ status: 'in_progress' }))
    const nav = screen.getByRole('link', { name: /directions to drop-off/i })
    expect(nav.getAttribute('href')).toBe('https://maps.apple.com/?daddr=33.05,-96.99&dirflg=d')
  })

  it('advances the job one step at a time', () => {
    show(tow({ status: 'accepted' }))
    fireEvent.click(screen.getByRole('button', { name: /i'm on my way/i }))
    expect(updateJobStatus).toHaveBeenCalledWith('en_route')
    cleanup()
    show(tow({ status: 'arrived' }))
    fireEvent.click(screen.getByRole('button', { name: /start service/i }))
    expect(updateJobStatus).toHaveBeenCalledWith('in_progress')
  })

  it('only allows cancelling before arrival, with confirmation', async () => {
    show(tow({ status: 'en_route' }))
    fireEvent.click(screen.getByRole('button', { name: /cancel job/i }))
    const dialog = screen.getByRole('dialog', { name: /cancel this job/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /yes, cancel/i }))
    expect(updateJobStatus).toHaveBeenCalledWith('cancelled')
    cleanup()
    show(tow({ status: 'arrived' }))
    expect(screen.queryByRole('button', { name: /cancel job/i })).toBeNull()
  })

  it('tells the driver when the customer cannot see their location', () => {
    show(tow(), { locationSharing: 'denied' })
    expect(screen.getByRole('alert').textContent).toMatch(/location is off/i)
    cleanup()
    show(tow(), { locationSharing: 'sharing' })
    expect(screen.getByText(/sharing your location with casey/i)).toBeTruthy()
  })

  it('handles having no active job', () => {
    const { onBack } = show(null)
    fireEvent.click(screen.getByRole('button', { name: /back to dashboard/i }))
    expect(onBack).toHaveBeenCalled()
  })
})
