/**
 * Badge & Status Components - Premium AID Design System
 * For showing statuses, tags, and indicators
 */

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  XCircle, 
  Loader2,
  MapPin,
  Navigation,
  Wrench
} from 'lucide-react'

// ============================================
// BADGE COMPONENT
// ============================================

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'
export type BadgeSize = 'sm' | 'md' | 'lg'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  pulse?: boolean
  icon?: ReactNode
  className?: string
}

const badgeVariantStyles: Record<BadgeVariant, string> = {
  default: 'bg-white/10 text-white/70 border-white/10',
  primary: 'bg-primary-500/20 text-primary-300 border-primary-500/30',
  success: 'bg-accent-500/20 text-accent-300 border-accent-500/30',
  warning: 'bg-warning/20 text-amber-300 border-warning/30',
  error: 'bg-error/20 text-red-300 border-error/30',
  info: 'bg-info/20 text-blue-300 border-info/30',
}

const badgeSizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px] gap-1',
  md: 'px-2.5 py-1 text-caption gap-1.5',
  lg: 'px-3 py-1.5 text-ui-sm gap-2',
}

export function Badge({ 
  children, 
  variant = 'default', 
  size = 'md',
  dot = false,
  pulse = false,
  icon,
  className = '' 
}: BadgeProps) {
  return (
    <span 
      className={`
        inline-flex items-center rounded-full font-medium border
        ${badgeVariantStyles[variant]}
        ${badgeSizeStyles[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full bg-current ${pulse ? 'animate-pulse' : ''}`} />
      )}
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  )
}

// ============================================
// STATUS BADGE - For booking/service states
// ============================================

export type ServiceStatus = 
  | 'pending' 
  | 'searching' 
  | 'accepted' 
  | 'en_route' 
  | 'arrived' 
  | 'in_progress' 
  | 'completed' 
  | 'cancelled'

interface StatusBadgeProps {
  status: ServiceStatus
  size?: BadgeSize
  showIcon?: boolean
  className?: string
}

const statusConfig: Record<ServiceStatus, { 
  label: string
  variant: BadgeVariant
  icon: typeof CheckCircle2
  pulse?: boolean
}> = {
  pending: { label: 'Pending', variant: 'warning', icon: Clock, pulse: true },
  searching: { label: 'Searching', variant: 'info', icon: Loader2, pulse: true },
  accepted: { label: 'Accepted', variant: 'success', icon: CheckCircle2 },
  en_route: { label: 'En Route', variant: 'info', icon: Navigation, pulse: true },
  arrived: { label: 'Arrived', variant: 'success', icon: MapPin },
  in_progress: { label: 'In Progress', variant: 'warning', icon: Wrench, pulse: true },
  completed: { label: 'Completed', variant: 'success', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', variant: 'error', icon: XCircle },
}

export function StatusBadge({ status, size = 'md', showIcon = true, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <Badge 
      variant={config.variant} 
      size={size}
      pulse={config.pulse}
      icon={showIcon ? (
        <Icon 
          size={size === 'sm' ? 10 : size === 'lg' ? 14 : 12} 
          className={status === 'searching' ? 'animate-spin' : ''}
        />
      ) : undefined}
      className={className}
    >
      {config.label}
    </Badge>
  )
}

// ============================================
// NOTIFICATION DOT
// ============================================

interface NotificationDotProps {
  count?: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function NotificationDot({ count, size = 'md', className = '' }: NotificationDotProps) {
  const sizeStyles = {
    sm: 'w-2 h-2',
    md: count ? 'min-w-[18px] h-[18px] px-1' : 'w-2.5 h-2.5',
    lg: count ? 'min-w-[22px] h-[22px] px-1.5' : 'w-3 h-3',
  }

  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={`
        bg-error rounded-full flex items-center justify-center
        ${sizeStyles[size]}
        ${count ? 'text-[10px] font-bold text-white' : ''}
        ${className}
      `}
    >
      {count && count > 0 ? (count > 99 ? '99+' : count) : null}
    </motion.span>
  )
}

// ============================================
// ONLINE/OFFLINE INDICATOR
// ============================================

interface OnlineIndicatorProps {
  online: boolean
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

export function OnlineIndicator({ online, size = 'md', showLabel = false, className = '' }: OnlineIndicatorProps) {
  const dotSizes = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span 
        className={`
          rounded-full
          ${dotSizes[size]}
          ${online ? 'bg-accent-500' : 'bg-gray-500'}
          ${online ? 'animate-pulse' : ''}
        `}
      />
      {showLabel && (
        <span className={`text-caption ${online ? 'text-accent-400' : 'text-gray-400'}`}>
          {online ? 'Online' : 'Offline'}
        </span>
      )}
    </span>
  )
}

// ============================================
// CHIP/TAG COMPONENT
// ============================================

interface ChipProps {
  children: ReactNode
  variant?: BadgeVariant
  removable?: boolean
  onRemove?: () => void
  selected?: boolean
  onClick?: () => void
  className?: string
}

export function Chip({ 
  children, 
  variant = 'default', 
  removable = false, 
  onRemove,
  selected = false,
  onClick,
  className = '' 
}: ChipProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
        text-ui-sm font-medium
        transition-all duration-200
        ${selected 
          ? 'bg-primary-500 text-white border-primary-500' 
          : `${badgeVariantStyles[variant]} hover:bg-white/15`
        }
        border
        ${className}
      `}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
      {removable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove?.()
          }}
          className="ml-1 hover:text-white transition-colors"
        >
          <XCircle size={14} />
        </button>
      )}
    </motion.button>
  )
}
