import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Droplets, 
  Battery, 
  CircleDot, 
  Key, 
  Fuel,
  Car,
  Truck,
  Bike,
  Camera,
  ChevronRight,
  Clock
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { ServiceType } from '../../types'
import { services } from '../../data/mockData'
import { calculateServiceEstimate, serviceEstimates } from '../../utils/estimates'
import Modal, { 
  StepIndicator, 
  AnimatedButton,
  TextareaField,
  SuccessCheckmark
} from '../ui/Modal'

const serviceIcons: Record<ServiceType, React.ElementType> = {
  oil_change: Droplets,
  battery_jump: Battery,
  flat_tire: CircleDot,
  lockout: Key,
  towing: Truck,
  ev_charging: Battery,
  fuel_delivery: Fuel,
}

const vehicleTypes = [
  { id: 'sedan', label: 'Sedan', icon: Car },
  { id: 'suv', label: 'SUV', icon: Car },
  { id: 'truck', label: 'Truck', icon: Truck },
  { id: 'van', label: 'Van', icon: Truck },
  { id: 'motorcycle', label: 'Motorcycle', icon: Bike },
]

export default function ServicesModal() {
  const { 
    activeModal, 
    setActiveModal,
    modalStep,
    nextModalStep,
    prevModalStep,
    resetModalStep,
    serviceFormData,
    setServiceFormData,
    resetServiceFormData,
    isCalculating,
    setIsCalculating,
    isSubmitting,
    setIsSubmitting,
    showSuccess,
    setShowSuccess,
  } = useAppStore()

  const [estimate, setEstimate] = useState<ReturnType<typeof calculateServiceEstimate> | null>(null)

  const isOpen = activeModal === 'services'

  const handleClose = () => {
    setActiveModal(null)
    resetModalStep()
    resetServiceFormData()
    setEstimate(null)
    setShowSuccess(false)
  }

  const handleServiceSelect = (serviceId: ServiceType) => {
    setServiceFormData({ selectedService: serviceId })
    nextModalStep()
  }

  const handleCalculate = async () => {
    setIsCalculating(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    if (serviceFormData.selectedService) {
      const est = calculateServiceEstimate(
        serviceFormData.selectedService,
        serviceFormData.vehicleType
      )
      setEstimate(est)
    }
    setIsCalculating(false)
    nextModalStep()
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    // Simulate booking
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsSubmitting(false)
    setShowSuccess(true)
  }

  const filteredServices = services.filter(s => 
    s.id !== 'towing' && s.id !== 'ev_charging'
  )

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Emergency Services">
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
              Service Requested!
            </motion.h3>
            <motion.p
              className="text-white/60 text-sm mt-2 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              A technician is on their way. ETA: {estimate?.eta || 20} minutes
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-6 w-full"
            >
              <AnimatedButton onClick={handleClose}>
                Done
              </AnimatedButton>
            </motion.div>
          </motion.div>
        ) : (
          <>
            <StepIndicator currentStep={modalStep} totalSteps={3} />
            
            {/* Step 1: Select Service */}
            {modalStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <p className="text-white/60 text-sm mb-4">What do you need help with?</p>
                <div className="grid grid-cols-2 gap-3">
                  {filteredServices.map((service, i) => {
                    const Icon = serviceIcons[service.id]
                    const est = serviceEstimates[service.id]
                    return (
                      <motion.button
                        key={service.id}
                        onClick={() => handleServiceSelect(service.id)}
                        className="glass-button p-4 rounded-2xl text-left"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="w-10 h-10 rounded-xl bg-iris-500/20 flex items-center justify-center mb-3">
                          <Icon size={20} strokeWidth={1.5} className="text-iris-300" />
                        </div>
                        <p className="text-white/90 text-sm font-medium">{service.name}</p>
                        <p className="text-white/40 text-xs mt-1">${est.basePrice}+</p>
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* Step 2: Details */}
            {modalStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-white/60 text-sm mb-4">Tell us more about your situation</p>
                
                <TextareaField
                  label="Describe the problem"
                  placeholder="e.g., Car won't start, battery is completely dead..."
                  value={serviceFormData.problemDescription}
                  onChange={(v) => setServiceFormData({ problemDescription: v })}
                  rows={3}
                />

                <div>
                  <label className="block text-white/60 text-xs font-medium mb-2">
                    Vehicle Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {vehicleTypes.slice(0, 3).map((type) => {
                      const Icon = type.icon
                      const selected = serviceFormData.vehicleType === type.id
                      return (
                        <motion.button
                          key={type.id}
                          onClick={() => setServiceFormData({ 
                            vehicleType: type.id as typeof serviceFormData.vehicleType 
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
                      const selected = serviceFormData.vehicleType === type.id
                      return (
                        <motion.button
                          key={type.id}
                          onClick={() => setServiceFormData({ 
                            vehicleType: type.id as typeof serviceFormData.vehicleType 
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

                <motion.div 
                  className="glass p-4 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-white/5"
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <Camera size={20} className="text-white/50" />
                  </div>
                  <div>
                    <p className="text-white/80 text-sm font-medium">Add Photo (Optional)</p>
                    <p className="text-white/40 text-xs">Help us understand the issue better</p>
                  </div>
                </motion.div>

                <div className="flex gap-3 pt-4">
                  <AnimatedButton variant="secondary" onClick={prevModalStep} fullWidth={false} className="flex-1">
                    Back
                  </AnimatedButton>
                  <AnimatedButton 
                    onClick={handleCalculate}
                    loading={isCalculating}
                    disabled={!serviceFormData.vehicleType}
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
                  <h3 className="text-white/90 font-semibold mb-4">Estimate Breakdown</h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60 text-sm">Service Fee</span>
                      <span className="text-white/90 font-medium">${estimate.serviceFee}</span>
                    </div>
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

                <div className="flex gap-3 pt-2">
                  <AnimatedButton variant="secondary" onClick={prevModalStep} fullWidth={false} className="flex-1">
                    Back
                  </AnimatedButton>
                  <AnimatedButton 
                    onClick={handleSubmit}
                    loading={isSubmitting}
                    fullWidth={false}
                    className="flex-[2]"
                  >
                    Request Service
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

