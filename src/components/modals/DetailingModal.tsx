import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Sparkles,
  Car,
  Truck,
  Check,
  ChevronRight,
  Clock,
  MapPin,
  Calendar
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { calculateDetailingEstimate, detailingPackages, detailingAddOns } from '../../utils/estimates'
import Modal, { 
  StepIndicator, 
  AnimatedButton,
  SuccessCheckmark
} from '../ui/Modal'

const vehicleSizes = [
  { id: 'compact', label: 'Compact', icon: Car, desc: 'Small cars' },
  { id: 'sedan', label: 'Sedan', icon: Car, desc: 'Standard size' },
  { id: 'suv', label: 'SUV', icon: Car, desc: 'Larger vehicles' },
  { id: 'truck', label: 'Truck', icon: Truck, desc: 'Full-size trucks' },
]

const timeSlots = [
  '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'
]

export default function DetailingModal() {
  const { 
    activeModal, 
    setActiveModal,
    modalStep,
    nextModalStep,
    prevModalStep,
    resetModalStep,
    detailingFormData,
    setDetailingFormData,
    resetDetailingFormData,
    isSubmitting,
    setIsSubmitting,
    showSuccess,
    setShowSuccess,
  } = useAppStore()

  const [estimate, setEstimate] = useState<ReturnType<typeof calculateDetailingEstimate> | null>(null)

  const isOpen = activeModal === 'detailing'

  const handleClose = () => {
    setActiveModal(null)
    resetModalStep()
    resetDetailingFormData()
    setEstimate(null)
    setShowSuccess(false)
  }

  const handlePackageSelect = (pkg: keyof typeof detailingPackages) => {
    setDetailingFormData({ package: pkg })
  }

  const toggleAddOn = (addOnId: string) => {
    const current = detailingFormData.addOns
    if (current.includes(addOnId)) {
      setDetailingFormData({ addOns: current.filter(id => id !== addOnId) })
    } else {
      setDetailingFormData({ addOns: [...current, addOnId] })
    }
  }

  const handleContinueToEstimate = () => {
    const est = calculateDetailingEstimate(detailingFormData)
    setEstimate(est)
    nextModalStep()
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsSubmitting(false)
    setShowSuccess(true)
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Detailing Service">
      {/* Water droplet background animations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              left: `${10 + (i % 4) * 25}%`,
              bottom: '-10%',
            }}
            animate={{
              y: [0, -400],
              opacity: [0, 0.3, 0.2, 0],
              scale: [0.5, 1, 0.8, 0.4],
            }}
            transition={{
              duration: 4 + (i * 0.5),
              repeat: Infinity,
              delay: i * 0.8,
              ease: 'easeOut',
            }}
          >
            <div 
              className="w-3 h-3 rounded-full"
              style={{
                background: 'radial-gradient(circle at 30% 30%, rgba(147, 197, 253, 0.6), rgba(139, 92, 246, 0.3))',
              }}
            />
          </motion.div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {showSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center py-8 relative z-10"
          >
            {/* Sparkle Animation */}
            <motion.div className="relative">
              <SuccessCheckmark />
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute"
                  style={{
                    top: '50%',
                    left: '50%',
                  }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    x: Math.cos((i * 45) * Math.PI / 180) * 60,
                    y: Math.sin((i * 45) * Math.PI / 180) * 60,
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0],
                    rotate: [0, 180],
                  }}
                  transition={{
                    duration: 0.8,
                    delay: 0.5 + i * 0.05,
                  }}
                >
                  <Sparkles size={16} className="text-iris-400" />
                </motion.div>
              ))}
            </motion.div>

            <motion.h3
              className="text-xl font-semibold text-white mt-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Detailing Booked!
            </motion.h3>
            <motion.p
              className="text-white/60 text-sm mt-2 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {detailingFormData.scheduledDate} at {detailingFormData.scheduledTime}
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
          <div className="relative z-10">
            <StepIndicator currentStep={modalStep} totalSteps={4} />
            
            {/* Step 1: Select Package */}
            {modalStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <p className="text-white/60 text-sm mb-4">Choose your detailing package</p>
                
                {Object.entries(detailingPackages).map(([key, pkg], i) => {
                  const selected = detailingFormData.package === key
                  return (
                    <motion.button
                      key={key}
                      onClick={() => handlePackageSelect(key as keyof typeof detailingPackages)}
                      className={`w-full p-4 rounded-2xl text-left transition-all ${
                        selected 
                          ? 'bg-iris-500/20 border-iris-500/50 shadow-[0_0_20px_rgba(139,92,246,0.2)]' 
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      } border`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ scale: 1.01, y: -2 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="text-white/90 font-semibold">{pkg.name}</h4>
                          <p className="text-iris-300 text-lg font-bold">${pkg.price}</p>
                        </div>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          selected ? 'bg-iris-500' : 'bg-white/10'
                        }`}>
                          {selected && <Check size={14} className="text-white" />}
                        </div>
                      </div>
                      <AnimatePresence>
                        {selected && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-3 border-t border-white/10 mt-2">
                              <ul className="space-y-1">
                                {pkg.features.map((feature, fi) => (
                                  <motion.li
                                    key={fi}
                                    className="text-white/50 text-xs flex items-center gap-2"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: fi * 0.05 }}
                                  >
                                    <Check size={12} className="text-iris-400" />
                                    {feature}
                                  </motion.li>
                                ))}
                              </ul>
                              <p className="text-white/40 text-xs mt-2 flex items-center gap-1">
                                <Clock size={12} />
                                ~{pkg.duration} min
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  )
                })}

                <AnimatedButton 
                  onClick={nextModalStep}
                  disabled={!detailingFormData.package}
                  className="mt-4"
                >
                  Continue <ChevronRight size={18} />
                </AnimatedButton>
              </motion.div>
            )}

            {/* Step 2: Vehicle Info & Add-ons */}
            {modalStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-white/60 text-sm">Vehicle size & add-ons</p>

                <div>
                  <label className="block text-white/60 text-xs font-medium mb-2">Vehicle Size</label>
                  <div className="grid grid-cols-2 gap-2">
                    {vehicleSizes.map((size) => {
                      const Icon = size.icon
                      const selected = detailingFormData.vehicleSize === size.id
                      return (
                        <motion.button
                          key={size.id}
                          onClick={() => setDetailingFormData({ 
                            vehicleSize: size.id as typeof detailingFormData.vehicleSize 
                          })}
                          className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${
                            selected 
                              ? 'bg-iris-500/30 border-iris-500/50' 
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          } border`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Icon size={24} className={selected ? 'text-iris-300' : 'text-white/50'} />
                          <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-white/70'}`}>
                            {size.label}
                          </span>
                          <span className="text-[10px] text-white/40">{size.desc}</span>
                        </motion.button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-white/60 text-xs font-medium mb-2">Add-ons (Optional)</label>
                  <div className="space-y-2">
                    {Object.entries(detailingAddOns).map(([id, addon]) => {
                      const selected = detailingFormData.addOns.includes(id)
                      return (
                        <motion.button
                          key={id}
                          onClick={() => toggleAddOn(id)}
                          className={`w-full p-3 rounded-xl flex items-center justify-between transition-all ${
                            selected 
                              ? 'bg-iris-500/20 border-iris-500/50' 
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          } border`}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                        >
                          <span className={selected ? 'text-white/90' : 'text-white/60'}>
                            {addon.name}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-iris-300 font-medium">+${addon.price}</span>
                            <div className={`w-5 h-5 rounded flex items-center justify-center ${
                              selected ? 'bg-iris-500' : 'bg-white/10'
                            }`}>
                              {selected && <Check size={12} className="text-white" />}
                            </div>
                          </div>
                        </motion.button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <AnimatedButton variant="secondary" onClick={prevModalStep} fullWidth={false} className="flex-1">
                    Back
                  </AnimatedButton>
                  <AnimatedButton 
                    onClick={nextModalStep}
                    disabled={!detailingFormData.vehicleSize}
                    fullWidth={false}
                    className="flex-[2]"
                  >
                    Continue <ChevronRight size={18} />
                  </AnimatedButton>
                </div>
              </motion.div>
            )}

            {/* Step 3: Schedule */}
            {modalStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-white/60 text-sm">Schedule your appointment</p>

                <div>
                  <label className="block text-white/60 text-xs font-medium mb-2">
                    <Calendar size={14} className="inline mr-1" />
                    Select Date
                  </label>
                  <input
                    type="date"
                    value={detailingFormData.scheduledDate}
                    onChange={(e) => setDetailingFormData({ scheduledDate: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white/90 focus:outline-none focus:border-iris-500/50"
                  />
                </div>

                <div>
                  <label className="block text-white/60 text-xs font-medium mb-2">
                    <Clock size={14} className="inline mr-1" />
                    Select Time
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {timeSlots.map((time) => {
                      const selected = detailingFormData.scheduledTime === time
                      return (
                        <motion.button
                          key={time}
                          onClick={() => setDetailingFormData({ scheduledTime: time })}
                          className={`p-2 rounded-lg text-xs font-medium transition-all ${
                            selected 
                              ? 'bg-iris-500 text-white' 
                              : 'bg-white/5 text-white/60 hover:bg-white/10'
                          }`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {time}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-white/60 text-xs font-medium mb-2">
                    <MapPin size={14} className="inline mr-1" />
                    Service Location
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'mobile', label: 'Mobile Service', desc: 'We come to you' },
                      { id: 'dropoff', label: 'Drop-off', desc: 'At our location' },
                    ].map((loc) => {
                      const selected = detailingFormData.location === loc.id
                      return (
                        <motion.button
                          key={loc.id}
                          onClick={() => setDetailingFormData({ 
                            location: loc.id as typeof detailingFormData.location 
                          })}
                          className={`p-3 rounded-xl text-left transition-all ${
                            selected 
                              ? 'bg-iris-500/20 border-iris-500/50' 
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          } border`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <p className={`text-sm font-medium ${selected ? 'text-white' : 'text-white/70'}`}>
                            {loc.label}
                          </p>
                          <p className="text-[10px] text-white/40">{loc.desc}</p>
                        </motion.button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <AnimatedButton variant="secondary" onClick={prevModalStep} fullWidth={false} className="flex-1">
                    Back
                  </AnimatedButton>
                  <AnimatedButton 
                    onClick={handleContinueToEstimate}
                    disabled={!detailingFormData.scheduledDate || !detailingFormData.scheduledTime}
                    fullWidth={false}
                    className="flex-[2]"
                  >
                    Review Estimate <ChevronRight size={18} />
                  </AnimatedButton>
                </div>
              </motion.div>
            )}

            {/* Step 4: Estimate & Confirm */}
            {modalStep === 4 && estimate && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="glass-elevated rounded-2xl p-5">
                  <h3 className="text-white/90 font-semibold mb-4">Booking Summary</h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60 text-sm">{estimate.packageName}</span>
                      <span className="text-white/90 font-medium">${estimate.packagePrice}</span>
                    </div>
                    
                    {estimate.addOnsList.length > 0 && (
                      <>
                        <div className="text-white/40 text-xs font-medium pt-2">Add-ons</div>
                        {estimate.addOnsList.map((addon, i) => (
                          <div key={i} className="flex justify-between items-center text-sm">
                            <span className="text-white/50">{addon.name}</span>
                            <span className="text-white/70">${addon.price}</span>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {estimate.sizeMultiplier > 1 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-white/50">Size adjustment</span>
                        <span className="text-white/70">×{estimate.sizeMultiplier}</span>
                      </div>
                    )}
                    
                    <div className="h-px bg-white/10" />
                    <div className="flex justify-between items-center">
                      <span className="text-white font-semibold">Total</span>
                      <span className="text-iris-300 text-xl font-bold">${estimate.total}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                    <div className="flex items-center gap-2 text-white/60">
                      <Calendar size={14} />
                      <span className="text-sm">{detailingFormData.scheduledDate}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/60">
                      <Clock size={14} />
                      <span className="text-sm">{detailingFormData.scheduledTime} (~{estimate.duration} min)</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/60">
                      <MapPin size={14} />
                      <span className="text-sm capitalize">{detailingFormData.location} service</span>
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
                    Book Detailing
                  </AnimatedButton>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>
    </Modal>
  )
}

