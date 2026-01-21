import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  MapPin, 
  Navigation,
  Zap,
  Battery,
  ChevronRight,
  Clock,
  ChevronDown
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { Booking } from '../../types'
import { services } from '../../data/mockData'
import { calculateEVChargingEstimate, evMakesModels, batteryTypes } from '../../utils/estimates'
import Modal, { 
  StepIndicator, 
  AnimatedButton, 
  InputField,
  Slider
} from '../ui/Modal'

export default function EVChargingModal() {
  const { 
    activeModal, 
    setActiveModal,
    modalStep,
    nextModalStep,
    prevModalStep,
    resetModalStep,
    evChargingFormData,
    setEVChargingFormData,
    resetEVChargingFormData,
    isCalculating,
    setIsCalculating,
    isSubmitting,
    setIsSubmitting,
    showSuccess,
    setShowSuccess,
    userLocation,
    setActiveBooking,
    addToBookingHistory,
    setCurrentScreen,
  } = useAppStore()

  const [estimate, setEstimate] = useState<ReturnType<typeof calculateEVChargingEstimate> | null>(null)
  const [showMakeDropdown, setShowMakeDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)

  const isOpen = activeModal === 'ev_charging'

  // Auto-fill battery type when make is selected
  useEffect(() => {
    if (evChargingFormData.evMake) {
      const bType = batteryTypes[evChargingFormData.evMake] || batteryTypes.default
      setEVChargingFormData({ batteryType: bType })
    }
  }, [evChargingFormData.evMake])

  const handleClose = () => {
    setActiveModal(null)
    resetModalStep()
    resetEVChargingFormData()
    setEstimate(null)
    setShowSuccess(false)
  }

  const handleUseCurrentLocation = () => {
    setEVChargingFormData({ 
      address: 'Current Location - Downtown District',
      coords: userLocation 
    })
  }

  const handleCalculate = async () => {
    setIsCalculating(true)
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    const est = calculateEVChargingEstimate(evChargingFormData)
    setEstimate(est)
    setIsCalculating(false)
    nextModalStep()
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Create the booking object for EV charging
    const evService = services.find(s => s.id === 'ev_charging') || services[5]
    const booking: Booking = {
      id: crypto.randomUUID(),
      customerId: 'demo_user',
      service: evService,
      status: 'searching',
      location: {
        address: evChargingFormData.address || 'Current Location',
        lat: evChargingFormData.coords?.lat || userLocation.lat,
        lng: evChargingFormData.coords?.lng || userLocation.lng,
      },
      estimatedPrice: estimate?.total || evService.basePrice,
      notes: `${evChargingFormData.evMake} ${evChargingFormData.evModel} - Charge from ${evChargingFormData.currentCharge}% to ${evChargingFormData.desiredCharge}%`,
      createdAt: new Date(),
    }
    
    // Save booking to store
    setActiveBooking(booking)
    addToBookingHistory(booking)
    
    setIsSubmitting(false)
    setShowSuccess(true)
  }

  const evMakes = Object.keys(evMakesModels)
  const availableModels = evChargingFormData.evMake 
    ? evMakesModels[evChargingFormData.evMake] || []
    : []

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="EV Charging">
      <AnimatePresence mode="wait">
        {showSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center py-8"
          >
            {/* Battery Fill Animation */}
            <motion.div
              className="relative w-24 h-40 rounded-xl border-4 border-emerald-400 overflow-hidden"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-3 bg-emerald-400 rounded-t-lg" />
              <motion.div
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-emerald-500 to-emerald-400"
                initial={{ height: '20%' }}
                animate={{ height: '80%' }}
                transition={{ duration: 1.5, delay: 0.3, ease: 'easeOut' }}
              />
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
              >
                <Zap size={40} className="text-white" />
              </motion.div>
            </motion.div>

            <motion.h3
              className="text-xl font-semibold text-white mt-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Charging Service Booked!
            </motion.h3>
            <motion.p
              className="text-white/60 text-sm mt-2 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Mobile charger en route. ETA: {estimate?.chargeTime || 45} minutes
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
                resetEVChargingFormData()
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
            <StepIndicator currentStep={modalStep} totalSteps={3} />
            
            {/* Electric accent animation */}
            <motion.div
              className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(52,211,153,0.1) 0%, transparent 70%)',
              }}
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scale: [1, 1.1, 1],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />

            {/* Step 1: Location */}
            {modalStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-white/60 text-sm">Where is your EV located?</p>

                {/* Animated Charging Icon */}
                <motion.div 
                  className="flex justify-center py-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="relative">
                    <motion.div
                      className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center"
                      animate={{
                        boxShadow: [
                          '0 0 0 0 rgba(52,211,153,0.4)',
                          '0 0 0 20px rgba(52,211,153,0)',
                        ],
                      }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <motion.div
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                      >
                        <Zap size={36} className="text-emerald-400" />
                      </motion.div>
                    </motion.div>
                    {/* Lightning bolts */}
                    {[...Array(3)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute"
                        style={{
                          top: '50%',
                          left: '50%',
                        }}
                        animate={{
                          x: Math.cos((i * 120) * Math.PI / 180) * 50,
                          y: Math.sin((i * 120) * Math.PI / 180) * 50,
                          opacity: [0, 1, 0],
                          scale: [0.5, 1, 0.5],
                        }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          delay: i * 0.3,
                        }}
                      >
                        <Zap size={12} className="text-emerald-400/60" />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                <InputField
                  label="Location"
                  placeholder="Enter your location..."
                  value={evChargingFormData.address}
                  onChange={(v) => setEVChargingFormData({ address: v })}
                  icon={<MapPin size={18} />}
                />

                <motion.button
                  onClick={handleUseCurrentLocation}
                  className={`w-full p-4 rounded-xl flex items-center gap-3 transition-all ${
                    evChargingFormData.address.includes('Current') 
                      ? 'bg-emerald-500/20 border-emerald-500/50' 
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  } border`}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <Navigation size={20} className="text-emerald-300" />
                  </div>
                  <div className="text-left">
                    <p className="text-white/90 text-sm font-medium">Use Current Location</p>
                    <p className="text-white/40 text-xs">Downtown District</p>
                  </div>
                </motion.button>

                <AnimatedButton 
                  onClick={nextModalStep}
                  disabled={!evChargingFormData.address}
                >
                  Continue <ChevronRight size={18} />
                </AnimatedButton>
              </motion.div>
            )}

            {/* Step 2: Vehicle & Battery Info */}
            {modalStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-white/60 text-sm">Tell us about your EV</p>

                {/* EV Make Dropdown */}
                <div className="relative">
                  <label className="block text-white/60 text-xs font-medium mb-2">EV Make</label>
                  <motion.button
                    onClick={() => setShowMakeDropdown(!showMakeDropdown)}
                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between"
                    whileHover={{ scale: 1.01 }}
                  >
                    <span className={evChargingFormData.evMake ? 'text-white/90' : 'text-white/30'}>
                      {evChargingFormData.evMake || 'Select make...'}
                    </span>
                    <ChevronDown size={18} className="text-white/40" />
                  </motion.button>
                  
                  <AnimatePresence>
                    {showMakeDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-10 w-full mt-2 py-2 rounded-xl bg-void-700 border border-white/10 max-h-48 overflow-y-auto"
                      >
                        {evMakes.map((make) => (
                          <button
                            key={make}
                            onClick={() => {
                              setEVChargingFormData({ evMake: make, evModel: '' })
                              setShowMakeDropdown(false)
                            }}
                            className="w-full px-4 py-2 text-left text-white/80 hover:bg-white/10 transition-colors"
                          >
                            {make}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* EV Model Dropdown */}
                <div className="relative">
                  <label className="block text-white/60 text-xs font-medium mb-2">EV Model</label>
                  <motion.button
                    onClick={() => evChargingFormData.evMake && setShowModelDropdown(!showModelDropdown)}
                    className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between ${
                      !evChargingFormData.evMake ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    whileHover={evChargingFormData.evMake ? { scale: 1.01 } : {}}
                  >
                    <span className={evChargingFormData.evModel ? 'text-white/90' : 'text-white/30'}>
                      {evChargingFormData.evModel || 'Select model...'}
                    </span>
                    <ChevronDown size={18} className="text-white/40" />
                  </motion.button>
                  
                  <AnimatePresence>
                    {showModelDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-10 w-full mt-2 py-2 rounded-xl bg-void-700 border border-white/10 max-h-48 overflow-y-auto"
                      >
                        {availableModels.map((model) => (
                          <button
                            key={model}
                            onClick={() => {
                              setEVChargingFormData({ evModel: model })
                              setShowModelDropdown(false)
                            }}
                            className="w-full px-4 py-2 text-left text-white/80 hover:bg-white/10 transition-colors"
                          >
                            {model}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Battery Type (Auto-filled) */}
                {evChargingFormData.batteryType && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                  >
                    <div className="flex items-center gap-2">
                      <Battery size={16} className="text-emerald-400" />
                      <span className="text-white/60 text-xs">Battery Type:</span>
                      <span className="text-emerald-300 text-sm font-medium">
                        {evChargingFormData.batteryType}
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* Current Charge Slider */}
                <Slider
                  label="Current Charge Level"
                  value={evChargingFormData.currentCharge}
                  onChange={(v) => setEVChargingFormData({ currentCharge: v })}
                  min={0}
                  max={100}
                />

                {/* Desired Charge Slider */}
                <Slider
                  label="Desired Charge Level"
                  value={evChargingFormData.desiredCharge}
                  onChange={(v) => setEVChargingFormData({ desiredCharge: v })}
                  min={evChargingFormData.currentCharge + 10}
                  max={100}
                />

                <div className="flex gap-3 pt-2">
                  <AnimatedButton variant="secondary" onClick={prevModalStep} fullWidth={false} className="flex-1">
                    Back
                  </AnimatedButton>
                  <AnimatedButton 
                    onClick={handleCalculate}
                    loading={isCalculating}
                    disabled={!evChargingFormData.evMake || !evChargingFormData.evModel}
                    fullWidth={false}
                    className="flex-[2]"
                  >
                    Get Estimate <ChevronRight size={18} />
                  </AnimatedButton>
                </div>
              </motion.div>
            )}

            {/* Step 3: Estimate */}
            {modalStep === 3 && estimate && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="glass-elevated rounded-2xl p-5">
                  <h3 className="text-white/90 font-semibold mb-4">Charging Estimate</h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60 text-sm">Service Fee</span>
                      <span className="text-white/90 font-medium">${estimate.serviceFee}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/60 text-sm">
                        Energy ({estimate.kWhNeeded} kWh × $0.35)
                      </span>
                      <span className="text-white/90 font-medium">${estimate.energyCost.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-white/10" />
                    <div className="flex justify-between items-center">
                      <span className="text-white font-semibold">Total</span>
                      <span className="text-emerald-400 text-xl font-bold">${estimate.total.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Clock size={16} />
                      <span className="text-sm font-medium">Est. charge time: {estimate.chargeTime} min</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/60">
                      <Battery size={16} />
                      <span className="text-sm">
                        {evChargingFormData.currentCharge}% → {evChargingFormData.desiredCharge}%
                      </span>
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
                    Request Charging
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

