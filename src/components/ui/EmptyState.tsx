/**
 * Empty State Components - Premium AID Design System
 * For showing when there's no content/data
 */

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { 
  FileText, 
  MapPin, 
  Clock, 
  MessageCircle, 
  Bell,
  Car,
  CreditCard,
  Search,
  Wifi,
  AlertTriangle
} from 'lucide-react'
import Button from './Button'

// ============================================
// EMPTY STATE
// ============================================

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ 
  icon, 
  title, 
  description, 
  action,
  secondaryAction,
  className = '' 
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}
    >
      {icon && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.1 }}
          className="w-20 h-20 rounded-3xl bg-glass-white border border-glass-border flex items-center justify-center mb-6"
        >
          <div className="text-white/30">{icon}</div>
        </motion.div>
      )}
      
      <motion.h3
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-h4 text-white mb-2"
      >
        {title}
      </motion.h3>
      
      {description && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-body-sm text-white/50 max-w-xs mb-6"
        >
          {description}
        </motion.p>
      )}
      
      {(action || secondaryAction) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          {action && (
            <Button onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}

// ============================================
// PRESET EMPTY STATES
// ============================================

interface PresetEmptyStateProps {
  onAction?: () => void
  className?: string
}

export function EmptyHistory({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={<Clock size={40} strokeWidth={1.5} />}
      title="No Service History"
      description="Your completed services will appear here"
      action={onAction ? { label: 'Request Service', onClick: onAction } : undefined}
      className={className}
    />
  )
}

export function EmptyMessages({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={<MessageCircle size={40} strokeWidth={1.5} />}
      title="No Messages"
      description="Start a chat when you have an active service"
      action={onAction ? { label: 'Request Service', onClick: onAction } : undefined}
      className={className}
    />
  )
}

export function EmptyNotifications({ className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={<Bell size={40} strokeWidth={1.5} />}
      title="No Notifications"
      description="You're all caught up!"
      className={className}
    />
  )
}

export function EmptyVehicles({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={<Car size={40} strokeWidth={1.5} />}
      title="No Vehicles Added"
      description="Add your vehicles for faster service requests"
      action={onAction ? { label: 'Add Vehicle', onClick: onAction } : undefined}
      className={className}
    />
  )
}

export function EmptyAddresses({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={<MapPin size={40} strokeWidth={1.5} />}
      title="No Saved Addresses"
      description="Save frequently used locations for quick access"
      action={onAction ? { label: 'Add Address', onClick: onAction } : undefined}
      className={className}
    />
  )
}

export function EmptyPayments({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={<CreditCard size={40} strokeWidth={1.5} />}
      title="No Payment Methods"
      description="Add a payment method to book services"
      action={onAction ? { label: 'Add Payment', onClick: onAction } : undefined}
      className={className}
    />
  )
}

export function EmptySearch({ query, className }: { query?: string; className?: string }) {
  return (
    <EmptyState
      icon={<Search size={40} strokeWidth={1.5} />}
      title="No Results Found"
      description={query ? `No matches for "${query}"` : 'Try adjusting your search'}
      className={className}
    />
  )
}

export function EmptyDriverJobs({ className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={<FileText size={40} strokeWidth={1.5} />}
      title="No Jobs Yet"
      description="New service requests will appear here when you're online"
      className={className}
    />
  )
}

// ============================================
// ERROR STATE
// ============================================

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ 
  title = 'Something went wrong',
  message = 'We encountered an error. Please try again.',
  onRetry,
  className = ''
}: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.1 }}
        className="w-20 h-20 rounded-3xl bg-error/10 border border-error/30 flex items-center justify-center mb-6"
      >
        <AlertTriangle size={40} strokeWidth={1.5} className="text-error" />
      </motion.div>
      
      <h3 className="text-h4 text-white mb-2">{title}</h3>
      <p className="text-body-sm text-white/50 max-w-xs mb-6">{message}</p>
      
      {onRetry && (
        <Button onClick={onRetry} variant="secondary">
          Try Again
        </Button>
      )}
    </motion.div>
  )
}

// ============================================
// OFFLINE STATE
// ============================================

interface OfflineStateProps {
  onRetry?: () => void
  className?: string
}

export function OfflineState({ onRetry, className = '' }: OfflineStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.1 }}
        className="w-20 h-20 rounded-3xl bg-warning/10 border border-warning/30 flex items-center justify-center mb-6"
      >
        <Wifi size={40} strokeWidth={1.5} className="text-warning" />
      </motion.div>
      
      <h3 className="text-h4 text-white mb-2">You're Offline</h3>
      <p className="text-body-sm text-white/50 max-w-xs mb-6">
        Check your internet connection and try again
      </p>
      
      {onRetry && (
        <Button onClick={onRetry} variant="secondary">
          Retry
        </Button>
      )}
    </motion.div>
  )
}
