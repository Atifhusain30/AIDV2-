import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChevronLeft, 
  ChevronRight, 
  MapPin, 
  Calendar,
  Clock,
  Star, 
  CheckCircle2, 
  Clock3, 
  Wrench, 
  Battery, 
  CircleDot, 
  Car, 
  Fuel,
  FileText,
  Droplets,
  Key,
  Truck,
  Sparkles,
  Sun,
  Zap,
  Plus,
  RefreshCw
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { Booking, ServiceType, BookingStatus } from '../types'

// Service type to icon mapping
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
const statusDisplay: Record<BookingStatus, { label: string; colorClass: string; bgClass: string }> = {
  pending: { label: 'Pending', colorClass: 'text-gray-400', bgClass: 'bg-gray-500/20' },
  searching: { label: 'Searching', colorClass: 'text-amber-400', bgClass: 'bg-amber-500/20' },
  accepted: { label: 'Accepted', colorClass: 'text-blue-400', bgClass: 'bg-blue-500/20' },
  en_route: { label: 'En Route', colorClass: 'text-blue-400', bgClass: 'bg-blue-500/20' },
  arrived: { label: 'Arrived', colorClass: 'text-purple-400', bgClass: 'bg-purple-500/20' },
  in_progress: { label: 'In Progress', colorClass: 'text-amber-400', bgClass: 'bg-amber-500/20' },
  completed: { label: 'Completed', colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/20' },
  cancelled: { label: 'Cancelled', colorClass: 'text-red-400', bgClass: 'bg-red-500/20' },
}

// Helper functions
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

const getBookingsForDate = (day: number, month: number, year: number, bookings: Booking[]) => {
  return bookings.filter(b => {
    const bookingDate = new Date(b.createdAt)
    return bookingDate.getDate() === day && 
           bookingDate.getMonth() === month && 
           bookingDate.getFullYear() === year
  })
}

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  })
}

const formatTime = (date: Date) => {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Booking Card Component
function BookingCard({ booking, isExpanded, onToggle, onViewDetails, onRebook }: { 
  booking: Booking
  isExpanded: boolean
  onToggle: () => void
  onViewDetails: () => void
  onRebook: () => void
}) {
  const ServiceIcon = serviceIcons[booking.service.id] || Wrench
  const isCompleted = booking.status === 'completed'
  const statusInfo = statusDisplay[booking.status]

  // Open detail modal when clicking the card
  const handleCardClick = () => {
    onViewDetails()
  }

  return (
    <motion.div
      layout
      onClick={handleCardClick}
      className="bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden cursor-pointer border border-white/10 hover:border-emerald-500/30 transition-colors"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Service icon */}
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
              isCompleted ? 'bg-emerald-500/20 text-emerald-400' : statusInfo.bgClass + ' ' + statusInfo.colorClass
            }`}>
              <ServiceIcon size={22} strokeWidth={1.5} />
            </div>
            
            <div>
              <h4 className="font-semibold text-white text-sm">{booking.service.name}</h4>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${statusInfo.bgClass} ${statusInfo.colorClass}`}>
                  {isCompleted ? <CheckCircle2 size={10} /> : <Clock3 size={10} />}
                  <span>{statusInfo.label}</span>
                </span>
                {/* Show provider name for non-searching statuses */}
                {booking.mechanic && booking.status !== 'searching' && (
                  <span className="text-xs text-gray-400">
                    • {booking.mechanic.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <p className="text-lg font-bold text-emerald-400">${booking.estimatedPrice}</p>
        </div>

        {/* Expandable details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                <div className="flex items-center gap-2 text-gray-400">
                  <MapPin size={14} strokeWidth={1.5} />
                  <span className="text-sm">{booking.location.address}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <Calendar size={14} strokeWidth={1.5} />
                  <span className="text-sm">{formatDate(booking.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <Clock size={14} strokeWidth={1.5} />
                  <span className="text-sm">{formatTime(booking.createdAt)}</span>
                </div>
                {booking.mechanic && (
                  <div className="flex items-center gap-3 pt-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-sm font-semibold text-white">
                      {booking.mechanic.initials}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-white text-sm">{booking.mechanic.name}</p>
                      <div className="flex items-center gap-1">
                        <Star size={12} className="text-amber-400 fill-amber-400" />
                        <span className="text-sm text-gray-400">{booking.mechanic.rating}</span>
                      </div>
                    </div>
                    {/* Show ETA for active bookings */}
                    {booking.status === 'en_route' && (booking.providerETA !== undefined || booking.mechanic.eta) && (
                      <div className="flex items-center gap-1 text-emerald-400">
                        <Clock size={14} />
                        <span className="text-sm font-medium">{booking.providerETA ?? booking.mechanic.eta} min</span>
                      </div>
                    )}
                  </div>
                )}
                {booking.vehicle && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Car size={14} strokeWidth={1.5} />
                    <span className="text-sm">{booking.vehicle.label}</span>
                    {booking.vehicle.plate && (
                      <span className="text-xs text-gray-500">• {booking.vehicle.plate}</span>
                    )}
                  </div>
                )}
                {booking.notes && (
                  <div className="pt-2">
                    <p className="text-xs text-gray-500">Notes:</p>
                    <p className="text-sm text-gray-400 mt-1">{booking.notes}</p>
                  </div>
                )}
                
                {/* Action buttons */}
                <div className="flex gap-2 mt-3">
                  {/* Track Service button for active bookings */}
                  {!isCompleted && booking.status !== 'cancelled' && (
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation()
                        onViewDetails()
                      }}
                      className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium rounded-xl text-sm"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Track Service
                    </motion.button>
                  )}
                  
                  {/* Rebook button - always visible */}
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRebook()
                    }}
                    className={`${!isCompleted && booking.status !== 'cancelled' ? 'flex-1' : 'w-full'} py-2.5 flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-gray-300 font-medium rounded-xl text-sm hover:bg-white/10 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <RefreshCw size={14} strokeWidth={2} />
                    Rebook
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// Calendar View Component
function CalendarView({ 
  currentDate, 
  selectedDate, 
  onSelectDate,
  filteredBookings,
  onNavigateMonth,
  onViewBooking
}: {
  currentDate: Date
  selectedDate: number | null
  onSelectDate: (day: number | null) => void
  filteredBookings: Booking[]
  onNavigateMonth: (direction: number) => void
  onViewBooking: (booking: Booking) => void
}) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const todayDate = today.getDate()

  // Create array of days
  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) {
    days.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i)
  }

  return (
    <motion.div
      key="calendar"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3 }}
    >
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <motion.button
          whileHover={{ scale: 1.1, x: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onNavigateMonth(-1)}
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={20} strokeWidth={1.5} />
        </motion.button>
        
        <motion.h3
          key={`${month}-${year}`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-lg font-semibold text-white"
        >
          {monthNames[month]} {year}
        </motion.h3>
        
        <motion.button
          whileHover={{ scale: 1.1, x: 2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onNavigateMonth(1)}
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
        >
          <ChevronRight size={20} strokeWidth={1.5} />
        </motion.button>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map(day => (
          <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <motion.div
        className="grid grid-cols-7 gap-1"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.015 } }
        }}
      >
        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="aspect-square" />
          }

          const dayBookings = getBookingsForDate(day, month, year, filteredBookings)
          const hasBookings = dayBookings.length > 0
          const isSelected = selectedDate === day
          const isToday = isCurrentMonth && day === todayDate

          return (
            <motion.button
              key={day}
              variants={{
                hidden: { opacity: 0, scale: 0.8 },
                visible: { opacity: 1, scale: 1 }
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelectDate(isSelected ? null : day)}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all ${
                isSelected 
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30' 
                  : isToday
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-white/5 hover:bg-white/10 text-gray-300'
              }`}
            >
              <span className="text-sm font-medium">{day}</span>
              
              {/* Booking indicators */}
              {hasBookings && (
                <div className="absolute bottom-1 flex gap-0.5">
                  {dayBookings.slice(0, 3).map((b, idx) => (
                    <div 
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-white' : b.status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                  ))}
                </div>
              )}
            </motion.button>
          )
        })}
      </motion.div>

      {/* Selected date bookings */}
      <AnimatePresence mode="wait">
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4"
          >
            {(() => {
              const selectedBookings = getBookingsForDate(selectedDate, month, year, filteredBookings)
              if (selectedBookings.length === 0) {
                return (
                  <p className="text-center text-gray-400 text-sm py-4 bg-white/5 rounded-xl">
                    No bookings on this date
                  </p>
                )
              }
              return (
                <div className="space-y-2">
                  <p className="text-sm text-gray-400 mb-2">
                    {selectedBookings.length} booking{selectedBookings.length > 1 ? 's' : ''} on {monthNames[month]} {selectedDate}
                  </p>
                  {selectedBookings.map(booking => {
                    const Icon = serviceIcons[booking.service.id] || Wrench
                    const statusInfo = statusDisplay[booking.status]
                    return (
                      <motion.div
                        key={booking.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => onViewBooking(booking)}
                        className="flex items-center justify-between bg-white/5 rounded-xl p-3 border border-white/5 cursor-pointer hover:border-emerald-500/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${statusInfo.bgClass} ${statusInfo.colorClass}`}>
                            <Icon size={18} strokeWidth={1.5} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{booking.service.name}</p>
                            <p className="text-xs text-gray-400">{formatTime(booking.createdAt)}</p>
                          </div>
                        </div>
                        <p className="text-emerald-400 font-semibold">${booking.estimatedPrice}</p>
                      </motion.div>
                    )
                  })}
                </div>
              )
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// List View Component
function ListView({ 
  filteredBookings,
  expandedId,
  setExpandedId,
  onViewBooking,
  onRebook
}: {
  filteredBookings: Booking[]
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  onViewBooking: (booking: Booking) => void
  onRebook: (bookingId: string) => void
}) {
  return (
    <motion.div
      key="list"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      {filteredBookings.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
            <FileText size={28} strokeWidth={1.5} className="text-gray-500" />
          </div>
          <h3 className="text-white/70 font-medium mb-2">No bookings found</h3>
          <p className="text-gray-500 text-sm">Try adjusting your filter</p>
        </motion.div>
      ) : (
        filteredBookings.map((booking, index) => (
          <motion.div
            key={booking.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <BookingCard 
              booking={booking} 
              isExpanded={expandedId === booking.id}
              onToggle={() => setExpandedId(expandedId === booking.id ? null : booking.id)}
              onViewDetails={() => onViewBooking(booking)}
              onRebook={() => onRebook(booking.id)}
            />
          </motion.div>
        ))
      )}
    </motion.div>
  )
}

// Stats Bar Component
function StatsBar({ bookings }: { bookings: Booking[] }) {
  const completedCount = bookings.filter(b => b.status === 'completed').length
  const activeCount = bookings.filter(b => 
    b.status !== 'completed' && b.status !== 'cancelled'
  ).length
  const totalSpent = bookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + b.estimatedPrice, 0)

  return (
    <motion.div 
      className="grid grid-cols-3 gap-3"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
        <p className="text-2xl font-bold text-emerald-400">{completedCount}</p>
        <p className="text-xs text-gray-400 mt-1">Completed</p>
      </div>
      <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
        <p className="text-2xl font-bold text-amber-400">{activeCount}</p>
        <p className="text-xs text-gray-400 mt-1">Active</p>
      </div>
      <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
        <p className="text-2xl font-bold text-white">${totalSpent}</p>
        <p className="text-xs text-gray-400 mt-1">Total Spent</p>
      </div>
    </motion.div>
  )
}

// Empty State Component
function EmptyState({ onRequestService }: { onRequestService: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-16"
    >
      <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6">
        <FileText size={36} strokeWidth={1.5} className="text-gray-500" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">No Bookings Yet</h3>
      <p className="text-gray-400 mb-8 max-w-xs mx-auto">
        You haven't made any service requests yet. Start your first one now!
      </p>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onRequestService}
        className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 px-8 rounded-xl shadow-lg shadow-emerald-500/20"
      >
        <Plus size={20} />
        Request Service
      </motion.button>
    </motion.div>
  )
}

// Main History Screen Component
export default function HistoryScreen() {
  const { 
    bookingHistory, 
    setActiveBooking, 
    setCurrentScreen,
    setActiveModal,
    rebookFromHistory,
    openBookingDetail,
  } = useAppStore()
  
  const [activeFilter, setActiveFilter] = useState<'All' | 'Active' | 'Completed'>('All')
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filter bookings based on active filter
  const filteredBookings = useMemo(() => {
    if (activeFilter === 'All') return bookingHistory
    if (activeFilter === 'Completed') return bookingHistory.filter(b => b.status === 'completed')
    // Active = not completed and not cancelled
    return bookingHistory.filter(b => b.status !== 'completed' && b.status !== 'cancelled')
  }, [activeFilter, bookingHistory])

  // Sort bookings by date (most recent first)
  const sortedBookings = useMemo(() => {
    return [...filteredBookings].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [filteredBookings])

  const handleNavigateMonth = (direction: number) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(newDate.getMonth() + direction)
      return newDate
    })
    setSelectedDate(null)
  }

  // Open booking detail modal instead of navigating directly to chat
  const handleViewBooking = (booking: Booking) => {
    openBookingDetail(booking.id)
  }

  const handleRebook = (bookingId: string) => {
    rebookFromHistory(bookingId)
    setCurrentScreen('chat')
  }

  const handleRequestService = () => {
    setActiveModal('services')
  }

  // Show empty state if no bookings
  if (bookingHistory.length === 0) {
    return (
      <div className="max-w-md mx-auto px-5 py-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-xl font-semibold text-white mb-1">Service History</h1>
          <p className="text-white/40 text-sm">Track your past and pending services</p>
        </motion.div>
        
        <EmptyState onRequestService={handleRequestService} />
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-xl font-semibold text-white mb-1">Service History</h1>
        <p className="text-white/40 text-sm">Track your past and pending services</p>
      </motion.div>

      {/* Stats Bar */}
      <div className="mb-6">
        <StatsBar bookings={bookingHistory} />
      </div>

      {/* View Toggle */}
      <motion.div 
        className="mb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="bg-white/5 rounded-2xl p-1 flex border border-white/5">
          {(['calendar', 'list'] as const).map((mode) => (
            <motion.button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium capitalize flex items-center justify-center gap-2 relative"
              whileTap={{ scale: 0.98 }}
            >
              {viewMode === mode && (
                <motion.div
                  layoutId="viewToggle"
                  className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl border border-emerald-500/30"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className={`relative z-10 flex items-center gap-2 ${
                viewMode === mode ? 'text-emerald-400' : 'text-gray-400'
              }`}>
                {mode === 'calendar' ? <Calendar size={16} strokeWidth={1.5} /> : <Clock size={16} strokeWidth={1.5} />}
                {mode}
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Filter Pills */}
      <motion.div 
        className="mb-5 flex gap-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        {(['All', 'Active', 'Completed'] as const).map((filter) => (
          <motion.button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className="px-4 py-2 rounded-full text-sm font-medium relative overflow-hidden border border-transparent"
            style={{
              borderColor: activeFilter !== filter ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {activeFilter === filter && (
              <motion.div
                layoutId="filterPill"
                className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className={`relative z-10 ${
              activeFilter === filter ? 'text-white' : 'text-gray-400'
            }`}>
              {filter}
            </span>
          </motion.button>
        ))}
      </motion.div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {viewMode === 'calendar' ? (
          <CalendarView
            key="calendar-view"
            currentDate={currentDate}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            filteredBookings={filteredBookings}
            onNavigateMonth={handleNavigateMonth}
            onViewBooking={handleViewBooking}
          />
        ) : (
          <ListView
            key="list-view"
            filteredBookings={sortedBookings}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            onViewBooking={handleViewBooking}
            onRebook={handleRebook}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
