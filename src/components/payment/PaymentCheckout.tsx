import { useEffect, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { AlertCircle, Lock, X } from 'lucide-react'
import { createPaymentIntent, dollarsToCents, formatAmount, getStripe } from '../../services/payment'
import Button from '../ui/Button'
import { ErrorState } from '../ui/States'
import { Skeleton } from '../ui/Skeleton'

interface PaymentCheckoutProps {
  amount: number
  bookingId: string
  serviceName: string
  onSuccess: (paymentId: string) => void
  onCancel: () => void
  onError: (error: string) => void
}

function CheckoutHeader({ onCancel }: { onCancel: () => void }) {
  return (
    <header className="checkout__header">
      <button type="button" onClick={onCancel} className="ui-icon-btn ui-icon-btn--plain" aria-label="Close checkout"><X size={22} aria-hidden="true" /></button>
      <h1>Secure checkout</h1>
      <span aria-hidden="true" />
    </header>
  )
}

function StripePaymentForm({ amount, serviceName, onSuccess, onCancel, onError }: Omit<PaymentCheckoutProps, 'bookingId'>) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async () => {
    if (!stripe || !elements || processing) return
    setProcessing(true)
    setMessage(null)
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    setProcessing(false)
    if (error) {
      const text = error.message || 'Payment confirmation failed.'
      setMessage(text)
      onError(text)
      return
    }
    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      onSuccess(paymentIntent.id)
      return
    }
    const text = 'Payment was not completed.'
    setMessage(text)
    onError(text)
  }

  return (
    <div className="checkout ui-screen safe-top">
      <CheckoutHeader onCancel={onCancel} />
      <section className="ui-card checkout__summary">
        <p><span>Service</span><strong>{serviceName}</strong></p>
        <p><span>Total</span><strong className="checkout__total">{formatAmount(dollarsToCents(amount))}</strong></p>
      </section>
      <section className="checkout__element">
        <PaymentElement options={{ layout: 'tabs' }} />
      </section>
      {message && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={16} aria-hidden="true" /> {message}</p>}
      <p className="checkout__note"><Lock size={14} aria-hidden="true" /> Payment details are handled directly by Stripe</p>
      <div className="checkout__actions">
        <Button size="lg" block disabled={!stripe || !elements} loading={processing} loadingLabel="Processing" onClick={() => void submit()}>
          {`Pay ${formatAmount(dollarsToCents(amount))}`}
        </Button>
        <Button variant="ghost" block onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

export default function PaymentCheckout(props: PaymentCheckoutProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const stripe = await getStripe()
      if (!stripe) throw new Error('Stripe publishable key is not configured.')
      return createPaymentIntent(dollarsToCents(props.amount), props.bookingId)
    })()
      .then((intent) => { if (active) setClientSecret(intent.clientSecret) })
      .catch((reason) => {
        const message = reason instanceof Error ? reason.message : 'Unable to initialize secure checkout.'
        if (active) setError(message)
        props.onError(message)
      })
    return () => { active = false }
  }, [props.bookingId, props.amount])

  if (error) {
    return (
      <div className="checkout ui-screen safe-top">
        <CheckoutHeader onCancel={props.onCancel} />
        <ErrorState title="Checkout unavailable" body={error} />
        <Button variant="secondary" block onClick={props.onCancel}>Go back</Button>
      </div>
    )
  }
  if (!clientSecret) {
    return (
      <div className="checkout ui-screen safe-top" role="status" aria-label="Loading secure checkout">
        <CheckoutHeader onCancel={props.onCancel} />
        <Skeleton height={96} radius={16} width="100%" />
        <Skeleton height={220} radius={16} width="100%" className="checkout__skeleton" />
      </div>
    )
  }
  return <Elements stripe={getStripe()} options={{ clientSecret, appearance: { theme: 'night' } }}><StripePaymentForm {...props} /></Elements>
}
