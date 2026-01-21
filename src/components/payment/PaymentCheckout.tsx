/**
 * Payment Checkout Component
 * Handles Stripe payment flow for service requests
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  CreditCard, 
  Loader2, 
  Check, 
  AlertCircle, 
  Lock,
  X,
  Apple
} from 'lucide-react'
import { paymentService, formatAmount, dollarsToCents, processDemoPayment } from '../../services/payment'

interface PaymentCheckoutProps {
  amount: number // In dollars
  bookingId: string
  serviceName: string
  onSuccess: (paymentId: string) => void
  onCancel: () => void
  onError: (error: string) => void
}

type PaymentState = 'input' | 'processing' | 'success' | 'error'

export default function PaymentCheckout({
  amount,
  bookingId,
  serviceName,
  onSuccess,
  onCancel,
  onError
}: PaymentCheckoutProps) {
  const [paymentState, setPaymentState] = useState<PaymentState>('input')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<'card' | 'apple_pay'>('card')
  
  // Demo card form state
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [cardName, setCardName] = useState('')

  // Format card number with spaces
  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '')
    const chunks = cleaned.match(/.{1,4}/g) || []
    return chunks.join(' ').substring(0, 19)
  }

  // Format expiry as MM/YY
  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, '')
    if (cleaned.length >= 2) {
      return cleaned.substring(0, 2) + '/' + cleaned.substring(2, 4)
    }
    return cleaned
  }

  const handlePayment = async () => {
    if (selectedMethod === 'card') {
      // Validate card details
      if (!cardNumber || cardNumber.replace(/\s/g, '').length < 16) {
        setErrorMessage('Please enter a valid card number')
        return
      }
      if (!expiry || expiry.length < 5) {
        setErrorMessage('Please enter a valid expiry date')
        return
      }
      if (!cvc || cvc.length < 3) {
        setErrorMessage('Please enter a valid CVC')
        return
      }
    }

    setPaymentState('processing')
    setErrorMessage(null)

    try {
      // For demo/development, use mock payment
      // In production, this would use real Stripe integration
      const result = await processDemoPayment(dollarsToCents(amount), bookingId)

      if (result.success) {
        setPaymentState('success')
        // Delay to show success animation
        setTimeout(() => {
          onSuccess(result.paymentId)
        }, 1500)
      } else {
        setPaymentState('error')
        setErrorMessage('Payment failed. Please try again.')
        onError('Payment failed')
      }
    } catch (error) {
      setPaymentState('error')
      setErrorMessage('An error occurred. Please try again.')
      onError(error instanceof Error ? error.message : 'Payment error')
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] px-6 py-8 safe-top">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button onClick={onCancel} className="text-gray-400">
          <X size={24} />
        </button>
        <h1 className="text-lg font-bold text-white">Checkout</h1>
        <div className="w-6" />
      </div>

      <AnimatePresence mode="wait">
        {paymentState === 'success' ? (
          // Success State
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center pt-20"
          >
            <motion.div
              className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center mb-6"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
            >
              <Check size={48} className="text-white" />
            </motion.div>
            <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
            <p className="text-gray-400">Your service request is being processed</p>
          </motion.div>
        ) : paymentState === 'processing' ? (
          // Processing State
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center pt-20"
          >
            <Loader2 size={48} className="text-violet-400 animate-spin mb-6" />
            <h2 className="text-xl font-bold text-white mb-2">Processing Payment</h2>
            <p className="text-gray-400 text-sm">Please wait...</p>
          </motion.div>
        ) : (
          // Input State
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Order Summary */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400">Service</span>
                <span className="text-white font-medium">{serviceName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Total</span>
                <span className="text-2xl font-bold text-white">{formatAmount(dollarsToCents(amount))}</span>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div className="mb-6">
              <h3 className="text-gray-400 text-sm font-medium mb-3">Payment Method</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedMethod('card')}
                  className={`p-4 rounded-xl border flex items-center gap-3 ${
                    selectedMethod === 'card'
                      ? 'bg-violet-500/10 border-violet-500/50'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <CreditCard size={20} className={selectedMethod === 'card' ? 'text-violet-400' : 'text-gray-400'} />
                  <span className={selectedMethod === 'card' ? 'text-white' : 'text-gray-400'}>Card</span>
                </button>
                <button
                  onClick={() => setSelectedMethod('apple_pay')}
                  className={`p-4 rounded-xl border flex items-center gap-3 ${
                    selectedMethod === 'apple_pay'
                      ? 'bg-violet-500/10 border-violet-500/50'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <Apple size={20} className={selectedMethod === 'apple_pay' ? 'text-violet-400' : 'text-gray-400'} />
                  <span className={selectedMethod === 'apple_pay' ? 'text-white' : 'text-gray-400'}>Apple Pay</span>
                </button>
              </div>
            </div>

            {/* Card Form */}
            {selectedMethod === 'card' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4 mb-6"
              >
                <div>
                  <label className="block text-gray-400 text-xs mb-2">Card Number</label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 text-xs mb-2">Cardholder Name</label>
                  <input
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-400 text-xs mb-2">Expiry</label>
                    <input
                      type="text"
                      value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      placeholder="MM/YY"
                      maxLength={5}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-2">CVC</label>
                    <input
                      type="text"
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').substring(0, 4))}
                      placeholder="123"
                      maxLength={4}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                </div>

                {/* Test Card Notice */}
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-400 text-xs">
                    <strong>Demo Mode:</strong> Use any valid card format. Payment is simulated.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Apple Pay Button */}
            {selectedMethod === 'apple_pay' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-6"
              >
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <Apple size={32} className="text-white mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">
                    Apple Pay will be available on iOS devices
                  </p>
                </div>
              </motion.div>
            )}

            {/* Error Message */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2"
                >
                  <AlertCircle size={16} className="text-red-400" />
                  <span className="text-red-400 text-sm">{errorMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Security Notice */}
            <div className="flex items-center gap-2 justify-center mb-6">
              <Lock size={14} className="text-gray-500" />
              <span className="text-gray-500 text-xs">Secured with 256-bit SSL encryption</span>
            </div>

            {/* Pay Button */}
            <motion.button
              onClick={handlePayment}
              className="w-full bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-violet-500/30"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Pay {formatAmount(dollarsToCents(amount))}
            </motion.button>

            {/* Cancel */}
            <button
              onClick={onCancel}
              className="w-full py-4 text-gray-400 text-sm mt-3"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
