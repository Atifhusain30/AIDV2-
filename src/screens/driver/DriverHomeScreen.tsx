/**
 * Driver Home Screen
 * Main dashboard for accepting and managing service requests
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Power, 
  MapPin, 
  Clock, 
  DollarSign, 
  Phone,
  Navigation,
  Check,
  X,
  Bell,
  Settings,
  User,
  Loader2,
  AlertCircle,
  Star,
  FileCheck,
  ChevronRight
} from 'lucide-react'
import { useDriverStore } from '../../store/useDriverStore'
import { useAuthStore } from '../../store/useAuthStore'
import { locationService } from '../../services/location'
import type { ServiceRequest, Driver, Location } from '../../types'

interface DriverHomeScreenProps {
  onOpenOnboarding: () => void
  onOpenSettings: () => void
  onOpenActiveJob: () => void
}

export default function DriverHomeScreen({ 
  onOpenOnboarding, 
  onOpenSettings,
  onOpenActiveJob 
}: DriverHomeScreenProps) {
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null)
  
  const { user } = useAuthStore()
  const driver = user as Driver | null

  const {
    isOnline,
    setOnlineStatus,
    currentLocation,
    setCurrentLocation,
    incomingRequests,
    fetchIncomingRequests,
    acceptRequest,
    declineRequest,
    activeBooking,
    isLoading
  } = useDriverStore()

  // Start location tracking when online
  useEffect(() => {
    let watchId: string | null = null

    const startTracking = async () => {
      if (isOnline) {
        try {
          // Request permission first
          await locationService.requestPermission()
          
          // Get initial location
          const location = await locationService.getCurrentLocation()
          setCurrentLocation(location)

          // Start watching
          watchId = await locationService.watchLocation(
            (loc) => setCurrentLocation(loc),
            (error) => console.error('Location error:', error)
          )
        } catch (error) {
          console.error('Failed to start location tracking:', error)
        }
      }
    }

    startTracking()

    return () => {
      if (watchId) {
        locationService.stopWatch(watchId)
      }
    }
  }, [isOnline, setCurrentLocation])

  // Poll for requests when online
  useEffect(() => {
    if (!isOnline) return

    fetchIncomingRequests()
    const interval = setInterval(fetchIncomingRequests, 10000) // Poll every 10s

    return () => clearInterval(interval)
  }, [isOnline, fetchIncomingRequests])

  const handleToggleOnline = async () => {
    await setOnlineStatus(!isOnline)
  }

  const handleAcceptRequest = async (request: ServiceRequest) => {
    const success = await acceptRequest(request.id)
    if (success) {
      setSelectedRequest(null)
      // Navigate to active job screen
      onOpenActiveJob()
    }
  }

  const handleDeclineRequest = (requestId: string) => {
    declineRequest(requestId)
    setSelectedRequest(null)
  }

  const formatDistance = (request: ServiceRequest): string => {
    if (!currentLocation) return '--'
    const distance = locationService.calculateDistance(currentLocation, request.location)
    return `${distance} mi`
  }

  const formatETA = (request: ServiceRequest): string => {
    if (!currentLocation) return '--'
    const distance = locationService.calculateDistance(currentLocation, request.location)
    return `${locationService.estimateETA(distance)} min`
  }

  // Check if driver needs onboarding
  const needsOnboarding = driver && (!driver.documents?.length || driver.verificationStatus === 'pending')

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-24 safe-top">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">
              Hey, {driver?.firstName || 'Driver'}!
            </h1>
            <p className="text-gray-500 text-sm">
              {isOnline ? 'Ready for jobs' : 'Go online to receive requests'}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={onOpenSettings}
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center"
            >
              <Settings size={20} className="text-gray-400" />
            </button>
            <button className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center relative">
              <Bell size={20} className="text-gray-400" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
            </button>
          </div>
        </div>

        {/* Online Toggle */}
        <motion.button
          onClick={handleToggleOnline}
          className={`w-full py-4 px-6 rounded-2xl flex items-center justify-between ${
            isOnline 
              ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30' 
              : 'bg-white/5 border border-white/10'
          }`}
          whileTap={{ scale: 0.98 }}
        >
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isOnline ? 'bg-emerald-500' : 'bg-gray-700'
            }`}>
              <Power size={24} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold">
                {isOnline ? "You're Online" : "You're Offline"}
              </p>
              <p className="text-gray-500 text-sm">
                {isOnline ? 'Receiving job requests' : 'Tap to go online'}
              </p>
            </div>
          </div>
          <div className={`w-14 h-8 rounded-full relative transition-colors ${
            isOnline ? 'bg-emerald-500' : 'bg-gray-700'
          }`}>
            <motion.div
              className="absolute top-1 w-6 h-6 rounded-full bg-white shadow-lg"
              animate={{ left: isOnline ? '1.75rem' : '0.25rem' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </div>
        </motion.button>
      </div>

      {/* Onboarding Banner */}
      {needsOnboarding && (
        <motion.div 
          className="mx-6 mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            onClick={onOpenOnboarding}
            className="w-full p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <FileCheck size={20} className="text-amber-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-white font-medium">Complete Verification</p>
              <p className="text-amber-400/80 text-sm">Upload required documents</p>
            </div>
            <ChevronRight size={20} className="text-amber-400" />
          </button>
        </motion.div>
      )}

      {/* Active Job Banner */}
      {activeBooking && (
        <motion.div 
          className="mx-6 mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            onClick={onOpenActiveJob}
            className="w-full p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center animate-pulse">
              <Navigation size={20} className="text-emerald-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-white font-medium">Active Job</p>
              <p className="text-emerald-400/80 text-sm">{activeBooking.service.name} - {activeBooking.status}</p>
            </div>
            <ChevronRight size={20} className="text-emerald-400" />
          </button>
        </motion.div>
      )}

      {/* Stats Cards */}
      <div className="px-6 grid grid-cols-2 gap-3 mb-6">
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Star size={16} className="text-amber-400" />
            <span className="text-gray-400 text-sm">Rating</span>
          </div>
          <p className="text-2xl font-bold text-white">{driver?.rating?.toFixed(1) || '0.0'}</p>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Check size={16} className="text-emerald-400" />
            <span className="text-gray-400 text-sm">Total Jobs</span>
          </div>
          <p className="text-2xl font-bold text-white">{driver?.totalJobs || 0}</p>
        </div>
      </div>

      {/* Incoming Requests */}
      <div className="px-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          {isOnline ? 'Incoming Requests' : 'Go online to see requests'}
        </h2>

        {isOnline && incomingRequests.length === 0 && !isLoading && (
          <motion.div 
            className="text-center py-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Clock size={32} className="text-gray-600" />
            </div>
            <p className="text-gray-500">No requests yet</p>
            <p className="text-gray-600 text-sm mt-1">New jobs will appear here</p>
          </motion.div>
        )}

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="text-emerald-400 animate-spin" />
          </div>
        )}

        {/* Request Cards */}
        <div className="space-y-4">
          {incomingRequests.map((request, index) => (
            <motion.div
              key={request.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-4 rounded-xl bg-white/5 border border-white/10"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold">{request.service.name}</h3>
                  <p className="text-gray-500 text-sm">{request.customerName}</p>
                </div>
                <span className="text-emerald-400 font-bold text-lg">
                  ${request.estimatedPrice}
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm mb-4">
                <div className="flex items-center gap-1 text-gray-400">
                  <MapPin size={14} />
                  {formatDistance(request)}
                </div>
                <div className="flex items-center gap-1 text-gray-400">
                  <Clock size={14} />
                  {formatETA(request)} away
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleDeclineRequest(request.id)}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 flex items-center justify-center gap-2 hover:bg-white/5"
                >
                  <X size={18} />
                  Decline
                </button>
                <button
                  onClick={() => setSelectedRequest(request)}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold flex items-center justify-center gap-2"
                >
                  <Check size={18} />
                  Accept
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Request Detail Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end"
            onClick={() => setSelectedRequest(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full bg-[#0a0a0f] rounded-t-3xl p-6 safe-bottom"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1 bg-gray-700 rounded-full mx-auto mb-6" />

              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-white mb-1">
                  New {selectedRequest.service.name} Request
                </h2>
                <p className="text-gray-500">
                  {selectedRequest.customerName} • {formatDistance(selectedRequest)}
                </p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
                  <div className="flex items-center gap-3">
                    <MapPin size={20} className="text-emerald-400" />
                    <span className="text-gray-300">Pickup Location</span>
                  </div>
                  <span className="text-white font-medium">{formatETA(selectedRequest)}</span>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
                  <div className="flex items-center gap-3">
                    <DollarSign size={20} className="text-emerald-400" />
                    <span className="text-gray-300">Estimated Earnings</span>
                  </div>
                  <span className="text-emerald-400 font-bold">${selectedRequest.estimatedPrice}</span>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
                  <div className="flex items-center gap-3">
                    <Clock size={20} className="text-emerald-400" />
                    <span className="text-gray-300">Est. Service Time</span>
                  </div>
                  <span className="text-white font-medium">{selectedRequest.service.estimatedTime} min</span>
                </div>
              </div>

              {selectedRequest.notes && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-6">
                  <p className="text-amber-400 text-sm">{selectedRequest.notes}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => handleDeclineRequest(selectedRequest.id)}
                  className="flex-1 py-4 rounded-xl border border-white/10 text-gray-400 font-medium"
                >
                  Decline
                </button>
                <button
                  onClick={() => handleAcceptRequest(selectedRequest)}
                  disabled={isLoading}
                  className="flex-1 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>
                      Accept Job
                      <ChevronRight size={20} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
