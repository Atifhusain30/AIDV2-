/**
 * Button Component - Premium AID Design System
 * Supports multiple variants, sizes, and states
 */

import { forwardRef, ReactNode } from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'
import { Loader2 } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  glow?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-gradient-to-r from-primary-600 to-primary-500
    text-white font-semibold
    shadow-glow-primary hover:shadow-glow-primary-lg
    border border-primary-500/30
  `,
  secondary: `
    bg-glass-white hover:bg-glass-white-strong
    text-white/90
    border border-glass-border hover:border-glass-border-strong
    shadow-card
  `,
  ghost: `
    bg-transparent hover:bg-glass-white
    text-white/70 hover:text-white
    border border-transparent
  `,
  danger: `
    bg-gradient-to-r from-red-600 to-red-500
    text-white font-semibold
    shadow-glow-error
    border border-red-500/30
  `,
  success: `
    bg-gradient-to-r from-accent-600 to-accent-500
    text-white font-semibold
    shadow-glow-accent hover:shadow-glow-accent-lg
    border border-accent-500/30
  `,
  outline: `
    bg-transparent
    text-primary-400 hover:text-primary-300
    border border-primary-500/40 hover:border-primary-500/60
    hover:bg-primary-500/10
  `,
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-ui-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-ui rounded-xl gap-2',
  lg: 'h-12 px-5 text-body rounded-xl gap-2',
  xl: 'h-14 px-6 text-body-lg rounded-2xl gap-2.5',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  glow = false,
  className = '',
  ...props
}, ref) => {
  const isDisabled = disabled || loading

  return (
    <motion.button
      ref={ref}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center
        transition-all duration-200 ease-smooth
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${glow && variant === 'primary' ? 'animate-glow' : ''}
        ${className}
      `}
      whileHover={!isDisabled ? { scale: 1.02, y: -1 } : undefined}
      whileTap={!isDisabled ? { scale: 0.98 } : undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 size={size === 'sm' ? 14 : size === 'xl' ? 20 : 16} className="animate-spin" />
          <span>Processing...</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </motion.button>
  )
})

Button.displayName = 'Button'

export default Button

// Icon Button variant
interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  icon: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  'aria-label': string
}

const iconSizeStyles: Record<ButtonSize, string> = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-12 h-12 rounded-xl',
  xl: 'w-14 h-14 rounded-2xl',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  icon,
  variant = 'ghost',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  ...props
}, ref) => {
  const isDisabled = disabled || loading

  return (
    <motion.button
      ref={ref}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center
        transition-all duration-200 ease-smooth
        ${variantStyles[variant]}
        ${iconSizeStyles[size]}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      whileHover={!isDisabled ? { scale: 1.05 } : undefined}
      whileTap={!isDisabled ? { scale: 0.95 } : undefined}
      {...props}
    >
      {loading ? (
        <Loader2 size={size === 'sm' ? 14 : size === 'xl' ? 22 : 18} className="animate-spin" />
      ) : (
        icon
      )}
    </motion.button>
  )
})

IconButton.displayName = 'IconButton'
