import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  useDriverStore.setState({ activeBooking: booking, updateJobStatus, locationSharing: 'sharing', currentLocation: { lat: 33.1, lng: -97.0 }, error: null, jobEndedNotice: null, ...extra })
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

  it('shows exactly one primary action per step, in order', () => {
    const service = (overrides: Partial<Booking> = {}) => tow({ dropoffLocation: undefined, service: { id: 'flat_tire', name: 'Flat tire', description: '', basePrice: 79, estimatedTime: 35 }, ...overrides })
    const steps: [Booking['status'], string, Booking['status'] | undefined][] = [
      ['accepted', 'Start driving', 'en_route'],
      ['en_route', "I've arrived", 'arrived'],
      ['arrived', 'Start service', 'in_progress'],
    ]
    for (const [status, label, next] of steps) {
      show(service({ status }))
      const buttons = screen.getAllByRole('button').filter((button) => button.classList.contains('aid-primary-button'))
      expect(buttons.map((button) => button.textContent)).toEqual([label])
      fireEvent.click(buttons[0])
      expect(updateJobStatus).toHaveBeenLastCalledWith(next, undefined)
      cleanup()
    }
    show(service({ status: 'in_progress' }))
    expect(screen.getByRole('button', { name: 'Complete job' })).toBeTruthy()
    expect(screen.getByText('Tap when the service is finished')).toBeTruthy()
  })

  it('uses tow wording: start the tow once loaded, complete at the drop-off', () => {
    show(tow({ status: 'arrived' }))
    expect(screen.getByRole('button', { name: 'Start tow' })).toBeTruthy()
    cleanup()
    show(tow({ status: 'in_progress' }))
    expect(screen.getByText('Tap once the vehicle is dropped off')).toBeTruthy()
  })

  it('asks before completing, and can back out', async () => {
    const { onBack } = show(tow({ status: 'in_progress' }))
    fireEvent.click(screen.getByRole('button', { name: 'Complete job' }))
    expect(updateJobStatus).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog', { name: 'Complete this job?' })
    expect(within(dialog).getByText(/vehicle is at the drop-off/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not yet' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Complete job' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, complete job' }))
    await waitFor(() => expect(updateJobStatus).toHaveBeenCalledWith('completed', undefined))
    await waitFor(() => expect(onBack).toHaveBeenCalled())
  })

  it('B15: completing hands the finished job over so the driver can rate the customer; cancelling does not', async () => {
    useDriverStore.setState({ activeBooking: tow({ status: 'in_progress' }), updateJobStatus, locationSharing: 'sharing', error: null, jobEndedNotice: null })
    const onCompleted = vi.fn()
    render(<DriverJobScreen onBack={vi.fn()} onCompleted={onCompleted} />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete job' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, complete job' }))
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1))
    expect(onCompleted.mock.calls[0][0].id).toBe('booking-9')
    cleanup()

    useDriverStore.setState({ activeBooking: tow({ status: 'accepted' }) })
    const notRated = vi.fn()
    render(<DriverJobScreen onBack={vi.fn()} onCompleted={notRated} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel job' }))
    fireEvent.click(screen.getAllByRole('radio')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel job' }))
    await waitFor(() => expect(updateJobStatus).toHaveBeenLastCalledWith('cancelled', expect.any(String)))
    expect(notRated).not.toHaveBeenCalled()
  })

  it('B15: shows the customer\'s real rating only once 3 drivers have rated them', () => {
    show(tow({ customer: { name: 'Casey C.', firstName: 'Casey', rating: 4.8, ratingCount: 5 } }))
    expect(screen.getByLabelText('Rated 4.8 out of 5 from 5 ratings').textContent).toContain('4.8 (5)')
    cleanup()
    show(tow({ customer: { name: 'Casey C.', firstName: 'Casey', rating: null, ratingCount: 2 } }))
    expect(screen.queryByLabelText(/Rated/)).toBeNull()
  })

  it('disables the action while the update is pending', async () => {
    let finish: (ok: boolean) => void = () => undefined
    updateJobStatus.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve }))
    show(tow({ status: 'accepted' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start driving' }))
    const pending = screen.getByRole('button', { name: /updating/i }) as HTMLButtonElement
    expect(pending.disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel job' }) as HTMLButtonElement).disabled).toBe(true)
    finish(true)
    await waitFor(() => expect(screen.queryByRole('button', { name: /updating/i })).toBeNull())
  })

  it('shows the server error when a step is refused', () => {
    show(tow({ status: 'en_route' }), { error: 'Do one step at a time: this job is on the way, so the next step is arrived.' })
    expect(screen.getByRole('alert').textContent).toMatch(/one step at a time/)
  })

  it('cancelling needs a reason and a confirmation, and is allowed until service starts', async () => {
    show(tow({ status: 'arrived' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel job' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this job?' })
    const confirm = within(dialog).getByRole('button', { name: 'Yes, cancel job' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(within(dialog).getByLabelText("Can't reach the customer"))
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() => expect(updateJobStatus).toHaveBeenCalledWith('cancelled', 'cannot_reach_customer'))
    cleanup()
    show(tow({ status: 'in_progress' }))
    expect(screen.queryByRole('button', { name: 'Cancel job' })).toBeNull()
    expect(screen.getByText(/can't be cancelled. If something's wrong, report an issue/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Report an issue' })).toBeTruthy()
  })

  it('tells the driver when the customer cancelled the job', () => {
    show(null, { jobEndedNotice: { bookingId: 'booking-9', serviceName: 'Towing', customerName: 'Casey' } })
    expect(screen.getByRole('alert').textContent).toMatch(/Casey cancelled this towing job/)
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

  it('offers Safety and Call 911 (confirm first) separately from Report an issue', () => {
    show(tow())
    expect(screen.queryByRole('link', { name: /911/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Call 911' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Call 911?' })
    expect(within(confirm).getByRole('link', { name: 'Call 911 now' }).getAttribute('href')).toBe('tel:911')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Safety' }))
    expect(screen.getByRole('dialog', { name: 'Safety' })).toBeTruthy()
    expect(screen.getByText(/does not contact 911/)).toBeTruthy()
  })

  it('B12: Message the customer, with the unread count from the job poll', () => {
    show(tow({ chat: { state: 'open', unread: 12, blockedByMe: false, readOnlyUntil: null } }))
    const button = screen.getByRole('button', { name: 'Message Casey, 12 unread' })
    expect(button.textContent).toBe('9+')
    cleanup()
    show(tow())
    expect(screen.getByRole('button', { name: 'Message Casey' }).textContent).toBe('')
  })

  it('labels Report an issue as non-emergency', () => {
    show(tow())
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }))
    expect(screen.getByText(/Not for emergencies/)).toBeTruthy()
  })
})
