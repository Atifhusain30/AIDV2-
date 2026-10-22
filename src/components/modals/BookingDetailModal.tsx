import { motion, AnimatePresence } from 'framer-motion'
import { 
  X,
  MapPin,
  Star,
  Navigation,
  RefreshCw,
  Calendar,
  FileText,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Truck,
  Wrench,
  Droplets,
  Battery,
  CircleDot,
  Key,
  Zap,
  Fuel,
  Sparkles,
  Sun,
  ExternalLink,
  Receipt,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { ServiceType, BookingStatus } from '../../types'
import { formatPrice } from '../../lib/money'
import { jobCountLabel, ratingSummary } from '../../lib/ratings'
import { useState } from 'react'
import Dialog from '../ui/Dialog'

const MODAL_BACKDROP = 'fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm'
import { MessageCircle } from 'lucide-react'
import { endedChatReadable } from '../../lib/chat'
import JobChat from '../chat/JobChat'

// Generate Google Maps URL
const getMapsUrl = (lat: number, lng: number): string => {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

// Service icons mapping
const serviceIcons: Record<ServiceType, React.ElementType> = {
  oil_change: Droplets,
  battery_jump: Battery,
  flat_tire: CircleDot,
  lockout: Key,
  towing: Truck,
  ev_charging: Zap,
  fuel_delivery: Fuel,
  detailing: Sparkles,
  window_tinting: Sun,
}

// Status display config
const statusConfig: Record<BookingStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: 'text-gray-400', bgColor: 'bg-gray-500/20' },
  searching: { label: 'Finding Provider', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  accepted: { label: 'Accepted', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  en_route: { label: 'On The Way', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  arrived: { label: 'Arrived', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  in_progress: { label: 'In Progress', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  completed: { label: 'Completed', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  cancelled: { label: 'Cancelled', color: 'text-red-400', bgColor: 'bg-red-500/20' },
  expired: { label: 'No driver found', color: 'text-red-400', bgColor: 'bg-red-500/20' },
}

// Format date helper
const formatDate = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const formatTime = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// Booking Stepper Component
function BookingStepper({ status }: { status: BookingStatus }) {
  const stages: { key: BookingStatus; label: string }[] = [
    { key: 'searching', label: 'Finding' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'en_route', label: 'En Route' },
    { key: 'arrived', label: 'Arrived' },
    { key: 'completed', label: 'Done' },
  ]
  
  const statusOrder: BookingStatus[] = ['searching', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed']
  const currentIndex = statusOrder.indexOf(status)
  
  if (status === 'cancelled' || status === 'expired' || status === 'pending') {
    return (
      <div className="flex items-center justify-center py-4">
        <span className={`px-4 py-2 rounded-full text-sm font-medium ${statusConfig[status].bgColor} ${statusConfig[status].color}`}>
          {statusConfig[status].label}
        </span>
      </div>
    )
  }
  
  return (
    <div className="py-4">
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const stageIndex = statusOrder.indexOf(stage.key)
          const isActive = currentIndex >= stageIndex
          const isCurrent = status === stage.key || (status === 'in_progress' && stage.key === 'arrived')
          
          return (
            <div key={stage.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                    isActive 
                      ? isCurrent 
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/50' 
                        : 'bg-emerald-500/30 text-emerald-400' 
                      : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {isActive && !isCurrent ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    index + 1
                  )}
                </motion.div>
                <span className={`text-xs mt-1 ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
                  {stage.label}
                </span>
              </div>
              {index < stages.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 mb-4 ${
                  currentIndex > stageIndex ? 'bg-emerald-500/50' : 'bg-white/10'
                }`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function BookingDetailModal() {
  const {
    selectedBookingId,
    bookingHistory,
    closeBookingDetail,
    activeBooking,
    setCurrentScreen,
    rebookFromHistory,
    openReceipt,
  } = useAppStore()

  // Find the booking
  const booking = bookingHistory.find(b => b.id === selectedBookingId)
  const [chatOpen, setChatOpen] = useState(false)

  // Don't render if no booking selected
  if (!selectedBookingId) return null

  // Handle close
  const handleClose = () => {
    setChatOpen(false)
    closeBookingDetail()
  }

  // Open the live status screen for the request that is in progress right now
  const handleTrack = () => {
    closeBookingDetail()
    setCurrentScreen('chat')
  }

  // Rebook action (opens the request sheet on Home)
  const handleRebook = () => {
    if (!booking) return
    rebookFromHistory(booking.id)
    closeBookingDetail()
  }

  // View Receipt action (for completed bookings)
  const handleViewReceipt = () => {
    if (!booking) return
    closeBookingDetail()
    openReceipt(booking.id)
  }

  // Show error state if booking not found
  if (!booking) {
    return (
      <Dialog labelledBy="booking-missing-title" describedBy="booking-missing-text" onClose={handleClose} handle={false}
        backdropClassName={MODAL_BACKDROP} className="w-full max-w-md bg-[#12122a] rounded-t-3xl p-6 text-center aid-sheet-in">
            <AlertTriangle size={48} className="mx-auto text-amber-400 mb-4" aria-hidden="true" />
            <h2 id="booking-missing-title" className="text-lg font-semibold text-white mb-2">Booking Not Found</h2>
            <p id="booking-missing-text" className="text-gray-400 mb-6">This booking may have been removed.</p>
            <button
              type="button"
              onClick={handleClose}
              className="w-full py-3 bg-white/10 rounded-xl text-white font-medium"
            >
              Close
            </button>
      </Dialog>
    )
  }

  const ServiceIcon = serviceIcons[booking.service.id] || Wrench
  const statusInfo = statusConfig[booking.status]
  const isTerminal = booking.status === 'cancelled' || booking.status === 'completed' || booking.status === 'expired'
  const isActiveRequest = !isTerminal && activeBooking?.id === booking.id
  const driver = booking.driver
  const driverVehicle = driver?.vehicle ? [driver.vehicle.color, driver.vehicle.make, driver.vehicle.model].filter(Boolean).join(' ') : ''
  const driverRating = ratingSummary(driver)
  const chatReadable = endedChatReadable(booking)

  return (
    <Dialog labelledBy="booking-detail-title" onClose={handleClose} handle={false} backdropClassName={MODAL_BACKDROP}
      className="w-full max-w-md bg-[#12122a] rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col aid-sheet-in">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 id="booking-detail-title" className="text-lg font-semibold text-white">Booking Details</h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close booking details"
              className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Service Summary Card */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${statusInfo.bgColor}`}>
                  <ServiceIcon size={28} strokeWidth={1.5} className={statusInfo.color} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">{booking.service.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}>
                      {isTerminal ? (
                        booking.status === 'completed' ? <CheckCircle2 size={10} /> : <X size={10} />
                      ) : (
                        <Clock3 size={10} />
                      )}
                      <span>{statusInfo.label}</span>
                    </span>
                  </div>
                </div>
                <p className="text-xl font-bold text-emerald-400">{formatPrice(booking.estimatedPrice)}</p>
              </div>
            </div>

            {/* Driver (from the server, once one accepted) */}
            {driver && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 rounded-2xl p-4 border border-white/10"
              >
                <p className="text-xs text-gray-400 font-medium mb-3">DRIVER</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-300 font-semibold">
                    {(driver.firstName || driver.name || 'D').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">{driver.name || driver.firstName}</p>
                    <div className="flex items-center gap-1 mt-1 text-sm text-gray-400">
                      {driverRating ? (
                        <span aria-label={driverRating.label} className="flex items-center gap-1"><Star size={12} className="text-amber-400 fill-amber-400" aria-hidden="true" />{driverRating.value} ({driverRating.count}){jobCountLabel(driver.totalJobs) ? ` · ${jobCountLabel(driver.totalJobs)}` : ''}</span>
                      ) : (
                        <span>{driverVehicle || 'New on AID'}</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Status Stepper */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <p className="text-xs text-gray-400 font-medium mb-2">STATUS</p>
              <BookingStepper status={booking.status} />
            </div>

            {/* Details List */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-3">
              <p className="text-xs text-gray-400 font-medium mb-2">DETAILS</p>
              
              {/* Location */}
              <div className="flex items-start gap-3">
                <MapPin size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400">Location</p>
                  <p className="text-sm text-white">{booking.location.address}</p>
                  {/* Show "Open in Maps" if coordinates exist */}
                  {booking.location.lat && booking.location.lng && (
                    <a
                      href={getMapsUrl(booking.location.lat, booking.location.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1 transition-colors"
                    >
                      <ExternalLink size={12} />
                      Open in Maps
                    </a>
                  )}
                </div>
              </div>

              {/* Vehicle */}
              {booking.vehicle && (
                <div className="flex items-start gap-3">
                  <Truck size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Vehicle</p>
                    <p className="text-sm text-white">{booking.vehicle.label}</p>
                    {booking.vehicle.plate && (
                      <p className="text-xs text-gray-400">{booking.vehicle.plate}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Date & Time */}
              <div className="flex items-start gap-3">
                <Calendar size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Requested</p>
                  <p className="text-sm text-white">
                    {formatDate(booking.createdAt)} at {formatTime(booking.createdAt)}
                  </p>
                </div>
              </div>

              {/* Notes */}
              {booking.notes && (
                <div className="flex items-start gap-3">
                  <FileText size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Notes</p>
                    <p className="text-sm text-white">{booking.notes}</p>
                  </div>
                </div>
              )}

              {/* Completed At */}
              {booking.completedAt && (
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Completed</p>
                    <p className="text-sm text-white">
                      {formatDate(booking.completedAt)} at {formatTime(booking.completedAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-4 border-t border-white/10 space-y-3">
            {/* Primary: View Receipt (completed) or live status (the request in progress) */}
            {booking.status === 'completed' ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleViewReceipt}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/20"
              >
                <Receipt size={18} strokeWidth={2} />
                View Receipt
              </motion.button>
            ) : isActiveRequest ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleTrack}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/20"
              >
                <Navigation size={18} strokeWidth={2} />
                View live status
              </motion.button>
            ) : null}

            {/* Secondary actions row */}
            <div className="flex gap-3">
              {/* Rebook */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRebook}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 text-gray-300 font-medium rounded-xl hover:bg-white/10 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors"
              >
                <RefreshCw size={16} strokeWidth={2} />
                Rebook
              </motion.button>

              {/* B12: the job's chat stays readable for 24 hours after it ends */}
              {chatReadable && (
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 text-gray-300 font-medium rounded-xl hover:bg-white/10 transition-colors"
                >
                  <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />
                  Messages
                </button>
              )}
            </div>
          </div>
          {chatOpen && (
            <JobChat
              bookingId={booking.id} audience="customer" otherName={driver?.firstName || 'Your driver'} serviceName={booking.service.name}
              initialChat={{ state: 'read_only', unread: 0, blockedByMe: false, readOnlyUntil: null }} onClose={() => setChatOpen(false)}
            />
          )}
    </Dialog>
  )
}
