/**
 * ActiveServiceScreen - Premium Live Tracking
 * Shows real-time tracking of active service with driver info, ETA, and actions
 */

import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone,
  MessageCircle,
  MapPin,
  Navigation,
  Clock,
  AlertTriangle,
  ChevronLeft,
  MoreVertical,
  Star,
  Shield,
  Share2,
  X,
  CheckCircle,
  Car,
  Truck,
  User,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { StatusBadge, Avatar } from '../components/ui'
import { BookingStatus } from '../types'

type ServiceStatus = BookingStatus

// ============================================
// TYPES
// ============================================

interface DriverInfo {
  id: string
  name: string
  photo?: string
  rating: number
  totalJobs: number
  vehicleInfo: string
  licensePlate: string
  phone: string
}

interface ServiceProgress {
  status: ServiceStatus
  eta: number
  distance?: string
  driverLocation?: { lat: number; lng: number }
  timeline: {
    status: ServiceStatus
    time: string
    completed: boolean
    current: boolean
  }[]
}

// ============================================
// MOCK DATA
// ============================================

const mockDriver: DriverInfo = {
  id: 'drv-001',
  name: 'Marcus Johnson',
  rating: 4.9,
  totalJobs: 342,
  vehicleInfo: 'Ford F-150 (White)',
  licensePlate: 'ABC-1234',
  phone: '+1 (555) 123-4567',
}

const mockProgress: ServiceProgress = {
  status: 'en_route',
  eta: 12,
  distance: '3.2 mi',
  timeline: [
    { status: 'pending', time: '2:30 PM', completed: true, current: false },
    { status: 'accepted', time: '2:32 PM', completed: true, current: false },
    { status: 'en_route', time: '2:35 PM', completed: false, current: true },
    { status: 'arrived', time: 'Est. 2:47 PM', completed: false, current: false },
    { status: 'completed', time: '-', completed: false, current: false },
  ],
}

// ============================================
// SUB-COMPONENTS
// ============================================

// Header
const Header = memo(({ onBack, onMore }: { onBack: () => void; onMore: () => void }) => (
  <motion.header
    className="flex items-center justify-between px-5 py-4"
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
  >
    <motion.button
      onClick={onBack}
      className="w-10 h-10 rounded-xl glass flex items-center justify-center"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <ChevronLeft size={20} className="text-white/80" />
    </motion.button>
    
    <h1 className="text-white font-semibold">Live Tracking</h1>
    
    <motion.button
      onClick={onMore}
      className="w-10 h-10 rounded-xl glass flex items-center justify-center"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <MoreVertical size={20} className="text-white/80" />
    </motion.button>
  </motion.header>
))

Header.displayName = 'Header'

// Map View with Driver Marker
const MapView = memo(({ 
  eta, 
  distance 
}: { 
  eta: number
  distance?: string 
}) => (
  <motion.div
    className="relative h-[280px] mx-5 rounded-3xl overflow-hidden glass-elevated"
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay: 0.1 }}
  >
    {/* Map Background */}
    <div className="absolute inset-0 bg-gradient-to-b from-void-600 via-void-700 to-void-800">
      <svg className="absolute inset-0 w-full h-full opacity-20">
        <defs>
          <linearGradient id="roadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <line x1="0" y1="70" x2="100%" y2="80" stroke="url(#roadGrad)" strokeWidth="2" />
        <line x1="0" y1="140" x2="100%" y2="130" stroke="url(#roadGrad)" strokeWidth="2.5" />
        <line x1="0" y1="210" x2="100%" y2="220" stroke="url(#roadGrad)" strokeWidth="2" />
        <line x1="100" y1="0" x2="90" y2="100%" stroke="url(#roadGrad)" strokeWidth="2" />
        <line x1="200" y1="0" x2="210" y2="100%" stroke="url(#roadGrad)" strokeWidth="2.5" />
        <line x1="300" y1="0" x2="290" y2="100%" stroke="url(#roadGrad)" strokeWidth="2" />
      </svg>
      
      {/* Animated route line */}
      <motion.div
        className="absolute top-1/2 left-[20%] w-[60%] h-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <svg className="w-full h-full">
          <motion.line
            x1="0"
            y1="2"
            x2="100%"
            y2="2"
            stroke="url(#roadGrad)"
            strokeWidth="4"
            strokeDasharray="8 4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
          />
        </svg>
      </motion.div>
      
      {/* User Location */}
      <div className="absolute left-[75%] top-[55%] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute w-12 h-12 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary-500/20 rounded-full animate-pulse-slow" />
        <div className="w-4 h-4 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full border-2 border-white shadow-glow-primary" />
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-white/60 whitespace-nowrap">You</span>
      </div>
      
      {/* Driver Location */}
      <motion.div
        className="absolute left-[25%] top-[45%] -translate-x-1/2 -translate-y-1/2"
        animate={{ x: [0, 5, 0], y: [0, -3, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="absolute w-14 h-14 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-accent-500/20 rounded-full animate-pulse-slow" />
        <div className="w-8 h-8 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center border-2 border-white shadow-glow-accent">
          <Truck size={16} className="text-white" />
        </div>
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-accent-400 whitespace-nowrap font-medium">Driver</span>
      </motion.div>
    </div>
    
    {/* ETA Overlay */}
    <div className="absolute top-4 left-4 right-4 flex justify-between">
      <motion.div
        className="glass px-4 py-2 rounded-xl"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-accent-400" />
          <span className="text-white/90 text-sm font-semibold">{eta} min</span>
        </div>
        <p className="text-white/40 text-xs">ETA</p>
      </motion.div>
      
      {distance && (
        <motion.div
          className="glass px-4 py-2 rounded-xl"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-2">
            <Navigation size={14} className="text-primary-400" />
            <span className="text-white/90 text-sm font-semibold">{distance}</span>
          </div>
          <p className="text-white/40 text-xs">Distance</p>
        </motion.div>
      )}
    </div>
    
    {/* Recenter button */}
    <motion.button
      className="absolute bottom-4 right-4 w-10 h-10 glass rounded-xl flex items-center justify-center"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <Navigation size={18} className="text-white/60" />
    </motion.button>
  </motion.div>
))

MapView.displayName = 'MapView'

// Status Timeline
const StatusTimeline = memo(({ timeline }: { timeline: ServiceProgress['timeline'] }) => (
  <motion.div
    className="mx-5 mt-4 glass rounded-2xl p-4"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.2 }}
  >
    <h3 className="text-white/60 text-xs font-medium uppercase tracking-wider mb-3">Status Timeline</h3>
    <div className="relative">
      {timeline.map((item, index) => {
        const statusLabels: Record<ServiceStatus, string> = {
          pending: 'Request Received',
          searching: 'Finding Driver',
          accepted: 'Driver Assigned',
          en_route: 'Driver En Route',
          arrived: 'Driver Arrived',
          in_progress: 'Service In Progress',
          completed: 'Service Complete',
          cancelled: 'Cancelled',
        }
        
        return (
          <div key={item.status} className="flex items-start gap-3 relative">
            {/* Connector line */}
            {index < timeline.length - 1 && (
              <div 
                className={`absolute left-[11px] top-6 w-0.5 h-8 ${
                  item.completed ? 'bg-accent-500' : 'bg-surface-light'
                }`}
              />
            )}
            
            {/* Status dot */}
            <motion.div
              className={`relative w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                item.completed 
                  ? 'bg-accent-500' 
                  : item.current 
                    ? 'bg-primary-500' 
                    : 'bg-surface-light'
              }`}
              animate={item.current ? { scale: [1, 1.1, 1] } : {}}
              transition={item.current ? { duration: 1.5, repeat: Infinity } : {}}
            >
              {item.completed ? (
                <CheckCircle size={14} className="text-white" />
              ) : item.current ? (
                <motion.div
                  className="w-2 h-2 bg-white rounded-full"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              ) : (
                <div className="w-2 h-2 bg-white/30 rounded-full" />
              )}
            </motion.div>
            
            {/* Status info */}
            <div className="flex-1 pb-4">
              <p className={`text-sm font-medium ${
                item.completed || item.current ? 'text-white' : 'text-white/40'
              }`}>
                {statusLabels[item.status]}
              </p>
              <p className={`text-xs ${
                item.completed || item.current ? 'text-white/60' : 'text-white/30'
              }`}>
                {item.time}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  </motion.div>
))

StatusTimeline.displayName = 'StatusTimeline'

// Driver Card
const DriverCard = memo(({ 
  driver, 
  onCall, 
  onMessage 
}: { 
  driver: DriverInfo
  onCall: () => void
  onMessage: () => void
}) => (
  <motion.div
    className="mx-5 mt-4 glass-elevated rounded-2xl p-4"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.3 }}
  >
    <div className="flex items-center gap-4">
      {/* Driver Avatar */}
      <Avatar
        src={driver.photo}
        name={driver.name}
        size="lg"
        online
      />
      
      {/* Driver Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-white font-semibold text-lg truncate">{driver.name}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          <Star size={14} className="text-warning fill-warning" />
          <span className="text-white/80 text-sm font-medium">{driver.rating}</span>
          <span className="text-white/40 text-sm">• {driver.totalJobs} jobs</span>
        </div>
        <p className="text-white/50 text-xs mt-1 truncate">{driver.vehicleInfo}</p>
      </div>
    </div>
    
    {/* Vehicle Info */}
    <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-surface-dark">
      <div className="w-10 h-10 rounded-lg bg-primary-500/15 flex items-center justify-center">
        <Car size={20} className="text-primary-300" />
      </div>
      <div>
        <p className="text-white/60 text-xs">License Plate</p>
        <p className="text-white font-mono font-semibold">{driver.licensePlate}</p>
      </div>
    </div>
    
    {/* Action Buttons */}
    <div className="mt-4 flex gap-3">
      <motion.button
        onClick={onCall}
        className="flex-1 py-3 px-4 rounded-xl bg-accent-500/20 border border-accent-500/30 flex items-center justify-center gap-2"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Phone size={18} className="text-accent-400" />
        <span className="text-accent-400 font-medium text-sm">Call</span>
      </motion.button>
      
      <motion.button
        onClick={onMessage}
        className="flex-1 py-3 px-4 rounded-xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center gap-2"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <MessageCircle size={18} className="text-primary-400" />
        <span className="text-primary-400 font-medium text-sm">Message</span>
      </motion.button>
    </div>
  </motion.div>
))

DriverCard.displayName = 'DriverCard'

// Action Bar (fixed bottom)
const ActionBar = memo(({ 
  onShare, 
  onEmergency 
}: { 
  onShare: () => void
  onEmergency: () => void
}) => (
  <motion.div
    className="fixed bottom-0 left-0 right-0 p-5 safe-bottom"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.4 }}
  >
    <div className="max-w-md mx-auto flex gap-3">
      <motion.button
        onClick={onShare}
        className="flex-1 py-4 px-4 rounded-2xl glass flex items-center justify-center gap-2"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Share2 size={18} className="text-white/70" />
        <span className="text-white/70 font-medium text-sm">Share Trip</span>
      </motion.button>
      
      <motion.button
        onClick={onEmergency}
        className="flex-1 py-4 px-4 rounded-2xl bg-error/20 border border-error/30 flex items-center justify-center gap-2"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Shield size={18} className="text-error" />
        <span className="text-error font-medium text-sm">Emergency</span>
      </motion.button>
    </div>
  </motion.div>
))

ActionBar.displayName = 'ActionBar'

// ============================================
// MAIN COMPONENT
// ============================================

export default function ActiveServiceScreen() {
  const { setCurrentScreen, activeBooking, setActiveModal } = useAppStore()
  
  const [driver] = useState<DriverInfo>(mockDriver)
  const [progress] = useState<ServiceProgress>(mockProgress)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  
  const handleBack = useCallback(() => {
    setCurrentScreen('home')
  }, [setCurrentScreen])
  
  const handleCall = useCallback(() => {
    // In real app, this would initiate a call
    console.log('Calling driver:', driver.phone)
  }, [driver.phone])
  
  const handleMessage = useCallback(() => {
    setCurrentScreen('chat')
  }, [setCurrentScreen])
  
  const handleShare = useCallback(() => {
    // In real app, this would open share sheet
    console.log('Sharing trip')
  }, [])
  
  const handleEmergency = useCallback(() => {
    setActiveModal('emergency_sos')
  }, [setActiveModal])
  
  // If no active service, show nothing or redirect
  // For demo purposes, we'll always show the mock data
  
  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <Header onBack={handleBack} onMore={() => setShowMoreMenu(true)} />
      
      {/* Service Status Badge */}
      <div className="px-5 mb-4">
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <StatusBadge status={progress.status} size="lg" />
          <p className="text-white/60 text-sm">Oil Change Service</p>
        </motion.div>
      </div>
      
      {/* Map */}
      <MapView eta={progress.eta} distance={progress.distance} />
      
      {/* Driver Card */}
      <DriverCard 
        driver={driver} 
        onCall={handleCall} 
        onMessage={handleMessage}
      />
      
      {/* Status Timeline */}
      <StatusTimeline timeline={progress.timeline} />
      
      {/* Bottom Action Bar */}
      <ActionBar onShare={handleShare} onEmergency={handleEmergency} />
      
      {/* More Menu Modal */}
      <AnimatePresence>
        {showMoreMenu && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMoreMenu(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 p-4 safe-bottom"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            >
              <div className="max-w-md mx-auto bg-surface rounded-2xl overflow-hidden border border-surface-light">
                <div className="p-4 border-b border-surface-light">
                  <h3 className="text-white font-semibold">More Options</h3>
                </div>
                {[
                  { icon: MapPin, label: 'Change pickup location' },
                  { icon: Clock, label: 'Request later time' },
                  { icon: X, label: 'Cancel service', danger: true },
                ].map((item, i) => (
                  <motion.button
                    key={i}
                    className={`w-full p-4 flex items-center gap-3 hover:bg-surface-light transition-colors ${
                      item.danger ? 'text-error' : 'text-white/80'
                    }`}
                    whileTap={{ scale: 0.98 }}
                  >
                    <item.icon size={20} />
                    <span className="font-medium">{item.label}</span>
                  </motion.button>
                ))}
              </div>
              <motion.button
                className="w-full max-w-md mx-auto mt-2 p-4 bg-surface rounded-2xl border border-surface-light text-white font-semibold"
                onClick={() => setShowMoreMenu(false)}
                whileTap={{ scale: 0.98 }}
              >
                Cancel
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
