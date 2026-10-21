import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  MapPin, 
  Navigation,
  Car,
  Truck,
  Bike,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  Clock,
  Route
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { services } from '../../data/mockData'
import * as bookingService from '../../services/bookingService'
import { calculateTowingEstimate } from '../../utils/estimates'
import Modal, { 
  StepIndicator, 
  AnimatedButton, 
  InputField,
  TextareaField,
  SuccessCheckmark
} from '../ui/Modal'

const vehicleTypes = [
  { id: 'sedan', label: 'Sedan', icon: Car },
  { id: 'suv', label: 'SUV', icon: Car },
  { id: 'truck', label: 'Truck', icon: Truck },
  { id: 'van', label: 'Van', icon: Truck },
  { id: 'motorcycle', label: 'Motorcycle', icon: Bike },
]

export default function TowingModal() {
  const { 
    activeModal, 
    setActiveModal,
    modalStep,
    nextModalStep,
    prevModalStep,
    resetModalStep,
    towingFormData,
    setTowingFormData,
    resetTowingFormData,
    isCalculating,
    setIsCalculating,
    isSubmitting,
    setIsSubmitting,
    showSuccess,
    setShowSuccess,
    userLocation,
    setCurrentScreen,
  } = useAppStore()

  const [estimate, setEstimate] = useState<ReturnType<typeof calculateTowingEstimate> | null>(null)
  const [usingCurrentLocation, setUsingCurrentLocation] = useState(false)

  const isOpen = activeModal === 'towing'

  const handleClose = () => {
    setActiveModal(null)
    resetModalStep()
    resetTowingFormData()
    setEstimate(null)
    setShowSuccess(false)
    setUsingCurrentLocation(false)
  }

  const handleUseCurrentLocation = () => {
    setUsingCurrentLocation(true)
    setTowingFormData({ 
      pickupAddress: 'Current Location - Downtown District',
      pickupCoords: userLocation 
    })
  }

  const handleCalculate = async () => {
    setIsCalculating(true)
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // Mock distance calculation
    const mockDistance = Math.floor(Math.random() * 20) + 5
    setTowingFormData({ distance: mockDistance })
    
    const est = calculateTowingEstimate({
      ...towingFormData,
      distance: mockDistance
    })
    setEstimate(est)
    setIsCalculating(false)
    nextModalStep()
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const towingService = services.find(s => s.id === 'towing') || services[4]
      await bookingService.requestAndStartBooking({
        service: towingService,
        notes: towingFormData.specialRequirements || undefined,
        locationLabel: towingFormData.pickupAddress || 'Current Location',
        locationCoords: {
          lat: towingFormData.pickupCoords?.lat ?? userLocation.lat,
          lng: towingFormData.pickupCoords?.lng ?? userLocation.lng,
        },
        dropoffLocation: towingFormData.dropoffAddress ? {
          address: towingFormData.dropoffAddress,
          lat: towingFormData.dropoffCoords?.lat ?? userLocation.lat,
          lng: towingFormData.dropoffCoords?.lng ?? userLocation.lng,
        } : undefined,
      })
      setShowSuccess(true)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to request towing.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Towing Service">
      <AnimatePresence mode="wait">
        {showSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center py-8"
          >
            <SuccessCheckmark />
            <motion.h3
              className="text-xl font-semibold text-white mt-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Tow Truck Dispatched!
            </motion.h3>
            <motion.p
              className="text-white/60 text-sm mt-2 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Your tow truck is on the way. ETA: {estimate?.eta || 25} minutes
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-6 w-full"
            >
              <AnimatedButton onClick={() => {
                setActiveModal(null)
                resetModalStep()
                resetTowingFormData()
                setEstimate(null)
                setShowSuccess(false)
                setCurrentScreen('chat')
              }}>
                Track Service
              </AnimatedButton>
            </motion.div>
          </motion.div>
        ) : (
          <>
            <StepIndicator currentStep={modalStep} totalSteps={4} />
            
            {/* Step 1: Pickup Location */}
            {modalStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-white/60 text-sm">Where should we pick up your vehicle?</p>
                
                {/* Map Preview */}
                <motion.div 
                  className="relative h-40 rounded-2xl overflow-hidden bg-void-600"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-void-600/50 to-void-800">
                    <svg className="absolute inset-0 w-full h-full opacity-30">
                      <line x1="0" y1="40" x2="100%" y2="45" stroke="rgba(139,92,246,0.5)" strokeWidth="1" />
                      <line x1="0" y1="80" x2="100%" y2="75" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" />
                      <line x1="0" y1="120" x2="100%" y2="125" stroke="rgba(139,92,246,0.5)" strokeWidth="1" />
                      <line x1="80" y1="0" x2="75" y2="100%" stroke="rgba(139,92,246,0.5)" strokeWidth="1" />
                      <line x1="160" y1="0" x2="165" y2="100%" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" />
                      <line x1="240" y1="0" x2="235" y2="100%" stroke="rgba(139,92,246,0.5)" strokeWidth="1" />
                    </svg>
                  </div>
                  
                  {/* Animated Pin */}
                  {(towingFormData.pickupAddress || usingCurrentLocation) && (
                    <motion.div
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
                      initial={{ y: -50, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ type: 'spring', damping: 10 }}
                    >
                      <MapPin size={32} className="text-iris-400 fill-iris-400/30" />
                      <motion.div
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-iris-400/30 rounded-full"
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.2, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    </motion.div>
                  )}
                </motion.div>

                <InputField
                  label="Pickup Address"
                  placeholder="Enter pickup location..."
                  value={towingFormData.pickupAddress}
                  onChange={(v) => setTowingFormData({ pickupAddress: v })}
                  icon={<MapPin size={18} />}
                />

                <motion.button
                  onClick={handleUseCurrentLocation}
                  className={`w-full p-4 rounded-xl flex items-center gap-3 transition-all ${
                    usingCurrentLocation 
                      ? 'bg-iris-500/20 border-iris-500/50' 
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  } border`}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <motion.div
                    className="w-10 h-10 rounded-xl bg-iris-500/20 flex items-center justify-center"
                    animate={usingCurrentLocation ? {
                      boxShadow: ['0 0 0 0 rgba(139,92,246,0)', '0 0 0 8px rgba(139,92,246,0)'],
                    } : {}}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Navigation size={20} className="text-iris-300" />
                  </motion.div>
                  <div className="text-left">
                    <p className="text-white/90 text-sm font-medium">Use Current Location</p>
                    <p className="text-white/40 text-xs">Downtown District</p>
                  </div>
                </motion.button>

                <AnimatedButton 
                  onClick={nextModalStep}
                  disabled={!towingFormData.pickupAddress}
                >
                  Continue <ChevronRight size={18} />
                </AnimatedButton>
              </motion.div>
            )}

            {/* Step 2: Drop-off Location */}
            {modalStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-white/60 text-sm">Where should we drop off your vehicle?</p>

                {/* Route Preview */}
                <motion.div 
                  className="relative h-32 rounded-2xl overflow-hidden bg-void-600"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="absolute inset-0 flex items-center justify-center gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 bg-iris-400 rounded-full" />
                      <p className="text-white/40 text-[10px] mt-1">Pickup</p>
                    </div>
                    <motion.div 
                      className="flex-1 h-0.5 bg-gradient-to-r from-iris-400 to-emerald-400"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.5 }}
                    >
                      <Route className="text-white/30 mx-auto" />
                    </motion.div>
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 bg-emerald-400 rounded-full" />
                      <p className="text-white/40 text-[10px] mt-1">Drop-off</p>
                    </div>
                  </div>
                </motion.div>

                <InputField
                  label="Drop-off Address"
                  placeholder="Enter destination..."
                  value={towingFormData.dropoffAddress}
                  onChange={(v) => setTowingFormData({ dropoffAddress: v })}
                  icon={<MapPin size={18} />}
                />

                <div className="flex gap-3">
                  <AnimatedButton variant="secondary" onClick={prevModalStep} fullWidth={false} className="flex-1">
                    Back
                  </AnimatedButton>
                  <AnimatedButton 
                    onClick={nextModalStep}
                    disabled={!towingFormData.dropoffAddress}
                    fullWidth={false}
                    className="flex-[2]"
                  >
                    Continue <ChevronRight size={18} />
                  </AnimatedButton>
                </div>
              </motion.div>
            )}

            {/* Step 3: Vehicle Details */}
            {modalStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-white/60 text-sm">Tell us about your vehicle</p>

                <div>
                  <label className="block text-white/60 text-xs font-medium mb-2">
                    Vehicle Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {vehicleTypes.slice(0, 3).map((type) => {
                      const Icon = type.icon
                      const selected = towingFormData.vehicleType === type.id
                      return (
                        <motion.button
                          key={type.id}
                          onClick={() => setTowingFormData({ 
                            vehicleType: type.id as typeof towingFormData.vehicleType 
                          })}
                          className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${
                            selected 
                              ? 'bg-iris-500/30 border-iris-500/50' 
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          } border`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Icon size={20} className={selected ? 'text-iris-300' : 'text-white/50'} />
                          <span className={`text-xs ${selected ? 'text-white' : 'text-white/60'}`}>
                            {type.label}
                          </span>
                        </motion.button>
                      )
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {vehicleTypes.slice(3).map((type) => {
                      const Icon = type.icon
                      const selected = towingFormData.vehicleType === type.id
                      return (
                        <motion.button
                          key={type.id}
                          onClick={() => setTowingFormData({ 
                            vehicleType: type.id as typeof towingFormData.vehicleType 
                          })}
                          className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${
                            selected 
                              ? 'bg-iris-500/30 border-iris-500/50' 
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          } border`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Icon size={20} className={selected ? 'text-iris-300' : 'text-white/50'} />
                          <span className={`text-xs ${selected ? 'text-white' : 'text-white/60'}`}>
                            {type.label}
                          </span>
                        </motion.button>
                      )
                    })}
                  </div>
                </div>

                <motion.button
                  onClick={() => setTowingFormData({ isDrivable: !towingFormData.isDrivable })}
                  className="w-full p-4 rounded-xl flex items-center justify-between bg-white/5 border border-white/10"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div>
                    <p className="text-white/90 text-sm font-medium">Vehicle is drivable</p>
                    <p className="text-white/40 text-xs">Can be loaded onto flatbed</p>
                  </div>
                  {towingFormData.isDrivable ? (
                    <ToggleRight size={32} className="text-iris-400" />
                  ) : (
                    <ToggleLeft size={32} className="text-white/30" />
                  )}
                </motion.button>

                <TextareaField
                  label="Special Requirements (Optional)"
                  placeholder="e.g., Keys locked inside, flat tire on driver side..."
                  value={towingFormData.specialRequirements}
                  onChange={(v) => setTowingFormData({ specialRequirements: v })}
                  rows={2}
                />

                <div className="flex gap-3">
                  <AnimatedButton variant="secondary" onClick={prevModalStep} fullWidth={false} className="flex-1">
                    Back
                  </AnimatedButton>
                  <AnimatedButton 
                    onClick={handleCalculate}
                    loading={isCalculating}
                    disabled={!towingFormData.vehicleType}
                    fullWidth={false}
                    className="flex-[2]"
                  >
                    Get Estimate <ChevronRight size={18} />
                  </AnimatedButton>
                </div>
              </motion.div>
            )}

            {/* Step 4: Estimate */}
            {modalStep === 4 && estimate && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="glass-elevated rounded-2xl p-5">
                  <h3 className="text-white/90 font-semibold mb-4">Towing Estimate</h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60 text-sm">Base Fee</span>
                      <span className="text-white/90 font-medium">${estimate.baseFee}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/60 text-sm">
                        Distance ({estimate.mileage} mi × $4/mi)
                      </span>
                      <span className="text-white/90 font-medium">${estimate.perMileFee}</span>
                    </div>
                    {!towingFormData.isDrivable && (
                      <div className="flex justify-between items-center">
                        <span className="text-white/60 text-sm">Non-drivable fee</span>
                        <span className="text-white/90 font-medium">$25</span>
                      </div>
                    )}
                    <div className="h-px bg-white/10" />
                    <div className="flex justify-between items-center">
                      <span className="text-white font-semibold">Total</span>
                      <span className="text-iris-300 text-xl font-bold">${estimate.total}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Clock size={16} />
                      <span className="text-sm font-medium">ETA: {estimate.eta} minutes</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <AnimatedButton variant="secondary" onClick={prevModalStep} fullWidth={false} className="flex-1">
                    Back
                  </AnimatedButton>
                  <AnimatedButton 
                    onClick={handleSubmit}
                    loading={isSubmitting}
                    fullWidth={false}
                    className="flex-[2]"
                  >
                    Request Tow
                  </AnimatedButton>
                </div>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </Modal>
  )
}




