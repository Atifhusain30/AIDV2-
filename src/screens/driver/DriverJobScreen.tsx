/**
 * Driver Active Job Screen
 * Manages the current job - navigation, status updates, and completion
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  MapPin, 
  Navigation, 
  Check, 
  Clock,
  ChevronRight,
  X,
  AlertCircle,
  Loader2,
  Car,
  Flag
} from 'lucide-react'
import { useDriverStore } from '../../store/useDriverStore'
import { locationService } from '../../services/location'
import type { Booking, BookingStatus } from '../../types'
import { formatPrice } from '../../lib/money'

interface DriverJobScreenProps {
  onBack: () => void
}

const STATUS_STEPS: { status: BookingStatus; label: string; icon: React.ElementType }[] = [
  { status: 'accepted', label: 'Accepted', icon: Check },
  { status: 'en_route', label: 'En Route', icon: Navigation },
  { status: 'arrived', label: 'Arrived', icon: MapPin },
  { status: 'in_progress', label: 'In Progress', icon: Car },
  { status: 'completed', label: 'Completed', icon: Flag }
]

export default function DriverJobScreen({ onBack }: DriverJobScreenProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  const { 
    activeBooking, 
    updateJobStatus, 
    currentLocation,
    updateDriverLocationForBooking
  } = useDriverStore()

  // Update driver location periodically for customer tracking
  useEffect(() => {
    if (!activeBooking || !currentLocation) return

    const interval = setInterval(() => {
      updateDriverLocationForBooking()
    }, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [activeBooking, currentLocation, updateDriverLocationForBooking])

  if (!activeBooking) {
    return (
      <div className="driver-job min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <AlertCircle size={48} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No active job</p>
          <button
            onClick={onBack}
            className="mt-4 text-emerald-400 font-medium"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.status === activeBooking.status)

  const getNextStatus = (): BookingStatus | null => {
    const nextIndex = currentStepIndex + 1
    if (nextIndex < STATUS_STEPS.length) {
      return STATUS_STEPS[nextIndex].status
    }
    return null
  }

  const getNextActionLabel = (): string => {
    switch (activeBooking.status) {
      case 'accepted':
        return 'Start Navigation'
      case 'en_route':
        return 'Mark as Arrived'
      case 'arrived':
        return 'Start Service'
      case 'in_progress':
        return 'Complete Job'
      default:
        return 'Next'
    }
  }

  const handleNextStep = async () => {
    const nextStatus = getNextStatus()
    if (!nextStatus) return

    setIsUpdating(true)
    const success = await updateJobStatus(nextStatus)
    setIsUpdating(false)

    if (success && nextStatus === 'completed') {
      // Job completed, return to dashboard
      onBack()
    }
  }

  const handleCancel = async () => {
    setIsUpdating(true)
    const success = await updateJobStatus('cancelled')
    setIsUpdating(false)

    if (success) {
      onBack()
    }
  }

  const formatDistance = (): string => {
    if (!currentLocation) return '--'
    const distance = locationService.calculateDistance(currentLocation, {
      lat: activeBooking.location.lat,
      lng: activeBooking.location.lng
    })
    return `${distance} mi`
  }

  const formatETA = (): string => {
    if (!currentLocation) return '--'
    const distance = locationService.calculateDistance(currentLocation, {
      lat: activeBooking.location.lat,
      lng: activeBooking.location.lng
    })
    return `${locationService.estimateETA(distance)} min`
  }

  const openMapsNavigation = () => {
    const { lat, lng, address } = activeBooking.location
    // Try to open native maps
    const url = `https://maps.google.com/?daddr=${lat},${lng}`
    window.open(url, '_blank')
  }

  return (
    <div className="driver-job min-h-screen pb-8 safe-top">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <button onClick={onBack} className="text-gray-400">
          <X size={24} />
        </button>
        <h1 className="text-lg font-bold text-white">Active Job</h1>
        <span className="w-10" aria-hidden="true" />
      </div>

      {/* Job Card */}
      <div className="mx-6 p-6 rounded-2xl bg-white/5 border border-white/10 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">{activeBooking.service.name}</h2>
            <p className="text-gray-500">{activeBooking.vehicle?.label || '—'}</p>
          </div>
          <span className="text-emerald-400 font-bold text-2xl">
            {formatPrice(activeBooking.estimatedPrice)}
          </span>
        </div>

        {/* Customer Info */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 mb-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold">
            C
          </div>
          <div className="flex-1">
            <p className="text-white font-medium">Customer</p>
            <p className="text-gray-500 text-sm">{activeBooking.location.address}</p>
          </div>

        </div>

        {/* Distance & ETA */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-black/30 text-center">
            <p className="text-gray-500 text-xs mb-1">Distance</p>
            <p className="text-white font-bold">{formatDistance()}</p>
          </div>
          <div className="p-3 rounded-xl bg-black/30 text-center">
            <p className="text-gray-500 text-xs mb-1">ETA</p>
            <p className="text-white font-bold">{formatETA()}</p>
          </div>
        </div>
      </div>

      {/* Status Progress */}
      <div className="mx-6 mb-6">
        <h3 className="text-gray-400 text-sm font-medium mb-4">Job Progress</h3>
        <div className="space-y-3">
          {STATUS_STEPS.map((step, index) => {
            const isComplete = index < currentStepIndex
            const isCurrent = index === currentStepIndex
            const Icon = step.icon

            return (
              <motion.div
                key={step.status}
                className={`flex items-center gap-4 p-4 rounded-xl border ${
                  isCurrent 
                    ? 'bg-[#dfff54]/10 border-[#dfff54]/30'
                    : isComplete
                      ? 'bg-white/5 border-white/10'
                      : 'bg-white/[0.02] border-white/5'
                }`}
                initial={false}
                animate={{
                  scale: isCurrent ? 1.02 : 1,
                  opacity: isComplete || isCurrent ? 1 : 0.5
                }}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isComplete 
                    ? 'bg-[#dfff54] text-[#101508]'
                    : isCurrent
                      ? 'bg-[#dfff54]/20 text-emerald-400'
                      : 'bg-white/5 text-gray-600'
                }`}>
                  {isComplete ? (
                    <Check size={20} />
                  ) : (
                    <Icon size={20} />
                  )}
                </div>
                <span className={`font-medium ${
                  isCurrent ? 'text-emerald-400' : isComplete ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  {step.label}
                </span>
                {isCurrent && (
                  <span className="ml-auto text-xs text-emerald-400 animate-pulse">Current</span>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Map Navigation Button */}
      {(activeBooking.status === 'accepted' || activeBooking.status === 'en_route') && (
        <div className="mx-6 mb-4">
          <button
            onClick={openMapsNavigation}
            className="w-full py-4 rounded-xl border border-[#dfff54]/30 bg-[#dfff54]/10 text-emerald-400 font-semibold flex items-center justify-center gap-2"
          >
            <Navigation size={20} />
            Open in Maps
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mx-6 space-y-3">
        {activeBooking.status !== 'completed' && (
          <>
            <motion.button
              onClick={handleNextStep}
              disabled={isUpdating}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold flex items-center justify-center gap-2"
              whileTap={{ scale: 0.98 }}
            >
              {isUpdating ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  {getNextActionLabel()}
                  <ChevronRight size={20} />
                </>
              )}
            </motion.button>

            <button
              onClick={() => setShowCancelConfirm(true)}
              className="w-full py-4 rounded-xl border border-red-500/30 text-red-400 font-medium"
            >
              Cancel Job
            </button>
          </>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      <AnimatePresence>
        {showCancelConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center px-6"
            onClick={() => setShowCancelConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-sm bg-[#1a1a22] rounded-2xl p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle size={32} className="text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Cancel Job?</h3>
                <p className="text-gray-400 text-sm">
                  This will notify the customer and may affect your rating.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleCancel}
                  disabled={isUpdating}
                  className="w-full py-4 rounded-xl bg-red-500 text-white font-semibold flex items-center justify-center"
                >
                  {isUpdating ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    'Yes, Cancel Job'
                  )}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="w-full py-4 rounded-xl border border-white/10 text-gray-300"
                >
                  Keep Job
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
