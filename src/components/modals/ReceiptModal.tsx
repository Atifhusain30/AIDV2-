/**
 * Receipt for a completed booking (the one bottom-sheet style). Shows only what the server
 * reported: the itemised breakdown when there is one, otherwise the total; the real driver;
 * payment through Stripe's hosted form; and the B15 rating prompt while the job can be rated.
 */

import { useEffect, useState } from 'react'
import { CalendarDays, Car, Check, CreditCard, MapPin, Star } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useAuthStore } from '../../store/useAuthStore'
import BottomSheet from '../ui/BottomSheet'
import ChunkBoundary from '../ui/ChunkBoundary'
import { SkeletonRows } from '../ui/Skeleton'
import { lazyWithRetry } from '../../lib/lazyWithRetry'
import Button from '../ui/Button'
import { InfoRow, List } from '../ui/ListRow'
import PersonAvatar from '../ui/PersonAvatar'
import { formatPrice } from '../../lib/money'
import { apiService } from '../../services/api'
import { markRatingSkipped, shouldAutoAsk, type PendingRating } from '../../lib/ratings'

// F6: Stripe and the rating sheet download only when they're opened.
const PaymentCheckout = lazyWithRetry(() => import('../payment/PaymentCheckout'))
const RatingSheet = lazyWithRetry(() => import('../rating/RatingSheet'))

export default function ReceiptModal() {
  const {
    receiptBookingId,
    bookingHistory,
    closeReceipt,
    setCurrentScreen,
    updateBookingInHistory,
  } = useAppStore()
  const userId = useAuthStore((state) => state.user?.id)
  const [showCheckout, setShowCheckout] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  // B15: rate the driver from the receipt. The server says whether this job can still be rated.
  const [pendingRating, setPendingRating] = useState<PendingRating | null>(null)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [rated, setRated] = useState(false)

  useEffect(() => {
    setPendingRating(null)
    setRatingOpen(false)
    setRated(false)
    if (!receiptBookingId) return
    let cancelled = false
    void apiService.listPendingRatings().then((result) => {
      if (cancelled || !result.success) return
      const pending = result.data?.find((item) => item.bookingId === receiptBookingId) || null
      setPendingRating(pending)
      // Ask by itself right after the job; once skipped (or reminded), the button below stays.
      if (pending && userId && shouldAutoAsk(userId, pending.bookingId)) setRatingOpen(true)
    })
    return () => { cancelled = true }
  }, [receiptBookingId, userId])

  const booking = bookingHistory.find((b) => b.id === receiptBookingId)
  if (!receiptBookingId || !booking) return null

  // Only amounts the server reported: the itemised breakdown when there is one, otherwise the total.
  const breakdown = booking.priceBreakdown
  const isFinal = booking.finalPrice != null
  const grandTotal = booking.finalPrice ?? breakdown?.total ?? booking.estimatedPrice
  const driverName = booking.driver?.name || booking.driver?.firstName
  const created = new Date(booking.createdAt)
  const date = created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const paid = booking.payment?.status === 'succeeded'
  const processing = booking.payment?.status === 'processing'

  const handleDone = () => {
    updateBookingInHistory(booking.id, { receiptViewed: true })
    closeReceipt()
    setCurrentScreen('history')
  }

  if (showCheckout) {
    return (
      <ChunkBoundary fallback={<SkeletonRows count={2} label="Loading payment" />}>
        <PaymentCheckout
          amount={grandTotal}
          bookingId={booking.id}
          serviceName={booking.service.name}
          onSuccess={(paymentId) => {
            updateBookingInHistory(booking.id, { payment: { intentId: paymentId, status: 'processing', amount: grandTotal } })
            setPaymentError(null)
            setShowCheckout(false)
          }}
          onCancel={() => setShowCheckout(false)}
          onError={setPaymentError}
        />
      </ChunkBoundary>
    )
  }

  const footer = paid || processing
    ? <Button size="lg" block onClick={handleDone}>Done</Button>
    : (
      <>
        <Button size="lg" block icon={<CreditCard size={18} aria-hidden="true" />} onClick={() => { setPaymentError(null); setShowCheckout(true) }}>Pay securely</Button>
        <Button variant="ghost" block onClick={handleDone}>Done</Button>
      </>
    )

  return (
    <>
      <BottomSheet title="Receipt" titleId="receipt-title" subtitle={`${booking.service.name} · ${date}`} closeLabel="Close receipt" className="receipt-sheet" onClose={handleDone} footer={footer}>
        <div className="receipt-total">
          <span className="ui-chip ui-chip--success"><Check size={13} aria-hidden="true" /> Completed</span>
          <strong>{formatPrice(grandTotal)}</strong>
          <small>{isFinal ? 'Total' : 'Quoted total'}</small>
        </div>

        {/* B15: rate the driver (only while the server says this job can still be rated) */}
        {rated ? (
          <p className="rating-done" role="status"><Star size={16} aria-hidden="true" /> Thanks — your rating is saved.</p>
        ) : pendingRating && (
          <button type="button" className="rating-prompt" onClick={() => setRatingOpen(true)}>
            <Star size={20} aria-hidden="true" />
            <span>Rate {pendingRating.rateeFirstName || 'your driver'}<small>Until {new Date(pendingRating.rateBy).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></span>
          </button>
        )}

        <List label="Service details">
          {driverName && <InfoRow icon={<PersonAvatar name={driverName} size="sm" />} title={driverName} subtitle="Driver" />}
          <InfoRow icon={<CalendarDays size={18} />} title={`${date} at ${time}`} subtitle="Requested" />
          <InfoRow icon={<MapPin size={18} />} title={booking.location.address} subtitle="Location" />
          {booking.vehicle && <InfoRow icon={<Car size={18} />} title={`${booking.vehicle.label}${booking.vehicle.plate ? ` · ${booking.vehicle.plate}` : ''}`} subtitle="Vehicle" />}
        </List>

        <section className="receipt-lines" aria-labelledby="receipt-price-title">
          <h3 id="receipt-price-title">Price</h3>
          {breakdown ? (
            <>
              <p><span>Base fee</span><span>{formatPrice(breakdown.baseFee)}</span></p>
              {breakdown.distanceFee > 0 && <p><span>Distance fee</span><span>{formatPrice(breakdown.distanceFee)}</span></p>}
            </>
          ) : (
            <p><span>{booking.service.name}</span><span>{formatPrice(grandTotal)}</span></p>
          )}
          <p className="receipt-lines__total"><span>{isFinal ? 'Total' : 'Quoted total'}</span><span>{formatPrice(grandTotal)}</span></p>
        </section>

        <div className="receipt-payment">
          <CreditCard size={18} aria-hidden="true" />
          <div>
            <strong>{paid ? 'Paid securely with Stripe' : processing ? 'Payment is processing' : 'Payment required'}</strong>
            <small>Card details are entered only in Stripe's hosted form.</small>
          </div>
        </div>
        {paymentError && <p className="ui-alert ui-alert--danger" role="alert">{paymentError}</p>}
      </BottomSheet>
      {ratingOpen && pendingRating && (
        <ChunkBoundary>
          <RatingSheet
            pending={pendingRating}
            context="after_job"
            onRated={() => { setRated(true); setRatingOpen(false) }}
            onSkip={() => { if (userId) markRatingSkipped(userId, pendingRating.bookingId); setRatingOpen(false) }}
          />
        </ChunkBoundary>
      )}
    </>
  )
}
