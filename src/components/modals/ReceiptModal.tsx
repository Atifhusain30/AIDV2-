/**
 * ReceiptModal Component
 * Shows receipt for completed bookings with price breakdown and tip options
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Dialog from '../ui/Dialog'
import {
  X,
  Receipt,
  MapPin,
  Calendar,
  Clock,
  CreditCard,
  Check,
  Star,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useAuthStore } from '../../store/useAuthStore'
import PaymentCheckout from '../payment/PaymentCheckout'
import RatingSheet from '../rating/RatingSheet'
import { formatPrice } from '../../lib/money'
import { apiService } from '../../services/api'
import { markRatingSkipped, shouldAutoAsk, type PendingRating } from '../../lib/ratings'

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
  
  // Find the booking
  const booking = bookingHistory.find(b => b.id === receiptBookingId)
  
  // If no receipt to show, return null
  if (!receiptBookingId || !booking) return null
  
  // Only amounts the server reported: the itemised breakdown when there is one, otherwise the total.
  const breakdown = booking.priceBreakdown
  const isFinal = booking.finalPrice != null
  const grandTotal = booking.finalPrice ?? breakdown?.total ?? booking.estimatedPrice
  const driverName = booking.driver?.name || booking.driver?.firstName

  // Format date/time
  const formatDateTime = (date: Date) => {
    const d = new Date(date)
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    }
  }
  
  const { date, time } = formatDateTime(booking.createdAt)
  
  // Handle done
  const handleDone = () => {
    // Mark receipt as viewed
    updateBookingInHistory(booking.id, { receiptViewed: true })
    closeReceipt()
    setCurrentScreen('history')
  }

  if (showCheckout) {
    return (
      <PaymentCheckout
        amount={grandTotal}
        bookingId={booking.id}
        serviceName={booking.service.name}
        onSuccess={(paymentId) => {
          updateBookingInHistory(booking.id, {
            payment: { intentId: paymentId, status: 'processing', amount: grandTotal },
          })
          setPaymentError(null)
          setShowCheckout(false)
        }}
        onCancel={() => setShowCheckout(false)}
        onError={setPaymentError}
      />
    )
  }
  
  const ratingSheet = ratingOpen && pendingRating ? (
    <RatingSheet
      pending={pendingRating}
      context="after_job"
      onRated={() => { setRated(true); setRatingOpen(false) }}
      onSkip={() => { if (userId) markRatingSkipped(userId, pendingRating.bookingId); setRatingOpen(false) }}
    />
  ) : null

  return (
    <>
    <Dialog labelledBy="receipt-title" onClose={handleDone} handle={false}
      backdropClassName="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-gradient-to-b from-[#1a1a3e] to-[#12122a] rounded-3xl border border-white/10 shadow-2xl aid-pop-in">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-gradient-to-b from-[#1a1a3e] to-transparent p-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Receipt size={20} className="text-emerald-400" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="receipt-title" className="text-xl font-bold text-white">Receipt</h2>
                  <p className="text-xs text-gray-400">Service completed</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDone}
                aria-label="Close receipt"
                className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
          
          <div className="px-6 pb-6 space-y-4">
            {/* Service Summary */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">{booking.service.name}</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Check size={14} className="text-emerald-400" />
                    <span className="text-sm text-emerald-400">Completed</span>
                  </div>
                </div>
                {driverName && (
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center text-sm font-semibold text-violet-300">
                      {driverName.charAt(0).toUpperCase()}
                    </div>
                  </div>
                )}
              </div>

              {/* Driver (from the server) */}
              {driverName && (
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/10">
                  <span className="text-gray-400 text-sm">Driver:</span>
                  <span className="text-white text-sm font-medium">{driverName}</span>
                </div>
              )}
              
              {/* Date/Time/Location/Vehicle */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Calendar size={14} />
                  <span>{date}</span>
                  <Clock size={14} className="ml-2" />
                  <span>{time}</span>
                </div>
                <div className="flex items-start gap-2 text-gray-400 text-sm">
                  <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{booking.location.address}</span>
                </div>
                {booking.vehicle && (
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <span className="text-gray-400">Vehicle:</span>
                    <span>{booking.vehicle.label}</span>
                    {booking.vehicle.plate && (
                      <span className="text-gray-400">({booking.vehicle.plate})</span>
                    )}
                  </div>
                )}
              </div>
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

            {/* Price Breakdown */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <p className="text-xs text-gray-400 font-medium mb-3">PRICE BREAKDOWN</p>
              
              <div className="space-y-2">
                {breakdown ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Base fee</span>
                      <span className="text-white">{formatPrice(breakdown.baseFee)}</span>
                    </div>
                    {breakdown.distanceFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Distance fee</span>
                        <span className="text-white">{formatPrice(breakdown.distanceFee)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{booking.service.name}</span>
                    <span className="text-white">{formatPrice(grandTotal)}</span>
                  </div>
                )}

                <div className="border-t border-white/10 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-white font-bold">{isFinal ? 'Total' : 'Quoted total'}</span>
                    <span className="text-emerald-400 font-bold text-lg">{formatPrice(grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Secure Payment */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <p className="text-xs text-gray-400 font-medium mb-3">SECURE PAYMENT</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <CreditCard size={20} className="text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">
                    {booking.payment?.status === 'succeeded'
                      ? 'Paid securely with Stripe'
                      : booking.payment?.status === 'processing'
                        ? 'Payment is processing'
                        : 'Payment required'}
                  </p>
                  <p className="text-xs text-gray-400">Card details are entered only in Stripe's hosted form.</p>
                </div>
              </div>
              {paymentError && <p className="mt-3 text-sm text-red-400">{paymentError}</p>}
              {booking.payment?.status !== 'succeeded' && booking.payment?.status !== 'processing' && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setPaymentError(null)
                    setShowCheckout(true)
                  }}
                  className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold"
                >
                  Pay securely
                </motion.button>
              )}
            </div>
            
            {/* Done Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDone}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-2xl shadow-lg shadow-emerald-500/20"
            >
              Done
            </motion.button>
          </div>
    </Dialog>
    {ratingSheet}
    </>
  )
}
