/**
 * HomeScreen - Premium Control Center
 * Main customer landing page with quick actions, recent activity, and service cards
 */

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
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
  Sun,
  ChevronRight,
  AlertTriangle,
  Navigation,
  Star,
  Car,
  Shield,
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
import { StatusBadge, Badge, NotificationDot } from '../components/ui'

// ============================================
// CONSTANTS & CONFIG
// ============================================

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

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  },
}

// ============================================
// SUB-COMPONENTS
// ============================================

// Header Component
const Header = memo(({ unreadCount }: { unreadCount: number }) => (
  <motion.header 
    className="flex justify-between items-center"
    variants={itemVariants}
  >
    <div>
      <motion.h1 
        className="text-3xl font-bold tracking-tight"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
      >
        <span className="gradient-text">AID</span>
      </motion.h1>
      <p className="text-white/40 text-xs font-medium tracking-widest uppercase mt-0.5">
        Roadside Assistance
      </p>
    </div>
    
    <div className="flex gap-3 items-center">
      <motion.button 
        className="glass w-11 h-11 rounded-xl flex items-center justify-center relative"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Notifications"
      >
        <Bell size={20} strokeWidth={1.5} className="text-white/60" />
        {unreadCount > 0 && (
          <NotificationDot count={unreadCount} size="sm" className="absolute -top-1 -right-1" />
        )}
      </motion.button>
      
      <motion.button 
        className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary-500/30 to-primary-600/20 border border-primary-500/30"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Profile"
      >
        <User size={20} strokeWidth={1.5} className="text-primary-300" />
      </motion.button>
    </div>
  </motion.header>
))

Header.displayName = 'Header'

// Map Widget Component
const MapWidget = memo(({ 
  mechanicsCount, 
  searchQuery, 
  setSearchQuery, 
  isSearchFocused, 
  setIsSearchFocused,
  filteredServices,
  recentSearches,
  setActiveModal,
  searchRef,
  handleSearchSubmit,
}: {
  mechanicsCount: number
  searchQuery: string
  setSearchQuery: (query: string) => void
  isSearchFocused: boolean
  setIsSearchFocused: (focused: boolean) => void
  filteredServices: typeof services
  recentSearches: string[]
  setActiveModal: (modal: 'services' | 'towing' | 'ev_charging' | 'detailing' | 'window_tinting' | 'emergency_sos' | 'history' | 'search' | null) => void
  searchRef: React.RefObject<HTMLInputElement>
  handleSearchSubmit: () => void
}) => (
  <motion.div 
    className="glass-elevated rounded-3xl h-[320px] relative overflow-hidden"
    variants={itemVariants}
  >
    {/* Map Background */}
    <div className="absolute inset-0 bg-gradient-to-b from-void-600 via-void-700 to-void-800">
      {/* Road Grid Pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-20">
        <defs>
          <linearGradient id="roadGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.5" />
            <stop offset="50%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <line x1="0" y1="80" x2="100%" y2="90" stroke="url(#roadGradient)" strokeWidth="1.5" />
        <line x1="0" y1="160" x2="100%" y2="150" stroke="url(#roadGradient)" strokeWidth="2" />
        <line x1="0" y1="240" x2="100%" y2="250" stroke="url(#roadGradient)" strokeWidth="1.5" />
        <line x1="100" y1="0" x2="90" y2="100%" stroke="url(#roadGradient)" strokeWidth="1.5" />
        <line x1="200" y1="0" x2="210" y2="100%" stroke="url(#roadGradient)" strokeWidth="2.5" />
        <line x1="300" y1="0" x2="290" y2="100%" stroke="url(#roadGradient)" strokeWidth="1.5" />
      </svg>

      {/* Nearby Providers Dots */}
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
          <motion.div 
            className="absolute inset-[-8px] border border-accent-500/30 rounded-full"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, delay: pos.delay, repeat: Infinity }}
          />
          <div className="w-2.5 h-2.5 bg-accent-500 rounded-full shadow-glow-accent" />
        </div>
      ))}

      {/* User Location Marker */}
      <div className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="absolute w-16 h-16 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary-500/10 rounded-full animate-pulse-slow" />
        <div className="absolute w-10 h-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary-500/20 rounded-full animate-pulse-slow" 
          style={{ animationDelay: '-1s' }}
        />
        <div className="w-5 h-5 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full border-[3px] border-white shadow-glow-primary location-pulse" />
      </div>
    </div>

    {/* Top Info Cards */}
    <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
      <div className="glass px-3 py-2 rounded-xl">
        <div className="flex items-center gap-1.5">
          <Navigation size={12} className="text-primary-400" />
          <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">Your Location</p>
        </div>
        <p className="text-white/90 text-sm font-medium mt-0.5">Downtown District</p>
      </div>
      <motion.div 
        className="glass px-3 py-2 rounded-xl text-right"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <p className="text-accent-400 text-xl font-bold">{mechanicsCount}</p>
        <p className="text-white/40 text-[10px] font-medium">Providers Nearby</p>
      </motion.div>
    </div>

    {/* Search Bar */}
    <div className="absolute bottom-4 left-4 right-4">
      <motion.div 
        className="glass px-4 py-3.5 rounded-2xl flex items-center gap-3 relative"
        animate={{ 
          boxShadow: isSearchFocused 
            ? '0 0 30px rgba(139, 92, 246, 0.3)' 
            : '0 8px 32px rgba(0, 0, 0, 0.4)',
          borderColor: isSearchFocused ? 'rgba(139, 92, 246, 0.3)' : 'transparent'
        }}
        transition={{ duration: 0.2 }}
      >
        <Search size={18} strokeWidth={1.5} className="text-white/40 flex-shrink-0" />
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
          placeholder="Search for service or location..."
          className="bg-transparent border-none outline-none text-white/80 text-sm flex-1 placeholder:text-white/30 min-w-0"
        />
        <AnimatePresence>
          {searchQuery && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              onClick={() => setSearchQuery('')}
              className="text-white/40 hover:text-white/60 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </motion.button>
          )}
        </AnimatePresence>
        <Mic size={18} strokeWidth={1.5} className="text-white/40 cursor-pointer hover:text-white/60 transition-colors flex-shrink-0" />
      </motion.div>
      
      {/* Search Dropdown */}
      <AnimatePresence>
        {isSearchFocused && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="absolute bottom-full left-0 right-0 mb-2 glass-elevated rounded-2xl p-3 max-h-48 overflow-y-auto"
          >
            {searchQuery ? (
              filteredServices.length > 0 ? (
                <div className="space-y-1">
                  {filteredServices.map((service) => {
                    const Icon = serviceIcons[service.id]
                    return (
                      <motion.button
                        key={service.id}
                        className="w-full p-2.5 rounded-xl flex items-center gap-3 hover:bg-white/10 transition-colors"
                        whileHover={{ x: 5 }}
                        onClick={() => {
                          setActiveModal('services')
                          setSearchQuery('')
                        }}
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center">
                          <Icon size={16} className="text-primary-300" />
                        </div>
                        <div className="text-left">
                          <span className="text-white/90 text-sm block">{service.name}</span>
                          <span className="text-white/40 text-xs">{service.description}</span>
                        </div>
                      </motion.button>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-white/40 text-sm">No services found</p>
                  <p className="text-white/30 text-xs mt-1">Try a different search term</p>
                </div>
              )
            ) : (
              <div>
                <p className="text-white/40 text-xs font-medium mb-2 px-1">Recent Searches</p>
                <div className="space-y-1">
                  {recentSearches.length > 0 ? recentSearches.map((search, i) => (
                    <motion.button
                      key={i}
                      className="w-full p-2 rounded-xl flex items-center gap-3 hover:bg-white/10 transition-colors"
                      whileHover={{ x: 5 }}
                      onClick={() => setSearchQuery(search)}
                    >
                      <Clock size={14} className="text-white/30" />
                      <span className="text-white/60 text-sm">{search}</span>
                    </motion.button>
                  )) : (
                    <p className="text-white/30 text-xs px-2 py-2">No recent searches</p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </motion.div>
))

MapWidget.displayName = 'MapWidget'

// Quick Action Button
const QuickActionButton = memo(({ 
  icon: Icon, 
  label, 
  eta, 
  onClick, 
  index,
  variant = 'default'
}: {
  icon: React.ElementType
  label: string
  eta?: number
  onClick: () => void
  index: number
  variant?: 'default' | 'primary'
}) => (
  <motion.button
    onClick={onClick}
    className={`relative flex-1 py-4 px-3 rounded-2xl flex flex-col items-center gap-2 transition-all ${
      variant === 'primary' 
        ? 'bg-gradient-to-br from-primary-500/30 to-primary-600/20 border border-primary-500/30'
        : 'glass-button'
    }`}
    whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(139, 92, 246, 0.3)' }}
    whileTap={{ scale: 0.97 }}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.3 + index * 0.1 }}
  >
    {eta && (
      <motion.div 
        className="absolute -top-2 -right-2 glass px-2 py-0.5 rounded-full"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5 + index * 0.1, type: 'spring' }}
      >
        <span className="text-[10px] font-medium text-accent-400">{eta}m</span>
      </motion.div>
    )}
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
      variant === 'primary' 
        ? 'bg-primary-500/20' 
        : 'bg-white/5'
    }`}>
      <Icon 
        size={24}
        strokeWidth={1.5}
        className={variant === 'primary' ? 'text-primary-300' : 'text-white/70'}
      />
    </div>
    <span className="text-xs font-medium text-white/80">
      {label}
    </span>
  </motion.button>
))

QuickActionButton.displayName = 'QuickActionButton'

// Quick Access Card
const QuickAccessCard = memo(({ 
  icon: Icon, 
  label, 
  sublabel, 
  onClick 
}: {
  icon: React.ElementType
  label: string
  sublabel: string
  onClick: () => void
}) => (
  <motion.button
    onClick={onClick}
    className="flex-1 glass px-3 py-3 rounded-2xl flex items-center gap-3 hover:bg-white/5 transition-all active:scale-[0.98]"
    whileHover={{ scale: 1.02, y: -2 }}
    whileTap={{ scale: 0.98 }}
  >
    <div className="w-9 h-9 rounded-xl bg-primary-500/15 flex items-center justify-center flex-shrink-0">
      <Icon size={18} strokeWidth={1.5} className="text-primary-300" />
    </div>
    <div className="text-left min-w-0">
      <p className="text-white/40 text-[10px] font-medium">{label}</p>
      <p className="text-white/90 text-sm font-medium truncate">{sublabel}</p>
    </div>
  </motion.button>
))

QuickAccessCard.displayName = 'QuickAccessCard'

// Service Card (Premium)
const ServiceCard = memo(({ 
  icon: Icon, 
  title, 
  description, 
  onClick, 
  gradient,
  glowColor,
}: {
  icon: React.ElementType
  title: string
  description: string
  onClick: () => void
  gradient: string
  glowColor: string
}) => (
  <motion.button
    onClick={onClick}
    className="flex-1 relative overflow-hidden rounded-2xl p-4 cursor-pointer min-h-[120px]"
    style={{ background: gradient }}
    whileHover={{ scale: 1.03, boxShadow: `0 0 40px ${glowColor}, 0 8px 32px rgba(0, 0, 0, 0.4)` }}
    whileTap={{ scale: 0.98 }}
    initial={{ boxShadow: `0 0 20px ${glowColor}, 0 4px 16px rgba(0, 0, 0, 0.3)` }}
  >
    {/* Glass overlay */}
    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-primary-500/10 pointer-events-none" />
    <div className="absolute inset-0 border border-primary-500/20 rounded-2xl pointer-events-none" />
    
    {/* Shine animation */}
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
    >
      <motion.div
        className="absolute w-[200%] h-full"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, transparent 40%, rgba(255, 255, 255, 0.1) 50%, transparent 60%, transparent 100%)',
        }}
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 3, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
      />
    </motion.div>

    {/* Content */}
    <div className="relative z-10 flex flex-col items-start h-full">
      <motion.div 
        className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center mb-3 border border-white/10"
        animate={{ boxShadow: [`0 0 15px ${glowColor}`, `0 0 25px ${glowColor}`, `0 0 15px ${glowColor}`] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Icon size={22} strokeWidth={1.5} className="text-white/90" />
      </motion.div>
      <p className="text-white text-sm font-semibold tracking-tight">{title}</p>
      <p className="text-white/50 text-[11px] font-medium mt-0.5">{description}</p>
    </div>
  </motion.button>
))

ServiceCard.displayName = 'ServiceCard'

// ============================================
// MAIN COMPONENT
// ============================================

export default function HomeScreen() {
  const { 
    mechanics, 
    setActiveModal,
    unreadCount,
    searchQuery,
    setSearchQuery,
    recentSearches,
    addRecentSearch,
    activeBooking,
  } = useAppStore()
  
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Memoized filtered services
  const filteredServices = useMemo(() => {
    if (!searchQuery) return services
    const query = searchQuery.toLowerCase()
    return services.filter(s => 
      s.name.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query)
    )
  }, [searchQuery])

  // Search submit handler
  const handleSearchSubmit = useCallback(() => {
    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim())
      setIsSearchFocused(false)
    }
  }, [searchQuery, addRecentSearch])

  // Main service actions
  const mainServices = useMemo(() => [
    { id: 'services', icon: Wrench, label: 'Services', modal: 'services' as const, variant: 'primary' as const },
    { id: 'towing', icon: Truck, label: 'Towing', eta: 18, modal: 'towing' as const },
    { id: 'ev_charging', icon: Zap, label: 'EV Charge', eta: 12, modal: 'ev_charging' as const },
  ], [])

  return (
    <motion.div 
      className="max-w-md mx-auto px-5 py-6 space-y-5"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* All Modals */}
      <ServicesModal />
      <TowingModal />
      <EVChargingModal />
      <DetailingModal />
      <WindowTintingModal />
      <EmergencySOSModal />
      <HistoryModal />

      {/* Active Service Banner */}
      <AnimatePresence>
        {activeBooking && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            className="glass-success rounded-2xl p-4 flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-xl bg-accent-500/20 flex items-center justify-center">
              <Car size={24} className="text-accent-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm">Active Service</p>
              <p className="text-white/60 text-xs truncate">{activeBooking.service.name}</p>
            </div>
            <StatusBadge status={activeBooking.status} size="sm" />
            <ChevronRight size={18} className="text-white/40" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <Header unreadCount={unreadCount} />

      {/* Map Widget */}
      <MapWidget
        mechanicsCount={mechanics.length}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isSearchFocused={isSearchFocused}
        setIsSearchFocused={setIsSearchFocused}
        filteredServices={filteredServices}
        recentSearches={recentSearches}
        setActiveModal={setActiveModal}
        searchRef={searchRef as React.RefObject<HTMLInputElement>}
        handleSearchSubmit={handleSearchSubmit}
      />

      {/* Quick Actions */}
      <motion.div className="flex gap-3" variants={itemVariants}>
        {mainServices.map((service, index) => (
          <QuickActionButton
            key={service.id}
            icon={service.icon}
            label={service.label}
            eta={service.eta}
            onClick={() => setActiveModal(service.modal)}
            index={index}
            variant={service.variant}
          />
        ))}
      </motion.div>

      {/* Quick Access */}
      <motion.div className="flex gap-3" variants={itemVariants}>
        {[
          { icon: MapPin, label: 'Saved', sublabel: 'Home', action: () => setActiveModal('services') },
          { icon: Building2, label: 'Saved', sublabel: 'Work', action: () => setActiveModal('services') },
          { icon: Clock, label: 'Recent', sublabel: 'History', action: () => setActiveModal('history') },
        ].map((item, i) => (
          <QuickAccessCard 
            key={i}
            icon={item.icon}
            label={item.label}
            sublabel={item.sublabel}
            onClick={item.action}
          />
        ))}
      </motion.div>

      {/* Car Care Section */}
      <motion.section variants={itemVariants}>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wider">
            Car Care Services
          </h2>
          <motion.button 
            className="text-primary-400 text-xs font-medium flex items-center gap-1"
            whileHover={{ x: 3 }}
          >
            View All <ChevronRight size={14} />
          </motion.button>
        </div>
        
        <div className="flex gap-3">
          <ServiceCard
            icon={Sparkles}
            title="Detailing"
            description="Premium wash & polish"
            onClick={() => setActiveModal('detailing')}
            gradient="linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a3e 100%)"
            glowColor="rgba(147, 197, 253, 0.3)"
          />
          <ServiceCard
            icon={Sun}
            title="Window Tinting"
            description="UV protection & privacy"
            onClick={() => setActiveModal('window_tinting')}
            gradient="linear-gradient(135deg, #1a1a2e 0%, #1e1e3f 50%, #16213e 100%)"
            glowColor="rgba(251, 191, 36, 0.3)"
          />
        </div>
      </motion.section>

      {/* Safety Section */}
      <motion.section variants={itemVariants}>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wider">
            Safety & Support
          </h2>
        </div>
        
        <div className="flex gap-3">
          {/* Emergency SOS */}
          <motion.button
            onClick={() => setActiveModal('emergency_sos')}
            className="flex-1 glass-error rounded-2xl p-4 flex items-center gap-4"
            whileHover={{ scale: 1.02, boxShadow: '0 0 30px rgba(239, 68, 68, 0.3)' }}
            whileTap={{ scale: 0.98 }}
          >
            <motion.div 
              className="w-11 h-11 rounded-xl bg-error/20 flex items-center justify-center"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <AlertTriangle size={22} className="text-red-400" />
            </motion.div>
            <div className="text-left">
              <p className="text-white font-semibold text-sm">Emergency SOS</p>
              <p className="text-white/50 text-xs">24/7 instant help</p>
            </div>
          </motion.button>
          
          {/* Safety Features */}
          <motion.button
            className="flex-1 glass rounded-2xl p-4 flex items-center gap-4"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-11 h-11 rounded-xl bg-primary-500/15 flex items-center justify-center">
              <Shield size={22} className="text-primary-300" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold text-sm">Safety</p>
              <p className="text-white/50 text-xs">Share trip & more</p>
            </div>
          </motion.button>
        </div>
      </motion.section>

      {/* Bottom spacing for safe area */}
      <div className="h-4" />
    </motion.div>
  )
}
