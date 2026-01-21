import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Sun,
  Shield,
  Check,
  ChevronRight,
  Clock,
  AlertTriangle,
  ChevronDown
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { calculateWindowTintingEstimate, tintTypes, shadeLevels } from '../../utils/estimates'
import Modal, { 
  StepIndicator, 
  AnimatedButton, 
  SuccessCheckmark
} from '../ui/Modal'

export default function WindowTintingModal() {
  const { 
    activeModal, 
    setActiveModal,
    modalStep,
    nextModalStep,
    prevModalStep,
    resetModalStep,
    windowTintingFormData,
    setWindowTintingFormData,
    resetWindowTintingFormData,
    isSubmitting,
    setIsSubmitting,
    showSuccess,
    setShowSuccess,
  } = useAppStore()

  const [estimate, setEstimate] = useState<ReturnType<typeof calculateWindowTintingEstimate> | null>(null)
  const [showMakeDropdown, setShowMakeDropdown] = useState(false)

  const isOpen = activeModal === 'window_tinting'

  const handleClose = () => {
    setActiveModal(null)
    resetModalStep()
    resetWindowTintingFormData()
    setEstimate(null)
    setShowSuccess(false)
  }

  const toggleCoverage = (window: keyof typeof windowTintingFormData.coverage) => {
    setWindowTintingFormData({
      coverage: {
        ...windowTintingFormData.coverage,
        [window]: !windowTintingFormData.coverage[window]
      }
    })
  }

  const handleContinueToEstimate = () => {
    const est = calculateWindowTintingEstimate(windowTintingFormData)
    setEstimate(est)
    nextModalStep()
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsSubmitting(false)
    setShowSuccess(true)
  }

  const selectedShade = shadeLevels.find(s => s.value === windowTintingFormData.shadeLevel)
  const carMakes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Mercedes', 'Audi', 'Tesla', 'Lexus', 'Acura']

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Window Tinting">
      {/* Shine/glare animation background */}
      <motion.div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        initial={{ opacity: 1 }}
      >
        <motion.div
          className="absolute w-[200%] h-full"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, transparent 40%, rgba(255, 255, 255, 0.05) 50%, transparent 60%, transparent 100%)',
          }}
          animate={{
            x: ['-100%', '100%'],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            repeatDelay: 3,
            ease: 'easeInOut',
          }}
        />
      </motion.div>

      <AnimatePresence mode="wait">
        {showSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center py-8 relative z-10"
          >
            <SuccessCheckmark />
            <motion.h3
              className="text-xl font-semibold text-white mt-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Appointment Booked!
            </motion.h3>
            <motion.p
              className="text-white/60 text-sm mt-2 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Installation time: ~{estimate?.installationTime || 3} hours
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
            <StepIndicator currentStep={modalStep} totalSteps={5} />
            
            {/* Step 1: Select Tint Type */}
            {modalStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <p className="text-white/60 text-sm mb-4">Choose your tint type</p>
                
                {Object.entries(tintTypes).map(([key, tint], i) => {
                  const selected = windowTintingFormData.tintType === key
                  const priceIndicator = key === 'ceramic' ? '$$$' : key === 'carbon' ? '$$' : '$'
                  return (
                    <motion.button
                      key={key}
                      onClick={() => setWindowTintingFormData({ tintType: key as keyof typeof tintTypes })}
                      className={`w-full p-4 rounded-2xl text-left transition-all ${
                        selected 
                          ? 'bg-amber-500/20 border-amber-500/50 shadow-[0_0_20px_rgba(251,191,36,0.2)]' 
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      } border`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ scale: 1.01, y: -2 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Sun size={18} className={selected ? 'text-amber-400' : 'text-white/50'} />
                          <h4 className="text-white/90 font-semibold">{tint.name}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-bold">{priceIndicator}</span>
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                            selected ? 'bg-amber-500' : 'bg-white/10'
                          }`}>
                            {selected && <Check size={12} className="text-white" />}
                          </div>
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
                                {tint.features.map((feature, fi) => (
                                  <motion.li
                                    key={fi}
                                    className="text-white/50 text-xs flex items-center gap-2"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: fi * 0.05 }}
                                  >
                                    <Shield size={10} className="text-amber-400" />
                                    {feature}
                                  </motion.li>
                                ))}
                              </ul>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  )
                })}

                <AnimatedButton 
                  onClick={nextModalStep}
                  disabled={!windowTintingFormData.tintType}
                  className="mt-4"
                >
                  Continue <ChevronRight size={18} />
                </AnimatedButton>
              </motion.div>
            )}

            {/* Step 2: Coverage Selection with Car Diagram */}
            {modalStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-white/60 text-sm">Select windows to tint</p>

                {/* Car Diagram */}
                <div className="relative h-48 flex items-center justify-center">
                  <svg viewBox="0 0 200 100" className="w-full h-full max-w-xs">
                    {/* Car body */}
                    <path
                      d="M20 60 L30 60 L40 40 L70 35 L130 35 L160 40 L170 60 L180 60 L180 75 L20 75 Z"
                      fill="rgba(255,255,255,0.1)"
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth="1"
                    />
                    
                    {/* Front windshield */}
                    <motion.path
                      d="M42 42 L70 38 L70 55 L45 55 Z"
                      fill={windowTintingFormData.coverage.frontWindshield ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.05)'}
                      stroke={windowTintingFormData.coverage.frontWindshield ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.2)'}
                      strokeWidth="1"
                      className="cursor-pointer"
                      whileHover={{ fill: 'rgba(251,191,36,0.3)' }}
                      onClick={() => toggleCoverage('frontWindshield')}
                    />
                    
                    {/* Front side windows */}
                    <motion.path
                      d="M72 38 L90 37 L90 55 L72 55 Z"
                      fill={windowTintingFormData.coverage.frontSide ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.05)'}
                      stroke={windowTintingFormData.coverage.frontSide ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.2)'}
                      strokeWidth="1"
                      className="cursor-pointer"
                      whileHover={{ fill: 'rgba(251,191,36,0.3)' }}
                      onClick={() => toggleCoverage('frontSide')}
                    />
                    
                    {/* Rear side windows */}
                    <motion.path
                      d="M92 37 L125 37 L125 55 L92 55 Z"
                      fill={windowTintingFormData.coverage.rearSide ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.05)'}
                      stroke={windowTintingFormData.coverage.rearSide ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.2)'}
                      strokeWidth="1"
                      className="cursor-pointer"
                      whileHover={{ fill: 'rgba(251,191,36,0.3)' }}
                      onClick={() => toggleCoverage('rearSide')}
                    />
                    
                    {/* Back windshield */}
                    <motion.path
                      d="M127 37 L155 42 L152 55 L127 55 Z"
                      fill={windowTintingFormData.coverage.backWindshield ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.05)'}
                      stroke={windowTintingFormData.coverage.backWindshield ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.2)'}
                      strokeWidth="1"
                      className="cursor-pointer"
                      whileHover={{ fill: 'rgba(251,191,36,0.3)' }}
                      onClick={() => toggleCoverage('backWindshield')}
                    />
                    
                    {/* Sunroof */}
                    <motion.rect
                      x="85"
                      y="30"
                      width="30"
                      height="6"
                      rx="1"
                      fill={windowTintingFormData.coverage.sunroof ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.05)'}
                      stroke={windowTintingFormData.coverage.sunroof ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.2)'}
                      strokeWidth="1"
                      className="cursor-pointer"
                      whileHover={{ fill: 'rgba(251,191,36,0.3)' }}
                      onClick={() => toggleCoverage('sunroof')}
                    />
                    
                    {/* Wheels */}
                    <circle cx="50" cy="75" r="12" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" />
                    <circle cx="150" cy="75" r="12" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" />
                  </svg>
                  
                  <p className="absolute bottom-0 text-white/40 text-xs">Tap windows to select</p>
                </div>

                {/* Coverage checkboxes */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'frontWindshield', label: 'Front Windshield', note: '⚠️ Check laws' },
                    { key: 'frontSide', label: 'Front Side (2)' },
                    { key: 'rearSide', label: 'Rear Side (2)' },
                    { key: 'backWindshield', label: 'Back Windshield' },
                    { key: 'sunroof', label: 'Sunroof' },
                  ].map((item) => {
                    const selected = windowTintingFormData.coverage[item.key as keyof typeof windowTintingFormData.coverage]
                    return (
                      <motion.button
                        key={item.key}
                        onClick={() => toggleCoverage(item.key as keyof typeof windowTintingFormData.coverage)}
                        className={`p-3 rounded-xl flex items-center justify-between transition-all ${
                          selected 
                            ? 'bg-amber-500/20 border-amber-500/50' 
                            : 'bg-white/5 border-white/10'
                        } border`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div>
                          <span className={`text-xs ${selected ? 'text-white' : 'text-white/60'}`}>
                            {item.label}
                          </span>
                          {item.note && (
                            <p className="text-[10px] text-amber-400">{item.note}</p>
                          )}
                        </div>
                        <div className={`w-5 h-5 rounded flex items-center justify-center ${
                          selected ? 'bg-amber-500' : 'bg-white/10'
                        }`}>
                          {selected && <Check size={12} className="text-white" />}
                        </div>
                      </motion.button>
                    )
                  })}
                </div>

                {windowTintingFormData.coverage.frontWindshield && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2"
                  >
                    <AlertTriangle size={16} className="text-amber-400 mt-0.5" />
                    <p className="text-white/70 text-xs">
                      Front windshield tinting may be restricted in your area. Please check local regulations.
                    </p>
                  </motion.div>
                )}

                <div className="flex gap-3 pt-2">
                  <AnimatedButton variant="secondary" onClick={prevModalStep} fullWidth={false} className="flex-1">
                    Back
                  </AnimatedButton>
                  <AnimatedButton 
                    onClick={nextModalStep}
                    disabled={!Object.values(windowTintingFormData.coverage).some(v => v)}
                    fullWidth={false}
                    className="flex-[2]"
                  >
                    Continue <ChevronRight size={18} />
                  </AnimatedButton>
                </div>
              </motion.div>
            )}

            {/* Step 3: Shade Level */}
            {modalStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-white/60 text-sm">Select tint shade level</p>

                {/* Shade Preview */}
                <div className="relative h-24 rounded-xl overflow-hidden bg-gradient-to-r from-sky-400 to-sky-200">
                  <motion.div
                    className="absolute inset-0 bg-black"
                    animate={{ opacity: (100 - windowTintingFormData.shadeLevel) / 100 }}
                    transition={{ duration: 0.3 }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white font-bold text-2xl drop-shadow-lg">
                      {windowTintingFormData.shadeLevel}%
                    </span>
                  </div>
                </div>

                {/* Shade Buttons */}
                <div className="grid grid-cols-5 gap-2">
                  {shadeLevels.map((shade) => {
                    const selected = windowTintingFormData.shadeLevel === shade.value
                    return (
                      <motion.button
                        key={shade.value}
                        onClick={() => setWindowTintingFormData({ shadeLevel: shade.value })}
                        className={`p-3 rounded-xl flex flex-col items-center transition-all ${
                          selected 
                            ? 'bg-amber-500/30 border-amber-500/50' 
                            : 'bg-white/5 border-white/10'
                        } border`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <div 
                          className="w-8 h-8 rounded-lg mb-1"
                          style={{ 
                            background: `rgba(0,0,0,${(100 - shade.value) / 100})`,
                            border: '1px solid rgba(255,255,255,0.2)'
                          }}
                        />
                        <span className={`text-xs font-medium ${selected ? 'text-white' : 'text-white/60'}`}>
                          {shade.value}%
                        </span>
                      </motion.button>
                    )
                  })}
                </div>

                {selectedShade && (
                  <div className={`p-3 rounded-xl flex items-center gap-2 ${
                    selectedShade.legal ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'
                  } border`}>
                    {selectedShade.legal ? (
                      <Check size={16} className="text-emerald-400" />
                    ) : (
                      <AlertTriangle size={16} className="text-amber-400" />
                    )}
                    <span className="text-white/70 text-sm">{selectedShade.description}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <AnimatedButton variant="secondary" onClick={prevModalStep} fullWidth={false} className="flex-1">
                    Back
                  </AnimatedButton>
                  <AnimatedButton 
                    onClick={nextModalStep}
                    fullWidth={false}
                    className="flex-[2]"
                  >
                    Continue <ChevronRight size={18} />
                  </AnimatedButton>
                </div>
              </motion.div>
            )}

            {/* Step 4: Vehicle Info */}
            {modalStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-white/60 text-sm">Vehicle information</p>

                {/* Make Dropdown */}
                <div className="relative">
                  <label className="block text-white/60 text-xs font-medium mb-2">Make</label>
                  <motion.button
                    onClick={() => setShowMakeDropdown(!showMakeDropdown)}
                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between"
                    whileHover={{ scale: 1.01 }}
                  >
                    <span className={windowTintingFormData.vehicleMake ? 'text-white/90' : 'text-white/30'}>
                      {windowTintingFormData.vehicleMake || 'Select make...'}
                    </span>
                    <ChevronDown size={18} className="text-white/40" />
                  </motion.button>
                  
                  <AnimatePresence>
                    {showMakeDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-10 w-full mt-2 py-2 rounded-xl bg-void-700 border border-white/10 max-h-40 overflow-y-auto"
                      >
                        {carMakes.map((make) => (
                          <button
                            key={make}
                            onClick={() => {
                              setWindowTintingFormData({ vehicleMake: make })
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

                <div>
                  <label className="block text-white/60 text-xs font-medium mb-2">Model</label>
                  <input
                    type="text"
                    value={windowTintingFormData.vehicleModel}
                    onChange={(e) => setWindowTintingFormData({ vehicleModel: e.target.value })}
                    placeholder="e.g., Camry, Civic, F-150..."
                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white/90 placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div>
                  <label className="block text-white/60 text-xs font-medium mb-2">Year</label>
                  <input
                    type="text"
                    value={windowTintingFormData.vehicleYear}
                    onChange={(e) => setWindowTintingFormData({ vehicleYear: e.target.value })}
                    placeholder="e.g., 2023"
                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white/90 placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <AnimatedButton variant="secondary" onClick={prevModalStep} fullWidth={false} className="flex-1">
                    Back
                  </AnimatedButton>
                  <AnimatedButton 
                    onClick={handleContinueToEstimate}
                    disabled={!windowTintingFormData.vehicleMake || !windowTintingFormData.vehicleModel}
                    fullWidth={false}
                    className="flex-[2]"
                  >
                    Get Estimate <ChevronRight size={18} />
                  </AnimatedButton>
                </div>
              </motion.div>
            )}

            {/* Step 5: Estimate */}
            {modalStep === 5 && estimate && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="glass-elevated rounded-2xl p-5">
                  <h3 className="text-white/90 font-semibold mb-4">Tinting Estimate</h3>
                  
                  <div className="space-y-3">
                    {estimate.windowBreakdown.map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className="text-white/60">{item.window}</span>
                        <span className="text-white/90">${item.price}</span>
                      </div>
                    ))}
                    
                    <div className="flex justify-between items-center text-sm pt-2">
                      <span className="text-white/50">{estimate.tintTypeName} (×{estimate.tintMultiplier})</span>
                    </div>
                    
                    <div className="h-px bg-white/10" />
                    <div className="flex justify-between items-center">
                      <span className="text-white font-semibold">Total</span>
                      <span className="text-amber-400 text-xl font-bold">${estimate.total}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                    <div className="flex items-center gap-2 text-white/60">
                      <Clock size={14} />
                      <span className="text-sm">Installation: ~{estimate.installationTime} hours</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/60">
                      <Sun size={14} />
                      <span className="text-sm">Shade: {windowTintingFormData.shadeLevel}%</span>
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
                    Book Appointment
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




