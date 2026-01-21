/**
 * Input Components - Premium AID Design System
 * Text inputs, text areas, and form fields
 */

import { forwardRef, ReactNode, useState, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react'

// ============================================
// INPUT FIELD
// ============================================

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  helper?: string
  error?: string
  success?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const inputSizeStyles = {
  sm: 'h-10 text-body-sm px-3',
  md: 'h-12 text-body px-4',
  lg: 'h-14 text-body-lg px-5',
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  helper,
  error,
  success,
  leftIcon,
  rightIcon,
  size = 'md',
  type = 'text',
  disabled,
  className = '',
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  const getStateStyles = () => {
    if (error) return 'border-error/50 focus:border-error'
    if (success) return 'border-accent-500/50 focus:border-accent-500'
    if (isFocused) return 'border-primary-500/50'
    return 'border-glass-border hover:border-glass-border-strong'
  }

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-caption text-white/60 font-medium mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          type={isPassword && showPassword ? 'text' : type}
          disabled={disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={`
            w-full rounded-xl
            bg-glass-white
            border transition-all duration-200
            text-white placeholder:text-white/30
            focus:outline-none focus:bg-glass-white-strong
            disabled:opacity-50 disabled:cursor-not-allowed
            ${inputSizeStyles[size]}
            ${leftIcon ? 'pl-11' : ''}
            ${rightIcon || isPassword ? 'pr-11' : ''}
            ${getStateStyles()}
            ${isFocused ? 'shadow-[0_0_0_3px_rgba(139,92,246,0.15)]' : ''}
          `}
          {...props}
        />
        {(rightIcon || isPassword || error || success) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {error && <AlertCircle size={18} className="text-error" />}
            {success && !error && <CheckCircle2 size={18} className="text-accent-500" />}
            {isPassword && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-white/40 hover:text-white/60 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            )}
            {rightIcon && !isPassword && !error && !success && rightIcon}
          </div>
        )}
      </div>
      <AnimatePresence>
        {(error || helper) && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`mt-2 text-caption ${error ? 'text-error' : 'text-white/40'}`}
          >
            {error || helper}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
})

Input.displayName = 'Input'

// ============================================
// TEXTAREA
// ============================================

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  helper?: string
  error?: string
  success?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  helper,
  error,
  success,
  disabled,
  className = '',
  rows = 4,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false)

  const getStateStyles = () => {
    if (error) return 'border-error/50 focus:border-error'
    if (success) return 'border-accent-500/50 focus:border-accent-500'
    if (isFocused) return 'border-primary-500/50'
    return 'border-glass-border hover:border-glass-border-strong'
  }

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-caption text-white/60 font-medium mb-2">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        rows={rows}
        disabled={disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`
          w-full rounded-xl px-4 py-3
          bg-glass-white
          border transition-all duration-200
          text-white placeholder:text-white/30
          focus:outline-none focus:bg-glass-white-strong
          disabled:opacity-50 disabled:cursor-not-allowed
          resize-none
          ${getStateStyles()}
          ${isFocused ? 'shadow-[0_0_0_3px_rgba(139,92,246,0.15)]' : ''}
        `}
        {...props}
      />
      <AnimatePresence>
        {(error || helper) && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`mt-2 text-caption ${error ? 'text-error' : 'text-white/40'}`}
          >
            {error || helper}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
})

Textarea.displayName = 'Textarea'

// ============================================
// SEARCH INPUT
// ============================================

import { Search, X, Mic } from 'lucide-react'

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  onClear?: () => void
  showVoice?: boolean
  onVoice?: () => void
  size?: 'sm' | 'md' | 'lg'
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(({
  onClear,
  showVoice = false,
  onVoice,
  size = 'md',
  value,
  className = '',
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <motion.div 
      className={`
        relative rounded-2xl
        bg-glass-white border border-glass-border
        transition-all duration-200
        ${isFocused ? 'border-primary-500/50 shadow-glow-primary' : ''}
        ${className}
      `}
      animate={{
        boxShadow: isFocused ? '0 0 20px rgba(139, 92, 246, 0.2)' : '0 4px 20px rgba(0, 0, 0, 0.3)'
      }}
    >
      <Search 
        size={18} 
        className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" 
      />
      <input
        ref={ref}
        type="text"
        value={value}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`
          w-full bg-transparent 
          ${inputSizeStyles[size]}
          pl-11 pr-20
          text-white placeholder:text-white/30
          focus:outline-none
        `}
        {...props}
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <AnimatePresence>
          {value && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              type="button"
              onClick={onClear}
              className="text-white/40 hover:text-white/60 transition-colors"
            >
              <X size={16} />
            </motion.button>
          )}
        </AnimatePresence>
        {showVoice && (
          <button
            type="button"
            onClick={onVoice}
            className="text-white/40 hover:text-white/60 transition-colors"
          >
            <Mic size={18} />
          </button>
        )}
      </div>
    </motion.div>
  )
})

SearchInput.displayName = 'SearchInput'

// ============================================
// PIN INPUT (for verification codes)
// ============================================

interface PinInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  error?: boolean
  className?: string
}

export function PinInput({ length = 6, value, onChange, error = false, className = '' }: PinInputProps) {
  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return
    
    const newValue = value.split('')
    newValue[index] = char
    onChange(newValue.join('').slice(0, length))

    // Auto-focus next input
    if (char && index < length - 1) {
      const nextInput = document.querySelector(`[data-pin-index="${index + 1}"]`) as HTMLInputElement
      nextInput?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      const prevInput = document.querySelector(`[data-pin-index="${index - 1}"]`) as HTMLInputElement
      prevInput?.focus()
    }
  }

  return (
    <div className={`flex gap-3 justify-center ${className}`}>
      {Array.from({ length }).map((_, index) => (
        <motion.input
          key={index}
          data-pin-index={index}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className={`
            w-12 h-14 rounded-xl text-center text-h3 font-bold
            bg-glass-white border
            text-white focus:outline-none
            transition-all duration-200
            ${error 
              ? 'border-error/50' 
              : 'border-glass-border focus:border-primary-500/50'
            }
          `}
          whileFocus={{ scale: 1.05 }}
        />
      ))}
    </div>
  )
}
