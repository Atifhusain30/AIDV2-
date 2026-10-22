import { motion, AnimatePresence } from 'framer-motion'
import { 
  Clock,
  CheckCircle,
  XCircle,
  MapPin,
  Calendar
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { Booking } from '../../types'
import Modal from '../ui/Modal'
import { formatPrice } from '../../lib/money'

const statusColors: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: CheckCircle },
  cancelled: { bg: 'bg-rose-500/20', text: 'text-rose-400', icon: XCircle },
  pending: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: Clock },
  in_progress: { bg: 'bg-iris-500/20', text: 'text-iris-400', icon: Clock },
}

function BookingCard({ booking, index }: { booking: Booking; index: number }) {
  const status = statusColors[booking.status] || statusColors.pending
  const StatusIcon = status.icon
  const date = new Date(booking.createdAt)
  
  return (
    <motion.div
      className="glass p-4 rounded-2xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ scale: 1.02, y: -2 }}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className="text-white/90 font-semibold">{booking.service.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${status.bg} ${status.text} flex items-center gap-1`}>
              <StatusIcon size={10} />
              {booking.status.replace('_', ' ')}
            </span>
          </div>
        </div>
        <span className="text-iris-300 font-bold">{formatPrice(booking.estimatedPrice)}</span>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-white/50">
          <MapPin size={14} />
          <span className="truncate">{booking.location.address}</span>
        </div>
        <div className="flex items-center gap-2 text-white/50">
          <Calendar size={14} />
          <span>{date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
          })}</span>
        </div>
      </div>
      
      {booking.mechanic && (
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-iris-500/20 flex items-center justify-center text-iris-300 text-xs font-semibold">
            {booking.mechanic.initials}
          </div>
          <div>
            <p className="text-white/80 text-sm font-medium">{booking.mechanic.name}</p>
            <p className="text-white/40 text-xs">⭐ {booking.mechanic.rating}</p>
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default function HistoryModal() {
  const { 
    activeModal, 
    setActiveModal,
    bookingHistory,
  } = useAppStore()

  const isOpen = activeModal === 'history'

  const handleClose = () => {
    setActiveModal(null)
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Service History">
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-4"
        >
          {bookingHistory.length === 0 ? (
            <motion.div
              className="text-center py-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Clock size={48} className="mx-auto text-white/20 mb-4" />
              <p className="text-white/50">No service history yet</p>
              <p className="text-white/30 text-sm mt-1">Your past services will appear here</p>
            </motion.div>
          ) : (
            <>
              <div className="flex gap-2 mb-4">
                {['All', 'Completed', 'Pending'].map((filter, i) => (
                  <motion.button
                    key={filter}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      i === 0 
                        ? 'bg-iris-500/30 text-iris-300' 
                        : 'bg-white/5 text-white/50 hover:bg-white/10'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {filter}
                  </motion.button>
                ))}
              </div>
              
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                {bookingHistory.map((booking, i) => (
                  <BookingCard key={booking.id} booking={booking} index={i} />
                ))}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  )
}

