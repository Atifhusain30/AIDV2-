import { useEffect, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { motion } from 'framer-motion'
import { AlertCircle, Loader2, Lock, X } from 'lucide-react'
import { createPaymentIntent, dollarsToCents, formatAmount, getStripe } from '../../services/payment'

interface PaymentCheckoutProps {
  amount: number
  bookingId: string
  serviceName: string
  onSuccess: (paymentId: string) => void
  onCancel: () => void
  onError: (error: string) => void
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
    <main className="min-h-screen bg-[#0a0a0f] px-6 py-8 safe-top">
      <header className="flex items-center justify-between mb-8">
        <button type="button" onClick={onCancel} className="w-11 h-11 -ml-2 grid place-items-center text-gray-400" aria-label="Close checkout"><X size={24} aria-hidden="true" /></button>
        <h1 className="text-lg font-bold text-white">Secure checkout</h1>
        <div className="w-6" />
      </header>

      <section className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6">
        <div className="flex items-center justify-between mb-3"><span className="text-gray-400">Service</span><span className="text-white font-medium">{serviceName}</span></div>
        <div className="flex items-center justify-between"><span className="text-gray-400">Total</span><span className="text-2xl font-bold text-white">{formatAmount(dollarsToCents(amount))}</span></div>
      </section>

      <section className="p-4 rounded-xl bg-white border border-white/10 mb-6">
        <PaymentElement options={{ layout: 'tabs' }} />
      </section>

      {message && <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2"><AlertCircle size={16} className="text-red-400" /><span className="text-red-400 text-sm">{message}</span></div>}
      <div className="flex items-center gap-2 justify-center mb-6"><Lock size={14} className="text-gray-400" /><span className="text-gray-400 text-xs">Payment details are handled directly by Stripe</span></div>
      <motion.button type="button" onClick={() => void submit()} disabled={!stripe || !elements || processing} className="w-full bg-gradient-to-r from-violet-500 to-purple-500 disabled:opacity-50 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2" whileTap={{ scale: 0.98 }}>
        {processing ? <><Loader2 size={18} className="animate-spin" /> Processing</> : `Pay ${formatAmount(dollarsToCents(amount))}`}
      </motion.button>
      <button type="button" onClick={onCancel} className="w-full py-4 text-gray-400 text-sm mt-3">Cancel</button>
    </main>
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
    return <main className="min-h-screen bg-[#0a0a0f] px-6 py-8 safe-top flex flex-col items-center justify-center text-center"><AlertCircle size={42} className="text-red-400 mb-4" /><h1 className="text-xl font-bold text-white mb-2">Checkout unavailable</h1><p className="text-gray-400 mb-6">{error}</p><button type="button" onClick={props.onCancel} className="px-6 py-3 rounded-xl bg-white/10 text-white">Go back</button></main>
  }
  if (!clientSecret) {
    return <main className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><Loader2 size={42} className="text-violet-400 animate-spin" /></main>
  }
  return <Elements stripe={getStripe()} options={{ clientSecret, appearance: { theme: 'night' } }}><StripePaymentForm {...props} /></Elements>
}
