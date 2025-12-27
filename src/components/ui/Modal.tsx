import { ReactNode, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  showCloseButton?: boolean
  accentColor?: string
}

export default function Modal({ 
  isOpen, 
  onClose, 
  children, 
  title,
  showCloseButton = true,
}: ModalProps) {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - Full screen overlay */}
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          
          {/* Modal Container - Centered with max-width */}
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none pb-20 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Modal Content */}
            <motion.div
              className="w-full max-w-[400px] pointer-events-auto"
              initial={{ y: 100, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 100, opacity: 0, scale: 0.95 }}
              transition={{ 
                type: 'spring', 
                damping: 25, 
                stiffness: 300,
                mass: 0.8
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div 
                className="rounded-3xl overflow-hidden flex flex-col max-h-[70vh] border border-white/10"
                style={{
                  background: 'linear-gradient(180deg, rgba(26, 26, 46, 0.98) 0%, rgba(22, 33, 62, 0.98) 100%)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(139, 92, 246, 0.1)',
                }}
              >
                {/* Handle bar */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 bg-white/20 rounded-full" />
                </div>
                
                {/* Header */}
                {(title || showCloseButton) && (
                  <div className="flex justify-between items-center px-6 py-3">
                    {title && (
                      <motion.h2 
                        className="text-lg font-semibold text-white/90"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                      >
                        {title}
                      </motion.h2>
                    )}
                    {showCloseButton && (
                      <motion.button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors ml-auto"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <X size={16} strokeWidth={1.5} className="text-white/50" />
                      </motion.button>
                    )}
                  </div>
                )}
                
                {/* Content - Scrollable */}
                <div className="px-6 pb-6 overflow-y-auto flex-1">
                  {children}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Loading Spinner Component
export function LoadingSpinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <motion.div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      <motion.div
        className="absolute inset-0 border-2 border-iris-500/30 rounded-full"
      />
      <motion.div
        className="absolute inset-0 border-2 border-transparent border-t-iris-400 rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    </motion.div>
  )
}

// Success Checkmark Animation
export function SuccessCheckmark({ size = 80 }: { size?: number }) {
  return (
    <motion.div
      className="flex items-center justify-center"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.1 }}
    >
      <div 
        className="relative rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <motion.svg
          viewBox="0 0 24 24"
          className="text-white"
          style={{ width: size * 0.5, height: size * 0.5 }}
        >
          <motion.path
            d="M5 13l4 4L19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          />
        </motion.svg>
        
        {/* Confetti particles */}
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              backgroundColor: ['#10b981', '#8b5cf6', '#f59e0b', '#ec4899'][i % 4],
            }}
            initial={{ 
              x: 0, 
              y: 0, 
              scale: 0,
              opacity: 1 
            }}
            animate={{ 
              x: Math.cos((i * 30) * Math.PI / 180) * (size * 1.2),
              y: Math.sin((i * 30) * Math.PI / 180) * (size * 1.2),
              scale: [0, 1, 0],
              opacity: [1, 1, 0]
            }}
            transition={{ 
              duration: 0.6, 
              delay: 0.3,
              ease: 'easeOut'
            }}
          />
        ))}
      </div>
    </motion.div>
  )
}

// Step Progress Indicator
export function StepIndicator({ 
  currentStep, 
  totalSteps,
}: { 
  currentStep: number
  totalSteps: number
  labels?: string[]
}) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[...Array(totalSteps)].map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <motion.div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              i + 1 <= currentStep 
                ? 'bg-iris-500 text-white' 
                : 'bg-white/10 text-white/40'
            }`}
            animate={{
              scale: i + 1 === currentStep ? 1.1 : 1,
            }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            {i + 1 <= currentStep - 1 ? '✓' : i + 1}
          </motion.div>
          {i < totalSteps - 1 && (
            <div className={`w-8 h-0.5 ${
              i + 1 < currentStep ? 'bg-iris-500' : 'bg-white/10'
            }`} />
          )}
        </div>
      ))}
    </div>
  )
}

// Animated Button
export function AnimatedButton({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  className = '',
  fullWidth = true,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
  className?: string
  fullWidth?: boolean
}) {
  const variants = {
    primary: 'bg-gradient-to-r from-iris-600 to-iris-500 hover:from-iris-500 hover:to-iris-400 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]',
    secondary: 'bg-white/10 hover:bg-white/15 text-white/80 border border-white/10',
    danger: 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)]',
  }

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        ${fullWidth ? 'w-full' : ''} 
        py-3 px-5 rounded-xl font-medium text-sm 
        flex items-center justify-center gap-2
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${className}
      `}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
    >
      {loading ? (
        <>
          <LoadingSpinner size={18} />
          <span>Processing...</span>
        </>
      ) : (
        children
      )}
    </motion.button>
  )
}

// Card Selection Component
export function SelectionCard({
  selected,
  onClick,
  children,
  className = '',
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <motion.button
      onClick={onClick}
      className={`
        w-full p-4 rounded-2xl text-left transition-all duration-200
        ${selected 
          ? 'bg-iris-500/20 border-iris-500/50 shadow-[0_0_20px_rgba(139,92,246,0.2)]' 
          : 'bg-white/5 border-white/10 hover:bg-white/10'
        }
        border
        ${className}
      `}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.button>
  )
}

// Input Field
export function InputField({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  icon,
  className = '',
}: {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  type?: string
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-white/60 text-xs font-medium mb-2">{label}</label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`
            w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3
            text-white/90 placeholder:text-white/30
            focus:outline-none focus:border-iris-500/50 focus:bg-white/10
            transition-all duration-200
            ${icon ? 'pl-10' : ''}
          `}
        />
      </div>
    </div>
  )
}

// Textarea Field
export function TextareaField({
  label,
  placeholder,
  value,
  onChange,
  rows = 3,
  className = '',
}: {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  rows?: number
  className?: string
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-white/60 text-xs font-medium mb-2">{label}</label>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="
          w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3
          text-white/90 placeholder:text-white/30 resize-none
          focus:outline-none focus:border-iris-500/50 focus:bg-white/10
          transition-all duration-200
        "
      />
    </div>
  )
}

// Slider Component
export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix = '%',
  className = '',
}: {
  label?: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  className?: string
}) {
  return (
    <div className={className}>
      {label && (
        <div className="flex justify-between items-center mb-2">
          <label className="text-white/60 text-xs font-medium">{label}</label>
          <span className="text-iris-300 text-sm font-semibold">{value}{suffix}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="
          w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-5
          [&::-webkit-slider-thumb]:h-5
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-iris-500
          [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(139,92,246,0.5)]
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110
        "
      />
    </div>
  )
}
