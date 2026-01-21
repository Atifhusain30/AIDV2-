/**
 * Progress Components - Premium AID Design System
 * Step indicators, progress bars, and loading states
 */

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'

// ============================================
// STEP INDICATOR
// ============================================

interface Step {
  id: string
  label: string
  description?: string
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: number
  variant?: 'horizontal' | 'vertical'
  className?: string
}

export function StepIndicator({ 
  steps, 
  currentStep, 
  variant = 'horizontal',
  className = '' 
}: StepIndicatorProps) {
  if (variant === 'vertical') {
    return (
      <div className={`space-y-0 ${className}`}>
        {steps.map((step, index) => {
          const isCompleted = index < currentStep
          const isCurrent = index === currentStep
          const isLast = index === steps.length - 1

          return (
            <div key={step.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <motion.div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    transition-colors duration-300
                    ${isCompleted 
                      ? 'bg-accent-500 text-white' 
                      : isCurrent 
                        ? 'bg-primary-500 text-white shadow-glow-primary' 
                        : 'bg-glass-white border border-glass-border text-white/40'
                    }
                  `}
                  animate={isCurrent ? { scale: [1, 1.05, 1] } : undefined}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  {isCompleted ? (
                    <Check size={20} strokeWidth={2.5} />
                  ) : (
                    <span className="text-ui font-semibold">{index + 1}</span>
                  )}
                </motion.div>
                {!isLast && (
                  <div className="w-0.5 h-12 bg-glass-border mt-2 overflow-hidden">
                    <motion.div
                      className="w-full bg-accent-500"
                      initial={{ height: 0 }}
                      animate={{ height: isCompleted ? '100%' : '0%' }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                )}
              </div>
              <div className="pb-12">
                <p className={`text-body font-medium ${isCurrent ? 'text-white' : 'text-white/60'}`}>
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-caption text-white/40 mt-0.5">{step.description}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Horizontal variant
  return (
    <div className={`flex items-center justify-center ${className}`}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep
        const isCurrent = index === currentStep
        const isLast = index === steps.length - 1

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <motion.div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  transition-colors duration-300
                  ${isCompleted 
                    ? 'bg-accent-500 text-white' 
                    : isCurrent 
                      ? 'bg-primary-500 text-white shadow-glow-primary' 
                      : 'bg-glass-white border border-glass-border text-white/40'
                  }
                `}
                animate={isCurrent ? { scale: [1, 1.08, 1] } : undefined}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {isCompleted ? (
                  <Check size={18} strokeWidth={2.5} />
                ) : (
                  <span className="text-ui font-semibold">{index + 1}</span>
                )}
              </motion.div>
              <p className={`
                text-caption mt-2 text-center max-w-[80px]
                ${isCurrent ? 'text-white font-medium' : 'text-white/40'}
              `}>
                {step.label}
              </p>
            </div>
            {!isLast && (
              <div className="w-12 h-0.5 bg-glass-border mx-2 mb-6 overflow-hidden">
                <motion.div
                  className="h-full bg-accent-500"
                  initial={{ width: 0 }}
                  animate={{ width: isCompleted ? '100%' : '0%' }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================
// PROGRESS BAR
// ============================================

interface ProgressBarProps {
  value: number
  max?: number
  label?: string
  showValue?: boolean
  variant?: 'default' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md' | 'lg'
  animated?: boolean
  className?: string
}

const progressVariantStyles = {
  default: 'from-primary-500 to-primary-400',
  success: 'from-accent-500 to-accent-400',
  warning: 'from-warning to-amber-400',
  error: 'from-error to-red-400',
}

const progressSizeStyles = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

export function ProgressBar({ 
  value, 
  max = 100, 
  label,
  showValue = false,
  variant = 'default',
  size = 'md',
  animated = true,
  className = '' 
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-2">
          {label && <span className="text-caption text-white/60">{label}</span>}
          {showValue && <span className="text-caption text-white/80">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className={`w-full bg-white/10 rounded-full overflow-hidden ${progressSizeStyles[size]}`}>
        <motion.div
          className={`h-full bg-gradient-to-r ${progressVariantStyles[variant]} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: animated ? 0.5 : 0, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

// ============================================
// CIRCULAR PROGRESS
// ============================================

interface CircularProgressProps {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  showValue?: boolean
  variant?: 'default' | 'success'
  className?: string
}

export function CircularProgress({
  value,
  max = 100,
  size = 60,
  strokeWidth = 4,
  showValue = true,
  variant = 'default',
  className = ''
}: CircularProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const gradientId = `progress-gradient-${variant}`
  const colors = variant === 'success' 
    ? { start: '#10B981', end: '#34D399' }
    : { start: '#8B5CF6', end: '#A78BFA' }

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colors.start} />
            <stop offset="100%" stopColor={colors.end} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </svg>
      {showValue && (
        <span className="absolute text-ui font-semibold text-white">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  )
}

// ============================================
// LOADING SPINNER
// ============================================

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const spinnerSizes = {
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <motion.div
      className={`relative ${className}`}
      style={{ width: spinnerSizes[size], height: spinnerSizes[size] }}
    >
      <motion.div
        className="absolute inset-0 border-2 border-primary-500/30 rounded-full"
      />
      <motion.div
        className="absolute inset-0 border-2 border-transparent border-t-primary-400 rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    </motion.div>
  )
}

// ============================================
// LOADING OVERLAY
// ============================================

interface LoadingOverlayProps {
  visible: boolean
  label?: string
  fullScreen?: boolean
}

export function LoadingOverlay({ visible, label, fullScreen = false }: LoadingOverlayProps) {
  if (!visible) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`
        ${fullScreen ? 'fixed inset-0' : 'absolute inset-0'}
        bg-surface-950/80 backdrop-blur-sm
        flex flex-col items-center justify-center z-50
      `}
    >
      <Spinner size="lg" />
      {label && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-body text-white/70 mt-4"
        >
          {label}
        </motion.p>
      )}
    </motion.div>
  )
}

// ============================================
// PULSE LOADER (for searching state)
// ============================================

interface PulseLoaderProps {
  label?: string
  className?: string
}

export function PulseLoader({ label = 'Searching...', className = '' }: PulseLoaderProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-8 ${className}`}>
      <div className="relative">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border-2 border-primary-500"
            initial={{ scale: 0.8, opacity: 0.8 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.4,
              ease: 'easeOut',
            }}
          />
        ))}
        <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center">
          <Loader2 size={32} className="text-primary-400 animate-spin" />
        </div>
      </div>
      <p className="text-body text-white/60 mt-6">{label}</p>
    </div>
  )
}
