import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import UpdatesScreen from './UpdatesScreen'
import { useAppStore, stripLegacyDemoState } from '../store/useAppStore'
import { apiService } from '../services/api'
import type { Booking } from '../types'

vi.mock('../components/tracking/LiveDriverMap', () => ({ default: () => null }))

const searching = {
  id: 'b1', customerId: 'c1', status: 'searching',
  service: { id: 'flat_tire', name: 'Flat Tire', description: '', basePrice: 65, estimatedTime: 25 },
  location: { address: '100 Elm St', lat: 32.7, lng: -96.8 }, estimatedPrice: 65, createdAt: new Date(),
} as Booking

beforeEach(() => {
  useAppStore.setState({ activeBooking: null, bookingHistory: [], currentScreen: 'chat', activeModal: null })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('customer Updates screen (no simulated data)', () => {
  it('shows an honest empty state with no active request and no chat promises', () => {
    render(<UpdatesScreen />)
    expect(screen.getByRole('heading', { name: 'No active request' })).toBeTruthy()
    expect(screen.queryByText(/chat/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Request roadside help' }))
    expect(useAppStore.getState().currentScreen).toBe('home')
  })

  it('while searching shows only the real request: no driver, ETA, messages or "mark completed"', () => {
    useAppStore.setState({ activeBooking: searching })
    render(<UpdatesScreen />)
    expect(screen.getByRole('heading', { name: 'Finding a driver' })).toBeTruthy()
    expect(screen.getByText(/Notifying nearby verified drivers/)).toBeTruthy()
    expect(screen.getByText('100 Elm St')).toBeTruthy()
    expect(screen.queryByText(/min away|Mark Completed|Chat with|typing/i)).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('no fake stats while searching (no "drivers nearby", no average arrival) and a quiet outline Cancel', () => {
    useAppStore.setState({ activeBooking: searching })
    render(<UpdatesScreen />)
    expect(screen.queryByText(/drivers? nearby|avg|average arrival|\d+ drivers/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel request' }).className).toContain('ui-btn--secondary')
    expect(screen.getByRole('button', { name: 'Safety and 911' })).toBeTruthy()
  })

  it('cancels a searching request through the API', async () => {
    useAppStore.setState({ activeBooking: searching, bookingHistory: [searching] })
    const update = vi.spyOn(apiService, 'updateBookingStatus').mockResolvedValue({ success: true, data: { ...searching, status: 'cancelled' } })
    render(<UpdatesScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, cancel request' }))
    await waitFor(() => expect(useAppStore.getState().activeBooking).toBeNull())
    expect(update).toHaveBeenCalledWith('b1', 'cancelled', undefined)
  })

  it('hands over to live tracking once a real driver accepts', () => {
    useAppStore.setState({ activeBooking: { ...searching, status: 'accepted', driver: { id: 'd1', name: 'Sam T.', firstName: 'Sam', rating: 0, totalJobs: 0, vehicle: null } } })
    render(<UpdatesScreen />)
    expect(screen.getByLabelText('Live tracking')).toBeTruthy()
    expect(screen.getByText('Sam T.')).toBeTruthy()
  })
})

describe('persisted demo data is dropped', () => {
  it('removes simulated chat threads and made-up providers from saved state', () => {
    const cleaned = stripLegacyDemoState({
      bookingMessages: { b1: [{ text: 'On my way!' }] },
      lastNotifiedStatusByBooking: { b1: 'accepted' },
      bookingHistory: [{ id: 'b1', mechanic: { name: 'AID Pro #123' } }],
      activeBooking: { id: 'b1', mechanic: { name: 'AID Pro #123' } },
      vehicles: [{ id: 'v1' }],
    })
    expect(cleaned.bookingMessages).toBeUndefined()
    expect(cleaned.lastNotifiedStatusByBooking).toBeUndefined()
    expect(cleaned.bookingHistory).toEqual([{ id: 'b1' }])
    expect(cleaned.activeBooking).toEqual({ id: 'b1' })
    expect(cleaned.vehicles).toEqual([{ id: 'v1' }])
  })
})
