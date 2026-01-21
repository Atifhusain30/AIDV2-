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
  DollarSign,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

// Tip percentage options
const TIP_OPTIONS = [
  { label: '10%', value: 0.1 },
  { label: '15%', value: 0.15 },
  { label: '20%', value: 0.2 },
]

export default function ReceiptModal() {
  const {
    receiptBookingId,
    bookingHistory,
    closeReceipt,
    setTipForBooking,
    setCurrentScreen,
    updateBookingInHistory,
  } = useAppStore()
  
  const [selectedTipPercent, setSelectedTipPercent] = useState<number | null>(null)
  const [customTip, setCustomTip] = useState<string>('')
  const [showCustomTip, setShowCustomTip] = useState(false)
  
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
  
  const currentTip = booking.tipAmount || 0
  const grandTotal = breakdown.total + currentTip
  
  // Format date/time
  const formatDateTime = (date: Date) => {
    const d = new Date(date)
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    }
  }
  
  const { date, time } = formatDateTime(booking.createdAt)
  
  // Handle tip selection
  const handleTipSelect = (percent: number) => {
    setSelectedTipPercent(percent)
    setShowCustomTip(false)
    const tipAmount = Math.round(breakdown.total * percent * 100) / 100
    setTipForBooking(booking.id, tipAmount)
  }
  
  // Handle custom tip
  const handleCustomTipSubmit = () => {
    const tipAmount = parseFloat(customTip)
    if (!isNaN(tipAmount) && tipAmount >= 0) {
      setSelectedTipPercent(null)
      setTipForBooking(booking.id, tipAmount)
    }
  }
  
  // Handle done
  const handleDone = () => {
    // Mark receipt as viewed
    updateBookingInHistory(booking.id, { receiptViewed: true })
    closeReceipt()
    setCurrentScreen('history')
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
                
                {currentTip > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-400">Tip</span>
                    <span className="text-emerald-400">+${currentTip.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="border-t border-white/10 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-white font-bold">Total</span>
                    <span className="text-emerald-400 font-bold text-lg">${grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Payment Method */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <p className="text-xs text-gray-400 font-medium mb-3">PAYMENT METHOD</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                    <CreditCard size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{booking.paymentMethodLabel || 'Visa •••• 4242'}</p>
                    <p className="text-xs text-gray-400">Default payment</p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  Change
                </motion.button>
              </div>
            </div>
            
            {/* Tip Section */}
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-2xl p-4 border border-emerald-500/20">
              <p className="text-xs text-emerald-400 font-medium mb-3">ADD A TIP</p>
              
              {/* Tip buttons */}
              <div className="flex gap-2 mb-3">
                {TIP_OPTIONS.map((option) => {
                  const tipValue = Math.round(breakdown.total * option.value * 100) / 100
                  const isSelected = selectedTipPercent === option.value && !showCustomTip
                  
                  return (
                    <motion.button
                      key={option.label}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleTipSelect(option.value)}
                      className={`flex-1 py-3 rounded-xl text-center transition-all ${
                        isSelected
                          ? 'bg-emerald-500 text-white'
                          : 'bg-white/5 text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      <p className="font-semibold">{option.label}</p>
                      <p className="text-xs opacity-70">${tipValue.toFixed(2)}</p>
                    </motion.button>
                  )
                })}
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowCustomTip(!showCustomTip)
                    setSelectedTipPercent(null)
                  }}
                  className={`flex-1 py-3 rounded-xl text-center transition-all ${
                    showCustomTip
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <p className="font-semibold">Custom</p>
                  <p className="text-xs opacity-70">Enter amount</p>
                </motion.button>
              </div>
              
              {/* Custom tip input */}
              <AnimatePresence>
                {showCustomTip && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex gap-2 overflow-hidden"
                  >
                    <div className="flex-1 relative">
                      <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="number"
                        value={customTip}
                        onChange={(e) => setCustomTip(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full pl-8 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 outline-none focus:border-emerald-500/50"
                      />
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleCustomTipSubmit}
                      className="px-4 py-2.5 bg-emerald-500 text-white font-medium rounded-xl"
                    >
                      Apply
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* No tip option */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => {
                  setSelectedTipPercent(null)
                  setShowCustomTip(false)
                  setTipForBooking(booking.id, 0)
                }}
                className="w-full mt-2 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                No tip
              </motion.button>
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
