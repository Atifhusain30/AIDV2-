import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import HistoryScreen from './HistoryScreen'
import BookingDetailModal from '../components/modals/BookingDetailModal'
import { useAppStore } from '../store/useAppStore'
import { resetHistoryLoad, useHistoryLoad } from '../lib/bookingHistory'
import { apiService } from '../services/api'
import type { Booking } from '../types'

vi.mock('../services/api', () => ({ apiService: { listBookings: vi.fn() } }))

const booking = (id: string, extra: Partial<Booking> = {}): Booking => ({
  id, customerId: 'c1', status: 'completed',
  service: { id: 'flat_tire', name: 'Flat tire', description: '', basePrice: 79, estimatedTime: 35 },
  location: { address: '500 Elm St, Denton, TX', lat: 33.2, lng: -97.1 },
  estimatedPrice: 79, createdAt: new Date('2026-10-19T15:00:00Z'), ...extra,
} as Booking)

beforeEach(() => {
  useAppStore.setState({ activeBooking: null, bookingHistory: [], currentScreen: 'history', selectedBookingId: null })
  resetHistoryLoad()
  vi.clearAllMocks()
})

afterEach(() => cleanup())

describe('customer activity', () => {
  it('uses a simple activity feed rather than a calendar-first interface', () => {
    render(<HistoryScreen />)
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeTruthy()
    expect(screen.getByText('No roadside activity yet')).toBeTruthy()
    expect(screen.queryByText('January')).toBeNull()
  })

  it('returns the customer to roadside help from the empty state', () => {
    render(<HistoryScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Request roadside help' }))
    expect(useAppStore.getState().currentScreen).toBe('home')
  })

  it('groups past services by month, newest first, with Receipt and Request again on completed ones', () => {
    useAppStore.setState({ bookingHistory: [
      booking('old', { createdAt: new Date('2026-09-02T15:00:00Z'), status: 'cancelled', service: { id: 'towing', name: 'Towing', description: '', basePrice: 95, estimatedTime: 60 } }),
      booking('new'),
    ] })
    render(<HistoryScreen />)
    const groups = screen.getAllByRole('region')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['October 2026', 'September 2026'])
    expect(within(groups[0]).getByRole('button', { name: 'Receipt' })).toBeTruthy()
    expect(within(groups[0]).getByRole('button', { name: 'Request again' })).toBeTruthy()
    expect(within(groups[1]).getByText('Cancelled')).toBeTruthy()
    expect(within(groups[1]).queryByRole('button', { name: 'Receipt' })).toBeNull()
    expect(within(groups[0]).getByText('$79')).toBeTruthy()
  })

  it('shows "No charge" (not a price) on cancelled and no-driver requests, in Activity and in details', () => {
    useAppStore.setState({ bookingHistory: [
      booking('c', { status: 'cancelled', estimatedPrice: 79 }),
      booking('e', { status: 'expired', estimatedPrice: 95, createdAt: new Date('2026-10-18T15:00:00Z') }),
    ] })
    render(<><HistoryScreen /><BookingDetailModal /></>)
    expect(screen.getAllByText('No charge')).toHaveLength(2)
    expect(screen.queryByText('$79')).toBeNull()
    expect(screen.queryByText('$95')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /^Flat tire/ })[0])
    const sheet = screen.getByRole('dialog', { name: 'Flat tire' })
    expect(within(sheet).getByText('No charge')).toBeTruthy()
  })

  it('design (owner reference): filter pills, and every card has a green or red status pill', () => {
    useAppStore.setState({ bookingHistory: [
      booking('done'),
      booking('cx', { status: 'cancelled', createdAt: new Date('2026-10-18T15:00:00Z') }),
      booking('ex', { status: 'expired', createdAt: new Date('2026-10-17T15:00:00Z') }),
    ] })
    const { container } = render(<HistoryScreen />)
    expect(screen.getByRole('group', { name: 'Filter activity' }).className).toContain('activity-filters')
    const pills = [...container.querySelectorAll('.activity-item .ui-pill')].map((pill) => [pill.textContent, pill.className])
    expect(pills).toEqual([
      ['Completed', 'ui-pill ui-pill--success'],
      ['Cancelled', 'ui-pill ui-pill--danger'],
      ['No driver found', 'ui-pill ui-pill--danger'],
    ])
  })

  it('still shows the amount when a cancelled request has a recorded successful payment', () => {
    useAppStore.setState({ bookingHistory: [booking('p', { status: 'cancelled', finalPrice: 25, payment: { intentId: 'pi', status: 'succeeded', amount: 2500 } })] })
    render(<HistoryScreen />)
    expect(screen.getByText('$25')).toBeTruthy()
  })

  it('filters with pressed-state buttons and says so when a filter is empty', () => {
    useAppStore.setState({ bookingHistory: [booking('a')] })
    render(<HistoryScreen />)
    const cancelled = screen.getByRole('button', { name: 'Cancelled' })
    fireEvent.click(cancelled)
    expect(cancelled.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('heading', { name: 'No cancelled services' })).toBeTruthy()
  })

  it('opens the details sheet for a service', () => {
    useAppStore.setState({ bookingHistory: [booking('a', { driver: { id: 'd1', name: 'Sam Lee', firstName: 'Sam' } as never })] })
    render(<><HistoryScreen /><BookingDetailModal /></>)
    fireEvent.click(screen.getByRole('button', { name: /^Flat tire/ }))
    const sheet = screen.getByRole('dialog', { name: 'Flat tire' })
    expect(within(sheet).getByText('Completed')).toBeTruthy()
    expect(within(sheet).getByText('Sam Lee')).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: 'View receipt' })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close service details' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('activity loading, error and offline states (F5)', () => {
  it('shows placeholders (no fake rows) while the first load is in flight', () => {
    useHistoryLoad.setState({ status: 'loading', error: null })
    render(<HistoryScreen />)
    expect(screen.getByRole('status', { name: 'Loading your activity' })).toBeTruthy()
    expect(screen.queryByText('No roadside activity yet')).toBeNull()
  })

  it('shows an error with Try again when the first load fails, and recovers', async () => {
    useHistoryLoad.setState({ status: 'error', error: 'Unable to reach AID.' })
    vi.mocked(apiService.listBookings).mockResolvedValue({ success: true, data: [booking('a')] })
    render(<HistoryScreen />)
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load your activity/)
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByRole('button', { name: /^Flat tire/ })).toBeTruthy()
    expect(useHistoryLoad.getState().status).toBe('ready')
  })

  it('keeps the saved list when a refresh fails (offline) and says it may be out of date', async () => {
    useAppStore.setState({ bookingHistory: [booking('a')] })
    useHistoryLoad.setState({ status: 'error', error: 'Unable to reach AID.' })
    vi.mocked(apiService.listBookings).mockResolvedValue({ success: false, error: 'Unable to reach AID.' })
    render(<HistoryScreen />)
    expect(screen.getByText(/Showing what's saved on this phone/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Flat tire/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await waitFor(() => expect(apiService.listBookings).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /^Flat tire/ })).toBeTruthy()
  })
})
