/**
 * C2: save a card with Stripe's own secure form (setup mode). The card number goes straight from this
 * form to Stripe; AID's servers only ever learn the brand and last four digits.
 */

import { useEffect, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { AlertCircle, Lock } from 'lucide-react'
import { apiService } from '../../services/api'
import { getStripe } from '../../services/payment'
import { usePaymentStore } from '../../store/usePaymentStore'
import BottomSheet from '../ui/BottomSheet'
import Button from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'

interface AddCardSheetProps {
  onClose: () => void
  /** Called with the new card's id once Stripe has saved it. */
  onSaved?: (cardId: string) => void
}

function CardForm({ onClose, onSaved }: AddCardSheetProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    if (!stripe || !elements || saving) return
    setSaving(true)
    setMessage(null)
    const { error, setupIntent } = await stripe.confirmSetup({
      elements, redirect: 'if_required', confirmParams: { return_url: window.location.href },
    })
    if (error || setupIntent?.status !== 'succeeded') {
      setSaving(false)
      setMessage(error?.message || "This card couldn't be saved. Check the details or try another card.")
      return
    }
    const cardId = typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method?.id
    await usePaymentStore.getState().load()
    if (cardId) usePaymentStore.getState().select(cardId)
    setSaving(false)
    if (cardId) onSaved?.(cardId)
    onClose()
  }

  return (
    <BottomSheet title="Add a card" closeLabel="Close" dismissible={!saving} onClose={onClose}
      footer={(
        <>
          {message && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={16} aria-hidden="true" /> {message}</p>}
          <Button size="lg" block disabled={!stripe || !elements} loading={saving} loadingLabel="Saving card…" onClick={() => void save()}>Save card</Button>
        </>
      )}>
      <div className="add-card__form"><PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } }} /></div>
      <p className="add-card__note"><Lock size={14} aria-hidden="true" /> Your card is stored securely by Stripe. When you request help, the price is held on it and charged only when the job is done.</p>
    </BottomSheet>
  )
}

export default function AddCardSheet(props: AddCardSheetProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      if (!await getStripe()) throw new Error('Card payments are not set up in this version of the app.')
      const result = await apiService.createCardSetup()
      if (!result.success || !result.data) throw new Error(result.error || 'Unable to open the card form. Try again.')
      return result.data.clientSecret
    })().then((secret) => { if (active) setClientSecret(secret) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to open the card form. Try again.') })
    return () => { active = false }
  }, [])

  if (!clientSecret) {
    return (
      <BottomSheet title="Add a card" closeLabel="Close" onClose={props.onClose}>
        {error
          ? <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>
          : <div role="status" aria-label="Loading the secure card form"><Skeleton height={150} radius={14} width="100%" /></div>}
      </BottomSheet>
    )
  }
  return (
    <Elements stripe={getStripe()} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#8b5cf6' } } }}>
      <CardForm {...props} />
    </Elements>
  )
}
