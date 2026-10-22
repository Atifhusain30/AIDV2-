import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import EndedBookingNotice from './EndedBookingNotice'
import { useAppStore } from '../../store/useAppStore'
import type { Booking } from '../../types'

const ended = {
  id: 'booking-1', customerId: 'c', status: 'expired', estimatedPrice: 79, createdAt: new Date(),
  service: { id: 'flat_tire', name: 'Flat tire', description: '', basePrice: 79, estimatedTime: 35 },
  location: { address: '1 Main', lat: 1, lng: 1 },
} as Booking

beforeEach(() => useAppStore.setState({ endedBookingNotice: null, activeRequestRedirect: false, activeBooking: null, bookingHistory: [ended], activeModal: null, currentScreen: 'chat' }))
afterEach(() => cleanup())

describe('ended request notice (E4)', () => {
  it('says no drivers were available when a request expires, with Request again', () => {
    useAppStore.setState({ endedBookingNotice: { bookingId: 'booking-1', serviceName: 'Flat tire', reason: 'expired' } })
    render(<EndedBookingNotice />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/No drivers were available/)
    expect(alert.textContent).toMatch(/No driver accepted your flat tire request in time/)
    fireEvent.click(screen.getByRole('button', { name: 'Request again' }))
    const state = useAppStore.getState()
    expect(state.endedBookingNotice).toBeNull()
    expect(state.activeModal).toBe('services')
    expect(state.serviceFormData.selectedService).toBe('flat_tire')
    expect(state.currentScreen).toBe('home')
  })

  it('says the driver stopped responding when the server released the job', () => {
    useAppStore.setState({ endedBookingNotice: { bookingId: 'booking-1', serviceName: 'Flat tire', reason: 'driver_unresponsive', driverName: 'Sam' } })
    render(<EndedBookingNotice />)
    expect(screen.getByRole('alert').textContent).toMatch(/Sam stopped responding, so we cancelled this request/)
  })

  it('explains the redirect when the customer already had a request in progress', () => {
    useAppStore.setState({ activeRequestRedirect: true, activeBooking: { ...ended, status: 'searching' } })
    render(<EndedBookingNotice />)
    expect(screen.getByRole('status').textContent).toMatch(/You already have a request in progress/)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(useAppStore.getState().activeRequestRedirect).toBe(false)
  })

  it('shows nothing for the redirect once there is no active request', () => {
    useAppStore.setState({ activeRequestRedirect: true, activeBooking: null })
    const { container } = render(<EndedBookingNotice />)
    expect(container.textContent).toBe('')
  })
})
