/**
 * ReceiptModal Component
 * Shows receipt for completed bookings with price breakdown and tip options
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Receipt,
  MapPin,
  Calendar,
  Clock,
  CreditCard,
  Star,
  Check,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import PaymentCheckout from '../payment/PaymentCheckout'

export default function ReceiptModal() {
  const {
    receiptBookingId,
    bookingHistory,
    closeReceipt,
    setCurrentScreen,
    updateBookingInHistory,
  } = useAppStore()
  const [showCheckout, setShowCheckout] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  
  // Find the booking
  const booking = bookingHistory.find(b => b.id === receiptBookingId)
  
  // If no receipt to show, return null
  if (!receiptBookingId || !booking) return null
  
  // Calculate totals
  const breakdown = booking.priceBreakdown || {
    baseFee: booking.estimatedPrice * 0.6,
    distanceFee: booking.estimatedPrice * 0.35,
    surgeFee: booking.estimatedPrice * 0.05,
    total: booking.estimatedPrice,
  }
  
  const grandTotal = breakdown.total
  
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
        amount={booking.estimatedPrice}
        bookingId={booking.id}
        serviceName={booking.service.name}
        onSuccess={(paymentId) => {
          updateBookingInHistory(booking.id, {
            payment: { intentId: paymentId, status: 'processing', amount: booking.estimatedPrice },
          })
          setPaymentError(null)
          setShowCheckout(false)
        }}
        onCancel={() => setShowCheckout(false)}
        onError={setPaymentError}
      />
    )
  }
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={handleDone}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-gradient-to-b from-[#1a1a3e] to-[#12122a] rounded-3xl border border-white/10 shadow-2xl"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-gradient-to-b from-[#1a1a3e] to-transparent p-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Receipt size={20} className="text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Receipt</h2>
                  <p className="text-xs text-gray-400">Service completed</p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleDone}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </motion.button>
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
                {booking.mechanic && (
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-sm font-semibold text-white">
                      {booking.mechanic.initials}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Provider info */}
              {booking.mechanic && (
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/10">
                  <span className="text-gray-400 text-sm">Provider:</span>
                  <span className="text-white text-sm font-medium">{booking.mechanic.name}</span>
                  <div className="flex items-center gap-1 ml-auto">
                    <Star size={12} className="text-amber-400 fill-amber-400" />
                    <span className="text-sm text-gray-400">{booking.mechanic.rating}</span>
                  </div>
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
                    <span className="text-gray-500">Vehicle:</span>
                    <span>{booking.vehicle.label}</span>
                    {booking.vehicle.plate && (
                      <span className="text-gray-500">({booking.vehicle.plate})</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Price Breakdown */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <p className="text-xs text-gray-400 font-medium mb-3">PRICE BREAKDOWN</p>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Base fee</span>
                  <span className="text-white">${breakdown.baseFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Distance fee</span>
                  <span className="text-white">${breakdown.distanceFee.toFixed(2)}</span>
                </div>
                {breakdown.surgeFee && breakdown.surgeFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Surge pricing</span>
                    <span className="text-white">${breakdown.surgeFee.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="border-t border-white/10 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-white font-medium">Subtotal</span>
                    <span className="text-white font-semibold">${breakdown.total.toFixed(2)}</span>
                  </div>
                </div>
                
                <div className="border-t border-white/10 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-white font-bold">Total</span>
                    <span className="text-emerald-400 font-bold text-lg">${grandTotal.toFixed(2)}</span>
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
