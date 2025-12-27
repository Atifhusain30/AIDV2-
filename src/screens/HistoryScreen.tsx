import { motion } from 'framer-motion'
import { 
  Calendar, 
  CheckCircle, 
  ChevronRight,
  Droplets,
  Battery,
  CircleDot,
  Key,
  Truck,
  Zap,
  Fuel,
  FileText
} from 'lucide-react'
import { mockBookingHistory } from '../data/mockData'
import { ServiceType } from '../types'

const serviceIcons: Record<ServiceType, React.ElementType> = {
  oil_change: Droplets,
  battery_jump: Battery,
  flat_tire: CircleDot,
  lockout: Key,
  towing: Truck,
  ev_charging: Zap,
  fuel_delivery: Fuel,
}

export default function HistoryScreen() {
  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-xl font-semibold text-white mb-1">Booking History</h1>
        <p className="text-white/40 text-sm">Your past service requests</p>
      </motion.div>

      <div className="space-y-3">
        {mockBookingHistory.map((booking, i) => {
          const IconComponent = serviceIcons[booking.service.id]
          return (
            <motion.button
              key={booking.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass w-full rounded-2xl p-4 text-left hover:bg-white/5 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-iris-500/20 flex items-center justify-center">
                  <IconComponent size={20} strokeWidth={1.5} className="text-iris-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-white font-medium text-sm">{booking.service.name}</h3>
                    <span className="text-iris-300 font-semibold text-sm">${booking.estimatedPrice}</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/40 text-xs mb-2">
                    <Calendar size={12} strokeWidth={1.5} />
                    <span>{booking.createdAt.toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                      <CheckCircle size={12} strokeWidth={1.5} />
                      <span>Completed</span>
                    </div>
                    <div className="flex items-center gap-1 text-white/30 text-xs">
                      <span>Details</span>
                      <ChevronRight size={14} strokeWidth={1.5} />
                    </div>
                  </div>
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>

      {mockBookingHistory.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20"
        >
          <div className="w-16 h-16 rounded-2xl bg-iris-500/10 flex items-center justify-center mx-auto mb-4">
            <FileText size={28} strokeWidth={1.5} className="text-iris-300/50" />
          </div>
          <h3 className="text-white/70 font-medium mb-2">No bookings yet</h3>
          <p className="text-white/40 text-sm">Your service history will appear here</p>
        </motion.div>
      )}
    </div>
  )
}



