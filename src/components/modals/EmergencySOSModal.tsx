import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Phone,
  Truck,
  MapPin,
  AlertTriangle,
  X
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import Modal, { AnimatedButton, SuccessCheckmark } from '../ui/Modal'

export default function EmergencySOSModal() {
  const { 
    activeModal, 
    setActiveModal,
    showSuccess,
    setShowSuccess,
  } = useAppStore()

  const [countdown, setCountdown] = useState<number | null>(null)
  const [selectedAction, setSelectedAction] = useState<string | null>(null)

  const isOpen = activeModal === 'emergency_sos'

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    if (countdown !== null && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    } else if (countdown === 0) {
      // Execute the action
      handleExecuteAction()
    }
    return () => clearTimeout(timer)
  }, [countdown])

  const handleClose = () => {
    setActiveModal(null)
    setCountdown(null)
    setSelectedAction(null)
    setShowSuccess(false)
  }

  const handleCancel = () => {
    setCountdown(null)
    setSelectedAction(null)
  }

  const handleActionSelect = (action: string) => {
    setSelectedAction(action)
    if (action === 'call_911') {
      // For 911, use countdown for safety
      setCountdown(5)
    } else {
      setCountdown(3)
    }
  }

  const handleExecuteAction = async () => {
    // Simulate action
    await new Promise(resolve => setTimeout(resolve, 1000))
    setShowSuccess(true)
    setCountdown(null)
  }

  const emergencyOptions = [
    { 
      id: 'call_911', 
      icon: Phone, 
      label: 'Call 911', 
      description: 'Connect to emergency services',
      color: 'rose'
    },
    { 
      id: 'request_tow', 
      icon: Truck, 
      label: 'Immediate Tow', 
      description: 'Priority towing service',
      color: 'amber'
    },
    { 
      id: 'share_location', 
      icon: MapPin, 
      label: 'Share Location', 
      description: 'Send to emergency contact',
      color: 'emerald'
    },
  ]

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="">
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
              {selectedAction === 'call_911' && 'Connecting to 911...'}
              {selectedAction === 'request_tow' && 'Tow Requested!'}
              {selectedAction === 'share_location' && 'Location Shared!'}
            </motion.h3>
            <motion.p
              className="text-white/60 text-sm mt-2 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {selectedAction === 'call_911' && 'Stay calm, help is on the way'}
              {selectedAction === 'request_tow' && 'Priority tow truck dispatched'}
              {selectedAction === 'share_location' && 'Your emergency contact has been notified'}
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
        ) : countdown !== null ? (
          <motion.div
            key="countdown"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center py-8"
          >
            {/* Countdown Circle */}
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="rgba(244,63,94,0.2)"
                  strokeWidth="8"
                />
                <motion.circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="rgb(244,63,94)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={352}
                  initial={{ strokeDashoffset: 0 }}
                  animate={{ 
                    strokeDashoffset: 352 * (1 - countdown / (selectedAction === 'call_911' ? 5 : 3))
                  }}
                  transition={{ duration: 1, ease: 'linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.span
                  key={countdown}
                  initial={{ scale: 1.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-4xl font-bold text-rose-400"
                >
                  {countdown}
                </motion.span>
              </div>
            </div>

            <motion.h3
              className="text-lg font-semibold text-white mt-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {emergencyOptions.find(o => o.id === selectedAction)?.label}
            </motion.h3>
            <motion.p
              className="text-white/60 text-sm mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              Tap cancel to stop
            </motion.p>

            <motion.button
              onClick={handleCancel}
              className="mt-6 px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium flex items-center gap-2 transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <X size={18} />
              Cancel
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="options"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Emergency Header */}
            <div className="flex items-center justify-center gap-3 py-4">
              <motion.div
                className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center"
                animate={{
                  boxShadow: [
                    '0 0 0 0 rgba(244,63,94,0.4)',
                    '0 0 0 15px rgba(244,63,94,0)',
                  ],
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <AlertTriangle size={24} className="text-rose-400" />
              </motion.div>
              <div>
                <h2 className="text-xl font-bold text-rose-400">Emergency SOS</h2>
                <p className="text-white/50 text-xs">Select an option below</p>
              </div>
            </div>

            {/* Emergency Options */}
            <div className="space-y-3">
              {emergencyOptions.map((option, i) => {
                const Icon = option.icon
                const colors = {
                  rose: {
                    bg: 'bg-rose-500/20',
                    border: 'border-rose-500/50',
                    icon: 'text-rose-400',
                    hover: 'hover:bg-rose-500/30'
                  },
                  amber: {
                    bg: 'bg-amber-500/20',
                    border: 'border-amber-500/50',
                    icon: 'text-amber-400',
                    hover: 'hover:bg-amber-500/30'
                  },
                  emerald: {
                    bg: 'bg-emerald-500/20',
                    border: 'border-emerald-500/50',
                    icon: 'text-emerald-400',
                    hover: 'hover:bg-emerald-500/30'
                  },
                }
                const colorSet = colors[option.color as keyof typeof colors]
                
                return (
                  <motion.button
                    key={option.id}
                    onClick={() => handleActionSelect(option.id)}
                    className={`w-full p-4 rounded-2xl flex items-center gap-4 ${colorSet.bg} border ${colorSet.border} ${colorSet.hover} transition-all`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ scale: 1.02, x: 5 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={`w-12 h-12 rounded-xl ${colorSet.bg} flex items-center justify-center`}>
                      <Icon size={24} className={colorSet.icon} />
                    </div>
                    <div className="text-left">
                      <p className="text-white font-semibold">{option.label}</p>
                      <p className="text-white/50 text-sm">{option.description}</p>
                    </div>
                  </motion.button>
                )
              })}
            </div>

            <p className="text-center text-white/30 text-xs pt-2">
              All actions include a countdown for accidental presses
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}

