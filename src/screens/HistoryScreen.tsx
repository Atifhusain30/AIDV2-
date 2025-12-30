import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, 
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
  FileText
} from 'lucide-react'

// Service type definitions
type ServiceStatus = 'completed' | 'pending'
type ServiceTypeKey = 'Battery Jump' | 'Flat Tire' | 'Towing' | 'Fuel Delivery' | 'Lockout'

interface Service {
  id: number
  type: ServiceTypeKey
  price: number
  status: ServiceStatus
  address: string
  date: string
  provider: string
  initials: string
  rating: number
}

// Sample service history data
const services: Service[] = [
  { id: 1, type: 'Battery Jump', price: 45, status: 'completed', address: '789 Elm St, Dallas, TX', date: '2025-12-27', provider: 'Mike Rodriguez', initials: 'MR', rating: 4.9 },
  { id: 2, type: 'Flat Tire', price: 65, status: 'completed', address: '456 Oak Ave, Dallas, TX', date: '2025-12-22', provider: 'Sarah Chen', initials: 'SC', rating: 4.8 },
  { id: 3, type: 'Towing', price: 120, status: 'completed', address: '123 Main St, Plano, TX', date: '2025-12-15', provider: 'James Wilson', initials: 'JW', rating: 5.0 },
  { id: 4, type: 'Fuel Delivery', price: 35, status: 'pending', address: '321 Pine Rd, Irving, TX', date: '2025-12-30', provider: 'Alex Thompson', initials: 'AT', rating: 4.7 },
  { id: 5, type: 'Lockout', price: 55, status: 'completed', address: '555 Cedar Ln, Arlington, TX', date: '2025-12-10', provider: 'Maria Garcia', initials: 'MG', rating: 4.9 },
  { id: 6, type: 'Battery Jump', price: 50, status: 'completed', address: '222 Maple Dr, Frisco, TX', date: '2025-12-05', provider: 'David Lee', initials: 'DL', rating: 4.6 },
  { id: 7, type: 'Flat Tire', price: 70, status: 'pending', address: '888 Birch Blvd, McKinney, TX', date: '2025-12-31', provider: 'Emma White', initials: 'EW', rating: 4.9 },
]

// Service type to icon mapping
const serviceIcons: Record<ServiceTypeKey, React.ElementType> = {
  'Battery Jump': Battery,
  'Flat Tire': CircleDot,
  'Towing': Car,
  'Fuel Delivery': Fuel,
  'Lockout': Wrench,
}

// Helper functions
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

const getServicesForDate = (day: number, month: number, year: number, serviceList: Service[]) => {
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return serviceList.filter(s => s.date === dateStr)
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  })
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Service Card Component
function ServiceCard({ service, isExpanded, onToggle }: { 
  service: Service
  isExpanded: boolean
  onToggle: () => void 
}) {
  const ServiceIcon = serviceIcons[service.type]
  const isCompleted = service.status === 'completed'

  return (
    <motion.div
      layout
      onClick={onToggle}
      className="bg-white/5 backdrop-blur rounded-2xl overflow-hidden cursor-pointer border border-white/5 hover:border-white/10 transition-colors"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Service icon */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isCompleted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
            }`}>
              <ServiceIcon size={20} />
            </div>
            
            <div>
              <h4 className="font-semibold text-white">{service.type}</h4>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mt-1 ${
                isCompleted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {isCompleted ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                <span className="capitalize">{service.status}</span>
              </span>
            </div>
          </div>
          
          <p className="text-lg font-bold text-emerald-400">${service.price}</p>
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
                  <MapPin size={14} />
                  <span className="text-sm">{service.address}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <Calendar size={14} />
                  <span className="text-sm">{formatDate(service.date)}</span>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-sm font-semibold text-white">
                    {service.initials}
                  </div>
                  <div>
                    <p className="font-medium text-white">{service.provider}</p>
                    <div className="flex items-center gap-1">
                      <Star size={12} className="text-amber-400 fill-amber-400" />
                      <span className="text-sm text-gray-400">{service.rating}</span>
                    </div>
                  </div>
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
  filteredServices,
  onNavigateMonth
}: {
  currentDate: Date
  selectedDate: number | null
  onSelectDate: (day: number | null) => void
  filteredServices: Service[]
  onNavigateMonth: (direction: number) => void
}) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const todayDate = today.getDate()

  // Create array of days
  const days = []
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
      className="px-6"
    >
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <motion.button
          whileHover={{ scale: 1.1, x: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onNavigateMonth(-1)}
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={20} />
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
          <ChevronRight size={20} />
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
          visible: { transition: { staggerChildren: 0.02 } }
        }}
      >
        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="aspect-square" />
          }

          const dayServices = getServicesForDate(day, month, year, filteredServices)
          const hasServices = dayServices.length > 0
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
              className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-colors ${
                isSelected 
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white' 
                  : isToday
                    ? 'bg-white/10 text-white'
                    : 'bg-white/5 hover:bg-white/10 text-gray-300'
              }`}
            >
              <span className="text-sm font-medium">{day}</span>
              
              {/* Service indicators */}
              {hasServices && (
                <div className="absolute bottom-1.5 flex gap-0.5">
                  {dayServices.slice(0, 3).map((s, idx) => (
                    <div 
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-white' : s.status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                  ))}
                </div>
              )}
            </motion.button>
          )
        })}
      </motion.div>

      {/* Selected date services */}
      <AnimatePresence mode="wait">
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4"
          >
            {(() => {
              const selectedServices = getServicesForDate(selectedDate, month, year, filteredServices)
              if (selectedServices.length === 0) {
                return (
                  <p className="text-center text-gray-400 text-sm py-4">
                    No services on this date
                  </p>
                )
              }
              return (
                <div className="space-y-2">
                  <p className="text-sm text-gray-400 mb-2">
                    {selectedServices.length} service{selectedServices.length > 1 ? 's' : ''} on {monthNames[month]} {selectedDate}
                  </p>
                  {selectedServices.map(service => (
                    <motion.div
                      key={service.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between bg-white/5 rounded-xl p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          service.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {(() => {
                            const Icon = serviceIcons[service.type]
                            return <Icon size={16} />
                          })()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{service.type}</p>
                          <p className="text-xs text-gray-400">{service.provider}</p>
                        </div>
                      </div>
                      <p className="text-emerald-400 font-semibold">${service.price}</p>
                    </motion.div>
                  ))}
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
  filteredServices,
  expandedId,
  setExpandedId
}: {
  filteredServices: Service[]
  expandedId: number | null
  setExpandedId: (id: number | null) => void
}) {
  return (
    <motion.div
      key="list"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="px-6 space-y-3"
    >
      {filteredServices.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
            <FileText size={28} className="text-gray-500" />
          </div>
          <h3 className="text-white/70 font-medium mb-2">No services found</h3>
          <p className="text-gray-500 text-sm">Try adjusting your filter</p>
        </motion.div>
      ) : (
        filteredServices.map((service, index) => (
          <motion.div
            key={service.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <ServiceCard 
              service={service} 
              isExpanded={expandedId === service.id}
              onToggle={() => setExpandedId(expandedId === service.id ? null : service.id)}
            />
          </motion.div>
        ))
      )}
    </motion.div>
  )
}

// Stats Bar Component
function StatsBar({ filteredServices }: { filteredServices: Service[] }) {
  const completedCount = filteredServices.filter(s => s.status === 'completed').length
  const pendingCount = filteredServices.filter(s => s.status === 'pending').length
  const totalSpent = filteredServices
    .filter(s => s.status === 'completed')
    .reduce((sum, s) => sum + s.price, 0)

  return (
    <motion.div 
      className="px-6 mt-6 grid grid-cols-3 gap-3"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="bg-white/5 rounded-2xl p-4 text-center">
        <p className="text-2xl font-bold text-emerald-400">{completedCount}</p>
        <p className="text-xs text-gray-400 mt-1">Completed</p>
      </div>
      <div className="bg-white/5 rounded-2xl p-4 text-center">
        <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
        <p className="text-xs text-gray-400 mt-1">Pending</p>
      </div>
      <div className="bg-white/5 rounded-2xl p-4 text-center">
        <p className="text-2xl font-bold text-white">${totalSpent}</p>
        <p className="text-xs text-gray-400 mt-1">Total Spent</p>
      </div>
    </motion.div>
  )
}

// Main History Screen Component
export default function HistoryScreen() {
  const [isSheetOpen, setIsSheetOpen] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'All' | 'Completed' | 'Pending'>('All')
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Filter services based on active filter
  const filteredServices = useMemo(() => {
    if (activeFilter === 'All') return services
    return services.filter(s => s.status === activeFilter.toLowerCase() as ServiceStatus)
  }, [activeFilter])

  // Sort services by date (most recent first)
  const sortedServices = useMemo(() => {
    return [...filteredServices].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [filteredServices])

  const handleNavigateMonth = (direction: number) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(newDate.getMonth() + direction)
      return newDate
    })
    setSelectedDate(null)
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <motion.div
        className="absolute inset-0"
        animate={{ 
          filter: isSheetOpen ? 'blur(0px)' : 'blur(0px)',
          scale: 1
        }}
        transition={{ duration: 0.3 }}
      >
        {/* Gradient orbs */}
        <div className="absolute top-20 left-1/4 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-40 right-1/4 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl" />
      </motion.div>

      {/* Bottom Sheet */}
      <AnimatePresence>
        {isSheetOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) setIsSheetOpen(false)
            }}
            className="absolute inset-x-0 bottom-0 top-0 bg-gradient-to-b from-[#12122a] to-[#0a0a1a] rounded-t-[32px] overflow-hidden flex flex-col"
            style={{ touchAction: 'none' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <motion.div 
                className="w-12 h-1.5 bg-white/20 rounded-full"
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.4)' }}
              />
            </div>

            {/* Header */}
            <div className="px-6 pb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-white">Service History</h2>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsSheetOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
                aria-label="Close"
              >
                <X size={18} />
              </motion.button>
            </div>

            {/* View Toggle */}
            <div className="px-6 mb-4">
              <div className="bg-white/5 rounded-2xl p-1 flex">
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
                      {mode === 'calendar' ? <Calendar size={16} /> : <Clock size={16} />}
                      {mode}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Filter Pills */}
            <div className="px-6 mb-4 flex gap-2">
              {(['All', 'Completed', 'Pending'] as const).map((filter) => (
                <motion.button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className="px-4 py-2 rounded-full text-sm font-medium relative overflow-hidden"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {activeFilter === filter && (
                    <motion.div
                      layoutId="filterPill"
                      className="absolute inset-0 bg-emerald-500"
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
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto pb-6 hide-scrollbar">
              <AnimatePresence mode="wait">
                {viewMode === 'calendar' ? (
                  <CalendarView
                    key="calendar-view"
                    currentDate={currentDate}
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                    filteredServices={filteredServices}
                    onNavigateMonth={handleNavigateMonth}
                  />
                ) : (
                  <ListView
                    key="list-view"
                    filteredServices={sortedServices}
                    expandedId={expandedId}
                    setExpandedId={setExpandedId}
                  />
                )}
              </AnimatePresence>

              {/* Stats Bar */}
              <StatsBar filteredServices={filteredServices} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Closed state - tap to reopen */}
      <AnimatePresence>
        {!isSheetOpen && (
          <motion.button
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            onClick={() => setIsSheetOpen(true)}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 bg-emerald-500 rounded-full text-white font-medium shadow-lg shadow-emerald-500/30"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            View Service History
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
