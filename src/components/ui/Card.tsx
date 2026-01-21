/**
 * Card Component - Premium AID Design System
 * Glass-morphism styled cards with multiple variants
 */

import { forwardRef, ReactNode } from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'

export type CardVariant = 'default' | 'elevated' | 'outlined' | 'highlight' | 'success' | 'warning'

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode
  variant?: CardVariant
  padding?: 'none' | 'sm' | 'md' | 'lg'
  interactive?: boolean
  selected?: boolean
}

const variantStyles: Record<CardVariant, string> = {
  default: `
    bg-glass-white
    border border-glass-border
    shadow-card
  `,
  elevated: `
    bg-gradient-to-br from-glass-white-strong to-glass-white
    border border-glass-border-strong
    shadow-lg
    backdrop-blur-xl
  `,
  outlined: `
    bg-transparent
    border border-glass-border
  `,
  highlight: `
    bg-gradient-to-br from-primary-500/10 to-primary-600/5
    border border-primary-500/30
    shadow-glow-primary
  `,
  success: `
    bg-gradient-to-br from-accent-500/10 to-accent-600/5
    border border-accent-500/30
  `,
  warning: `
    bg-gradient-to-br from-warning/10 to-warning/5
    border border-warning/30
  `,
}

const paddingStyles = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

const Card = forwardRef<HTMLDivElement, CardProps>(({
  children,
  variant = 'default',
  padding = 'md',
  interactive = false,
  selected = false,
  className = '',
  ...props
}, ref) => {
  return (
    <motion.div
      ref={ref}
      className={`
        rounded-2xl
        transition-all duration-200 ease-smooth
        ${variantStyles[variant]}
        ${paddingStyles[padding]}
        ${interactive ? 'cursor-pointer hover:border-glass-border-strong hover:shadow-card-hover' : ''}
        ${selected ? 'border-primary-500/50 shadow-glow-primary bg-primary-500/10' : ''}
        ${className}
      `}
      whileHover={interactive ? { scale: 1.01, y: -2 } : undefined}
      whileTap={interactive ? { scale: 0.99 } : undefined}
      {...props}
    >
      {children}
    </motion.div>
  )
})

Card.displayName = 'Card'

export default Card

// Card Header subcomponent
interface CardHeaderProps {
  children: ReactNode
  className?: string
  action?: ReactNode
}

export function CardHeader({ children, className = '', action }: CardHeaderProps) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      <div>{children}</div>
      {action && <div>{action}</div>}
    </div>
  )
}

// Card Title subcomponent
interface CardTitleProps {
  children: ReactNode
  subtitle?: string
  className?: string
}

export function CardTitle({ children, subtitle, className = '' }: CardTitleProps) {
  return (
    <div className={className}>
      <h3 className="text-h4 text-white">{children}</h3>
      {subtitle && <p className="text-body-sm text-white/50 mt-0.5">{subtitle}</p>}
    </div>
  )
}

// Card Content subcomponent
interface CardContentProps {
  children: ReactNode
  className?: string
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return <div className={className}>{children}</div>
}

// Card Footer subcomponent  
interface CardFooterProps {
  children: ReactNode
  className?: string
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <div className={`mt-4 pt-4 border-t border-glass-border ${className}`}>
      {children}
    </div>
  )
}

// Selection Card for forms
interface SelectionCardProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: ReactNode
  selected?: boolean
  disabled?: boolean
}

export const SelectionCard = forwardRef<HTMLButtonElement, SelectionCardProps>(({
  children,
  selected = false,
  disabled = false,
  className = '',
  ...props
}, ref) => {
  return (
    <motion.button
      ref={ref}
      disabled={disabled}
      className={`
        w-full p-4 rounded-2xl text-left
        transition-all duration-200 ease-smooth
        ${selected 
          ? 'bg-primary-500/15 border-primary-500/50 shadow-glow-primary' 
          : 'bg-glass-white border-glass-border hover:bg-glass-white-strong hover:border-glass-border-strong'
        }
        border
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      whileHover={!disabled ? { scale: 1.01 } : undefined}
      whileTap={!disabled ? { scale: 0.99 } : undefined}
      {...props}
    >
      {children}
    </motion.button>
  )
})

SelectionCard.displayName = 'SelectionCard'
