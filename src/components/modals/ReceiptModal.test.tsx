import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReceiptModal from './ReceiptModal'
import { useAppStore } from '../../store/useAppStore'
import type { Booking } from '../../types'

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

  it('opens the Stripe-hosted checkout from an unpaid receipt', () => {
    render(<ReceiptModal />)
    expect(screen.queryByText('Visa •••• 4242')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pay securely' }))
    expect(screen.getByTestId('stripe-checkout')).toBeTruthy()
  })
})
