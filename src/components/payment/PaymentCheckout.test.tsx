import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PaymentCheckout from './PaymentCheckout'

const { createPaymentIntent } = vi.hoisted(() => ({ createPaymentIntent: vi.fn() }))
vi.mock('../../services/payment', () => ({
  createPaymentIntent,
  dollarsToCents: (value: number) => Math.round(value * 100),
  formatAmount: (value: number) => `$${(value / 100).toFixed(2)}`,
  getStripe: () => Promise.resolve(null),
}))

describe('PaymentCheckout', () => {
  it('does not create a server PaymentIntent when the Stripe client key is missing', async () => {
    const onError = vi.fn()
    render(
      <PaymentCheckout
        amount={125}
        bookingId="booking-1"
        serviceName="Towing"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
        onError={onError}
      />,
    )

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Stripe publishable key is not configured.'))
    expect(createPaymentIntent).not.toHaveBeenCalled()
  })
})
