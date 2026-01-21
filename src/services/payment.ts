/**
 * Payment Service - Stripe Integration
 * Handles payment processing for service requests
 */

import { loadStripe, Stripe, StripeElements, PaymentIntent as StripePaymentIntent } from '@stripe/stripe-js'
import type { PaymentIntent, PaymentStatus } from '../types'

// Stripe publishable key - should be from environment
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_PLACEHOLDER'

// Backend URL for creating payment intents
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Stripe instance
let stripePromise: Promise<Stripe | null> | null = null

/**
 * Get or initialize Stripe instance
 */
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY)
  }
  return stripePromise
}

/**
 * Create a payment intent on the backend
 * @param amount - Amount in cents (e.g., $45.00 = 4500)
 * @param bookingId - Associated booking ID
 * @param metadata - Additional metadata
 */
export async function createPaymentIntent(
  amount: number,
  bookingId: string,
  metadata?: Record<string, string>
): Promise<PaymentIntent> {
  try {
    const response = await fetch(`${API_BASE_URL}/payments/create-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add auth token if available
        // 'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        amount,
        currency: 'usd',
        bookingId,
        metadata: {
          ...metadata,
          integration_check: 'accept_a_payment',
        }
      })
    })

    if (!response.ok) {
      throw new Error(`Payment intent creation failed: ${response.statusText}`)
    }

    const data = await response.json()
    
    return {
      id: data.id,
      clientSecret: data.clientSecret,
      amount: data.amount,
      currency: data.currency,
      status: mapStripeStatus(data.status)
    }
  } catch (error) {
    console.error('[Payment] Create intent failed:', error)
    
    // For demo/development - return mock payment intent
    if (import.meta.env.DEV || STRIPE_PUBLISHABLE_KEY.includes('PLACEHOLDER')) {
      console.warn('[Payment] Using mock payment intent for development')
      return createMockPaymentIntent(amount, bookingId)
    }
    
    throw error
  }
}

/**
 * Create a mock payment intent for development/demo
 */
function createMockPaymentIntent(amount: number, bookingId: string): PaymentIntent {
  return {
    id: `pi_mock_${Date.now()}`,
    clientSecret: `pi_mock_${Date.now()}_secret_${Math.random().toString(36).substring(7)}`,
    amount,
    currency: 'usd',
    status: 'pending'
  }
}

/**
 * Map Stripe payment intent status to our status type
 */
function mapStripeStatus(stripeStatus: string): PaymentStatus {
  switch (stripeStatus) {
    case 'succeeded':
      return 'succeeded'
    case 'processing':
      return 'processing'
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
      return 'pending'
    case 'canceled':
      return 'failed'
    default:
      return 'pending'
  }
}

/**
 * Confirm payment with card details
 * @param clientSecret - Payment intent client secret
 * @param stripe - Stripe instance
 * @param elements - Stripe elements
 */
export async function confirmPayment(
  clientSecret: string,
  stripe: Stripe,
  elements: StripeElements
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + '/payment/success',
      },
      redirect: 'if_required'
    })

    if (error) {
      console.error('[Payment] Confirm failed:', error)
      return { success: false, error: error.message }
    }

    if (paymentIntent?.status === 'succeeded') {
      return { success: true }
    }

    return { success: false, error: 'Payment not completed' }
  } catch (error) {
    console.error('[Payment] Confirm error:', error)
    return { success: false, error: 'Payment confirmation failed' }
  }
}

/**
 * Process a mock/demo payment (for development)
 * Simulates a successful payment
 */
export async function processDemoPayment(
  amount: number,
  bookingId: string
): Promise<{ success: boolean; paymentId: string }> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  // 95% success rate for demo
  const success = Math.random() > 0.05
  
  return {
    success,
    paymentId: `demo_${Date.now()}_${bookingId}`
  }
}

/**
 * Get payment status
 */
export async function getPaymentStatus(paymentIntentId: string): Promise<PaymentStatus> {
  try {
    const response = await fetch(`${API_BASE_URL}/payments/${paymentIntentId}`)
    
    if (!response.ok) {
      throw new Error('Failed to get payment status')
    }
    
    const data = await response.json()
    return mapStripeStatus(data.status)
  } catch (error) {
    console.error('[Payment] Get status failed:', error)
    return 'pending'
  }
}

/**
 * Format amount for display
 * @param cents - Amount in cents
 */
export function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Convert dollars to cents
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export const paymentService = {
  getStripe,
  createPaymentIntent,
  confirmPayment,
  processDemoPayment,
  getPaymentStatus,
  formatAmount,
  dollarsToCents
}

export default paymentService
