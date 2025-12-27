import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Bell, 
  Search, 
  Mic, 
  Wrench, 
  Truck, 
  Zap, 
  X,
  Droplets,
  Battery,
  CircleDot,
  Key,
  Fuel,
  MapPin,
  Building2,
  Clock,
  User,
  Sparkles,
  Sun
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { services } from '../data/mockData'
import { ServiceType } from '../types'
import {
  ServicesModal,
  TowingModal,
  EVChargingModal,
  DetailingModal,
  WindowTintingModal,
  EmergencySOSModal,
  HistoryModal,
} from '../components/modals'

const serviceIcons: Record<ServiceType, React.ElementType> = {
  oil_change: Droplets,
  battery_jump: Battery,
  flat_tire: CircleDot,
  lockout: Key,
  towing: Truck,
  ev_charging: Zap,
  fuel_delivery: Fuel,
}

export default function HomeScreen() {
  const { 
    mechanics, 
    setActiveModal,
    unreadCount,
    searchQuery,
    setSearchQuery,
    recentSearches,
    addRecentSearch,
  } = useAppStore()
  
  const [mounted, setMounted] = useState(false)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [filteredServices, setFilteredServices] = useState(services)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (searchQuery) {
      const filtered = services.filter(s => 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
      setFilteredServices(filtered)
    } else {
      setFilteredServices(services)
    }
  }, [searchQuery])

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim())
      setIsSearchFocused(false)
    }
  }

  const mainServices = [
    { id: 'services', icon: Wrench, label: 'Services', color: 'iris', modal: 'services' as const },
    { id: 'towing', icon: Truck, label: 'Towing', eta: 18, modal: 'towing' as const },
    { id: 'ev_charging', icon: Zap, label: 'EV Charge', eta: 12, modal: 'ev_charging' as const },
  ]

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      {/* All Modals */}
      <ServicesModal />
      <TowingModal />
      <EVChargingModal />
      <DetailingModal />
      <WindowTintingModal />
      <EmergencySOSModal />
      <HistoryModal />

      {/* Header */}
      <motion.div 
        className="flex justify-between items-center mb-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : -20 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-white via-iris-200 to-iris-400 bg-clip-text text-transparent">
              AID
            </span>
          </h1>
          <p className="text-white/40 text-xs font-medium tracking-widest uppercase mt-0.5">
            Roadside Assistance
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <motion.button 
            className="glass w-10 h-10 rounded-xl flex items-center justify-center relative"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Bell size={18} strokeWidth={1.5} className="text-white/60" />
            {unreadCount > 0 && (
              <motion.span 
                className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full text-[10px] flex items-center justify-center font-semibold"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500 }}
              >
                {unreadCount}
              </motion.span>
            )}
          </motion.button>
          <motion.button 
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-iris-500/30 to-iris-600/20 border border-iris-500/30"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <User size={18} strokeWidth={1.5} className="text-iris-300" />
          </motion.button>
        </div>
      </motion.div>

      {/* Map Widget */}
      <motion.div 
        className="glass-elevated rounded-3xl h-[360px] relative overflow-hidden mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
        transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-void-600 via-void-700 to-void-800">
          <svg className="absolute inset-0 w-full h-full opacity-30">
            <defs>
              <linearGradient id="roadGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.5" />
                <stop offset="50%" stopColor="#6366f1" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.5" />
              </linearGradient>
            </defs>
            <line x1="0" y1="80" x2="100%" y2="90" stroke="url(#roadGradient)" strokeWidth="1.5" />
            <line x1="0" y1="180" x2="100%" y2="170" stroke="url(#roadGradient)" strokeWidth="2" />
            <line x1="0" y1="280" x2="100%" y2="290" stroke="url(#roadGradient)" strokeWidth="1.5" />
            <line x1="100" y1="0" x2="90" y2="100%" stroke="url(#roadGradient)" strokeWidth="1.5" />
            <line x1="200" y1="0" x2="210" y2="100%" stroke="url(#roadGradient)" strokeWidth="2.5" />
            <line x1="300" y1="0" x2="290" y2="100%" stroke="url(#roadGradient)" strokeWidth="1.5" />
            <line x1="0" y1="360" x2="390" y2="50" stroke="url(#roadGradient)" strokeWidth="3" />
          </svg>

          {[
            { x: 35, y: 25, delay: 0 },
            { x: 68, y: 40, delay: 0.5 },
            { x: 22, y: 55, delay: 1 },
            { x: 75, y: 65, delay: 1.5 },
            { x: 45, y: 78, delay: 2 },
          ].map((pos, i) => (
            <div
              key={i}
              className="absolute"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
            >
              <div 
                className="absolute inset-[-8px] border border-emerald-400/30 rounded-full animate-ping-slow"
                style={{ animationDelay: `${pos.delay}s` }}
              />
              <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full shadow-[0_0_12px_rgba(52,211,153,0.6)]" />
            </div>
          ))}

          <div className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="absolute w-16 h-16 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-iris-500/10 rounded-full animate-pulse-slow" />
            <div className="absolute w-10 h-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-iris-500/20 rounded-full animate-pulse-slow" 
              style={{ animationDelay: '-1s' }}
            />
            <div className="w-5 h-5 bg-gradient-to-br from-iris-400 to-iris-600 rounded-full border-[3px] border-white shadow-[0_0_20px_rgba(139,92,246,0.5)] location-pulse" />
          </div>
        </div>

        <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
          <div className="glass px-3 py-2 rounded-xl">
            <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">Your Location</p>
            <p className="text-white/90 text-sm font-medium">Downtown District</p>
          </div>
          <div className="glass px-3 py-2 rounded-xl text-right">
            <p className="text-emerald-400 text-lg font-semibold">{mechanics.length}</p>
            <p className="text-white/40 text-[10px] font-medium">Nearby</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="absolute bottom-4 left-4 right-4">
          <motion.div 
            className="glass px-4 py-3 rounded-2xl flex items-center gap-3 relative"
            animate={{ 
              boxShadow: isSearchFocused 
                ? '0 0 30px rgba(139, 92, 246, 0.3)' 
                : '0 8px 32px rgba(0, 0, 0, 0.4)'
            }}
          >
            <Search size={18} strokeWidth={1.5} className="text-white/40" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
              placeholder="Search for service or location..."
              className="bg-transparent border-none outline-none text-white/80 text-sm flex-1 placeholder:text-white/30"
            />
            {searchQuery && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                onClick={() => setSearchQuery('')}
                className="text-white/40 hover:text-white/60"
              >
                <X size={16} />
              </motion.button>
            )}
            <Mic size={18} strokeWidth={1.5} className="text-white/40 cursor-pointer hover:text-white/60 transition-colors" />
          </motion.div>
          
          {/* Search Dropdown */}
          <AnimatePresence>
            {isSearchFocused && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute bottom-full left-0 right-0 mb-2 glass rounded-2xl p-3 max-h-48 overflow-y-auto"
              >
                {searchQuery ? (
                  filteredServices.length > 0 ? (
                    <div className="space-y-1">
                      {filteredServices.map((service) => {
                        const Icon = serviceIcons[service.id]
                        return (
                          <motion.button
                            key={service.id}
                            className="w-full p-2 rounded-xl flex items-center gap-3 hover:bg-white/10 transition-colors"
                            whileHover={{ x: 5 }}
                            onClick={() => {
                              setActiveModal('services')
                              setSearchQuery('')
                            }}
                          >
                            <Icon size={16} className="text-iris-300" />
                            <span className="text-white/80 text-sm">{service.name}</span>
                          </motion.button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-white/40 text-sm text-center py-2">No services found</p>
                  )
                ) : (
                  <div>
                    <p className="text-white/40 text-xs mb-2">Recent Searches</p>
                    <div className="space-y-1">
                      {recentSearches.map((search, i) => (
                        <motion.button
                          key={i}
                          className="w-full p-2 rounded-xl flex items-center gap-3 hover:bg-white/10 transition-colors"
                          whileHover={{ x: 5 }}
                          onClick={() => setSearchQuery(search)}
                        >
                          <Clock size={14} className="text-white/30" />
                          <span className="text-white/60 text-sm">{search}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Action Buttons Dock */}
      <motion.div 
        className="flex gap-3 justify-center relative"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 30 }}
        transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
      >
        <motion.div 
          className="absolute -top-11 left-4 glass px-3 py-1.5 rounded-lg animate-float"
          style={{ animationDelay: '0s' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-blue-300/90 text-[10px] font-medium">
            ETA <span className="text-blue-200">18 min</span>
          </p>
        </motion.div>

        <motion.div 
          className="absolute -top-11 right-4 glass px-3 py-1.5 rounded-lg animate-float"
          style={{ animationDelay: '0.5s' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-emerald-300/90 text-[10px] font-medium">
            ETA <span className="text-emerald-200">12 min</span>
          </p>
        </motion.div>

        {mainServices.map((service, index) => {
          const Icon = service.icon
          
          return (
            <motion.button
              key={service.id}
              onClick={() => setActiveModal(service.modal)}
              className="glass-button flex-1 py-4 px-4 rounded-2xl flex flex-col items-center gap-2"
              whileHover={{ y: -3, boxShadow: '0 0 30px rgba(139, 92, 246, 0.3)' }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
            >
              <Icon 
                size={24}
                strokeWidth={1.5}
                className="text-white/70"
              />
              <span className="text-xs font-medium text-white/70">
                {service.label}
              </span>
            </motion.button>
          )
        })}
      </motion.div>

      {/* Quick Access Cards */}
      <motion.div 
        className="flex gap-3 mt-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 30 }}
        transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
      >
        {[
          { icon: MapPin, label: 'Saved', sublabel: 'Home', action: () => setActiveModal('services') },
          { icon: Building2, label: 'Saved', sublabel: 'Work', action: () => setActiveModal('services') },
          { icon: Clock, label: 'Recent', sublabel: 'History', action: () => setActiveModal('history') },
        ].map((item, i) => {
          const Icon = item.icon
          return (
            <motion.button
              key={i}
              onClick={item.action}
              className="glass flex-1 px-4 py-3 rounded-2xl flex items-center gap-3 hover:bg-white/5 transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="w-8 h-8 rounded-lg bg-iris-500/15 flex items-center justify-center">
                <Icon size={16} strokeWidth={1.5} className="text-iris-300" />
              </div>
              <div className="text-left">
                <p className="text-white/40 text-[10px] font-medium">{item.label}</p>
                <p className="text-white/90 text-xs font-medium">{item.sublabel}</p>
              </div>
            </motion.button>
          )
        })}
      </motion.div>

      {/* Car Care Services Section */}
      <motion.div 
        className="mt-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 30 }}
        transition={{ duration: 0.6, delay: 0.35, ease: 'easeOut' }}
      >
        <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3 px-1">
          Car Care Services
        </h3>
        <div className="flex gap-3">
          {/* Detailing Card */}
          <motion.button
            onClick={() => setActiveModal('detailing')}
            className="flex-1 relative overflow-hidden rounded-2xl p-4 cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a3e 100%)',
            }}
            whileHover={{ 
              scale: 1.03,
              boxShadow: '0 0 40px rgba(139, 92, 246, 0.4), 0 8px 32px rgba(0, 0, 0, 0.4)',
            }}
            whileTap={{ scale: 0.98 }}
            initial={{ boxShadow: '0 0 20px rgba(139, 92, 246, 0.15), 0 4px 16px rgba(0, 0, 0, 0.3)' }}
          >
            {/* Glass overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-iris-500/10 pointer-events-none" />
            <div className="absolute inset-0 border border-iris-500/30 rounded-2xl pointer-events-none" />
            
            {/* Animated water droplets */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute pointer-events-none"
                style={{
                  left: `${15 + (i % 3) * 30}%`,
                  bottom: '10%',
                }}
                initial={{ y: 0, opacity: 0 }}
                animate={{
                  y: [-80, -120],
                  opacity: [0, 0.8, 0.6, 0],
                  scale: [0.5, 1, 0.8, 0.4],
                }}
                transition={{
                  duration: 2.5 + (i * 0.3),
                  repeat: Infinity,
                  delay: i * 0.4,
                  ease: 'easeOut',
                }}
              >
                <div 
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: 'radial-gradient(circle at 30% 30%, rgba(147, 197, 253, 0.9), rgba(139, 92, 246, 0.6))',
                    boxShadow: '0 0 8px rgba(147, 197, 253, 0.5)',
                  }}
                />
              </motion.div>
            ))}
            
            {/* Ripple effect */}
            <motion.div
              className="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-4 rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse, rgba(147, 197, 253, 0.3) 0%, transparent 70%)',
              }}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 0.2, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-start">
              <motion.div 
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400/30 to-iris-500/30 flex items-center justify-center mb-3 border border-blue-400/20"
                animate={{
                  boxShadow: [
                    '0 0 15px rgba(147, 197, 253, 0.3)',
                    '0 0 25px rgba(147, 197, 253, 0.5)',
                    '0 0 15px rgba(147, 197, 253, 0.3)',
                  ],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Sparkles size={20} strokeWidth={1.5} className="text-blue-300" />
              </motion.div>
              <p className="text-white/95 text-sm font-semibold tracking-tight">Detailing</p>
              <p className="text-white/40 text-[10px] font-medium mt-0.5">Premium wash & polish</p>
            </div>
          </motion.button>

          {/* Window Tinting Card */}
          <motion.button
            onClick={() => setActiveModal('window_tinting')}
            className="flex-1 relative overflow-hidden rounded-2xl p-4 cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #1e1e3f 50%, #16213e 100%)',
            }}
            whileHover={{ 
              scale: 1.03,
              boxShadow: '0 0 40px rgba(139, 92, 246, 0.4), 0 8px 32px rgba(0, 0, 0, 0.4)',
            }}
            whileTap={{ scale: 0.98 }}
            initial={{ boxShadow: '0 0 20px rgba(139, 92, 246, 0.15), 0 4px 16px rgba(0, 0, 0, 0.3)' }}
          >
            {/* Glass overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-iris-500/10 pointer-events-none" />
            <div className="absolute inset-0 border border-iris-500/30 rounded-2xl pointer-events-none" />
            
            {/* Shine/Glare animation */}
            <motion.div
              className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
              initial={{ opacity: 1 }}
            >
              <motion.div
                className="absolute w-[200%] h-full"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, transparent 40%, rgba(255, 255, 255, 0.15) 50%, transparent 60%, transparent 100%)',
                }}
                animate={{
                  x: ['-100%', '100%'],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  repeatDelay: 2,
                  ease: 'easeInOut',
                }}
              />
            </motion.div>
            
            {/* Subtle tint gradient effect */}
            <motion.div
              className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at top right, rgba(251, 191, 36, 0.15) 0%, transparent 70%)',
              }}
              animate={{
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-start">
              <motion.div 
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400/20 to-iris-500/30 flex items-center justify-center mb-3 border border-amber-400/20"
                animate={{
                  boxShadow: [
                    '0 0 15px rgba(251, 191, 36, 0.2)',
                    '0 0 25px rgba(251, 191, 36, 0.4)',
                    '0 0 15px rgba(251, 191, 36, 0.2)',
                  ],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Sun size={20} strokeWidth={1.5} className="text-amber-300" />
              </motion.div>
              <p className="text-white/95 text-sm font-semibold tracking-tight">Window Tinting</p>
              <p className="text-white/40 text-[10px] font-medium mt-0.5">UV protection & privacy</p>
            </div>
          </motion.button>
        </div>
      </motion.div>

      {/* Emergency SOS Button */}
      <motion.div 
        className="flex justify-center mt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: mounted ? 1 : 0 }}
        transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }}
      >
        <motion.button
          onClick={() => setActiveModal('emergency_sos')}
          className="px-8 py-3 rounded-full font-medium text-sm flex items-center gap-2 bg-gradient-to-r from-rose-600/80 to-rose-500/60 border border-rose-400/30 shadow-[0_0_30px_rgba(244,63,94,0.3)]"
          whileHover={{ 
            scale: 1.03,
            boxShadow: '0 0 40px rgba(244, 63, 94, 0.4)',
          }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div 
            className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center"
            animate={{
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
            }}
          >
            <span className="text-xs font-bold">!</span>
          </motion.div>
          Emergency SOS
        </motion.button>
      </motion.div>
    </div>
  )
}
