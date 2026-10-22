import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReceiptModal from './ReceiptModal'
import { useAppStore } from '../../store/useAppStore'
import { useAuthStore } from '../../store/useAuthStore'
import { apiService } from '../../services/api'
import type { Booking } from '../../types'
import type { PendingRating } from '../../lib/ratings'

vi.mock('../payment/PaymentCheckout', () => ({
  default: () => <div data-testid="stripe-checkout">Stripe checkout</div>,
}))

const booking = {
  id: 'booking-1',
  customerId: 'customer-1',
  service: { id: 'towing', name: 'Towing', description: '', basePrice: 100, estimatedTime: 30 },
  status: 'completed',
  location: { address: '100 Main Street', lat: 32.77, lng: -96.79 },
  estimatedPrice: 100,
  paymentStatus: 'pending',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
} as Booking

describe('ReceiptModal secure checkout', () => {
  beforeEach(() => {
    useAppStore.setState({ receiptBookingId: booking.id, bookingHistory: [booking] })
  })

  afterEach(() => cleanup())

  it('right after the job: "All set!" with the total, date, address, vehicle and driver, then View receipt or Done', () => {
    const done = { ...booking, finalPrice: 79, vehicle: { label: '2020 Honda Civic', plate: 'ABC123' }, driver: { id: 'd1', name: 'Marcus T.', firstName: 'Marcus', rating: null, totalJobs: 3, vehicle: null } } as unknown as Booking
    useAppStore.setState({ receiptBookingId: done.id, bookingHistory: [done] })
    render(<ReceiptModal />)
    const sheet = screen.getByRole('dialog', { name: 'All set!' })
    expect(within(sheet).getByText(/^\$79(\.00)?$/)).toBeTruthy()
    expect(within(sheet).getByText('100 Main Street')).toBeTruthy()
    expect(within(sheet).getByText(/2020 Honda Civic/)).toBeTruthy()
    expect(within(sheet).getByText('Marcus T.')).toBeTruthy()
    // Nothing about charging on the completion summary (payments aren't live yet).
    expect(within(sheet).queryByText(/charged|Pay securely/i)).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: 'View receipt' }))
    expect(screen.getByRole('dialog', { name: 'Receipt' })).toBeTruthy()
  })

  it('a receipt opened again later goes straight to the receipt', () => {
    useAppStore.setState({ receiptBookingId: booking.id, bookingHistory: [{ ...booking, receiptViewed: true }] })
    render(<ReceiptModal />)
    expect(screen.getByRole('dialog', { name: 'Receipt' })).toBeTruthy()
  })

  it('opens the Stripe-hosted checkout from an unpaid receipt', async () => {
    render(<ReceiptModal />)
    expect(screen.queryByText('Visa •••• 4242')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View receipt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pay securely' }))
    // F6: Stripe's checkout is lazy-loaded, so it appears once its code has loaded.
    expect(await screen.findByTestId('stripe-checkout')).toBeTruthy()
  })
})

describe('ReceiptModal rating (B15)', () => {
  const pending: PendingRating = {
    bookingId: booking.id, serviceName: 'Towing', completedAt: '2026-10-22T12:00:00.000Z', rateeRole: 'driver', rateeFirstName: 'Marcus',
    rateBy: '2026-10-29T12:00:00.000Z', tags: [{ id: 'on_time', label: 'On time' }], commentMaxLength: 500,
  }
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ user: { id: 'customer-1' } as never })
    useAppStore.setState({ receiptBookingId: booking.id, bookingHistory: [booking] })
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('asks the customer to rate the driver right after the job; skipping leaves a "Rate Marcus" button', async () => {
    vi.spyOn(apiService, 'listPendingRatings').mockResolvedValue({ success: true, data: [pending] })
    render(<ReceiptModal />)
    expect(await screen.findByRole('dialog', { name: 'How was Marcus?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.queryByRole('dialog', { name: 'How was Marcus?' })).toBeNull()
    const again = screen.getByRole('button', { name: /Rate Marcus/ })
    cleanup()

    // Opening the receipt again later: no pop-up (it was skipped), the button is still there.
    render(<ReceiptModal />)
    expect(await screen.findByRole('button', { name: /Rate Marcus/ })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'How was Marcus?' })).toBeNull()
    expect(again).toBeTruthy()
  })

  it('rating from the receipt saves and says thanks', async () => {
    vi.spyOn(apiService, 'listPendingRatings').mockResolvedValue({ success: true, data: [pending] })
    const submit = vi.spyOn(apiService, 'submitRating').mockResolvedValue({ success: true, data: { bookingId: booking.id, stars: 5 } })
    render(<ReceiptModal />)
    fireEvent.click(await screen.findByRole('radio', { name: '5 stars, Great' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit rating' }))
    const sheet = screen.getByRole('dialog', { name: /How was Marcus|Thanks/ })
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Done' }))
    expect(submit).toHaveBeenCalledWith(booking.id, { stars: 5, tags: [] })
    expect(screen.getByText('Thanks — your rating is saved.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Rate Marcus/ })).toBeNull()
  })

  it('offers no rating when the job is already rated or past the window', async () => {
    vi.spyOn(apiService, 'listPendingRatings').mockResolvedValue({ success: true, data: [] })
    render(<ReceiptModal />)
    await waitFor(() => expect(apiService.listPendingRatings).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Rate/ })).toBeNull()
    expect(screen.queryByRole('dialog', { name: /How was/ })).toBeNull()
  })
})
