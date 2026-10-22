import { loadStripe, type Stripe } from '@stripe/stripe-js'
import type { PaymentIntent, PaymentStatus } from '../types'
import { apiService } from './api'

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
const stripePromise: Promise<Stripe | null> = publishableKey && !/PLACEHOLDER|replace|your_/i.test(publishableKey)
  ? loadStripe(publishableKey)
  : Promise.resolve(null)

export function getStripe(): Promise<Stripe | null> {
  return stripePromise
}

export async function createPaymentIntent(_amount: number, bookingId: string): Promise<PaymentIntent> {
  const result = await apiService.createPaymentIntent(bookingId)
  if (!result.success || !result.data) throw new Error(result.error || 'Unable to initialize payment.')
  return {
    id: result.data.id,
    clientSecret: result.data.clientSecret,
    amount: result.data.amount,
    currency: result.data.currency,
    status: mapStripeStatus(result.data.status),
  }
}

function mapStripeStatus(status: string): PaymentStatus {
  if (status === 'succeeded') return 'succeeded'
  if (status === 'processing') return 'processing'
  if (status === 'canceled') return 'failed'
  return 'pending'
}

export function formatAmount(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}
