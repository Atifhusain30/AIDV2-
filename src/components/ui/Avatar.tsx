/**
 * Avatar Components - Premium AID Design System
 * User avatars with online status and image fallbacks
 */

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { User } from 'lucide-react'

// ============================================
// AVATAR
// ============================================

interface AvatarProps {
  src?: string | null
  alt?: string
  name?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  online?: boolean
  verified?: boolean
  className?: string
}

const avatarSizes = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
  '2xl': 'w-20 h-20 text-xl',
}

const indicatorSizes = {
  xs: 'w-1.5 h-1.5 border',
  sm: 'w-2 h-2 border',
  md: 'w-2.5 h-2.5 border-2',
  lg: 'w-3 h-3 border-2',
  xl: 'w-3.5 h-3.5 border-2',
  '2xl': 'w-4 h-4 border-2',
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function Avatar({ 
  src, 
  alt = '', 
  name,
  size = 'md', 
  online,
  verified,
  className = '' 
}: AvatarProps) {
  const initials = name ? getInitials(name) : ''

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        className={`
          ${avatarSizes[size]}
          rounded-full overflow-hidden
          bg-gradient-to-br from-primary-500 to-primary-600
          flex items-center justify-center font-semibold text-white
          border-2 border-surface-800
        `}
      >
        {src ? (
          <img src={src} alt={alt} className="w-full h-full object-cover" />
        ) : initials ? (
          <span>{initials}</span>
        ) : (
          <User size={size === 'xs' || size === 'sm' ? 14 : size === 'xl' || size === '2xl' ? 28 : 20} />
        )}
      </div>
      
      {/* Online indicator */}
      {online !== undefined && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`
            absolute bottom-0 right-0
            ${indicatorSizes[size]}
            rounded-full
            border-surface-800
            ${online ? 'bg-accent-500' : 'bg-gray-500'}
          `}
        />
      )}

      {/* Verified badge */}
      {verified && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`
            absolute -bottom-1 -right-1
            ${size === 'xs' || size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'}
            rounded-full bg-accent-500
            flex items-center justify-center
          `}
        >
          <svg 
            viewBox="0 0 24 24" 
            className={`${size === 'xs' || size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-white`}
            fill="currentColor"
          >
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      )}
    </div>
  )
}

// ============================================
// AVATAR GROUP
// ============================================

interface AvatarGroupProps {
  avatars: Array<{
    src?: string
    name?: string
  }>
  max?: number
  size?: AvatarProps['size']
  className?: string
}

export function AvatarGroup({ avatars, max = 4, size = 'md', className = '' }: AvatarGroupProps) {
  const visibleAvatars = avatars.slice(0, max)
  const remainingCount = avatars.length - max

  const overlapStyles = {
    xs: '-ml-2',
    sm: '-ml-2.5',
    md: '-ml-3',
    lg: '-ml-3.5',
    xl: '-ml-4',
    '2xl': '-ml-5',
  }

  return (
    <div className={`flex items-center ${className}`}>
      {visibleAvatars.map((avatar, index) => (
        <div 
          key={index} 
          className={index > 0 ? overlapStyles[size] : ''}
          style={{ zIndex: visibleAvatars.length - index }}
        >
          <Avatar
            src={avatar.src}
            name={avatar.name}
            size={size}
          />
        </div>
      ))}
      {remainingCount > 0 && (
        <div 
          className={`
            ${avatarSizes[size]} 
            ${overlapStyles[size]}
            rounded-full
            bg-glass-white border-2 border-surface-800
            flex items-center justify-center
            font-medium text-white/70
          `}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  )
}

// ============================================
// DRIVER AVATAR (with rating)
// ============================================

interface DriverAvatarProps extends AvatarProps {
  rating?: number
  totalJobs?: number
}

export function DriverAvatar({ rating, totalJobs, ...props }: DriverAvatarProps) {
  return (
    <div className="flex items-center gap-3">
      <Avatar {...props} />
      {(rating || totalJobs) && (
        <div>
          {props.name && (
            <p className="text-body font-medium text-white">{props.name}</p>
          )}
          <div className="flex items-center gap-3 text-caption text-white/50">
            {rating && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-amber-400 fill-current" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {rating.toFixed(1)}
              </span>
            )}
            {totalJobs && <span>{totalJobs} jobs</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// SERVICE PROVIDER CARD
// ============================================

interface ProviderCardProps {
  name: string
  avatar?: string
  rating: number
  vehicleInfo?: string
  eta?: number
  online?: boolean
  onCall?: () => void
  onMessage?: () => void
  className?: string
}

export function ProviderCard({
  name,
  avatar,
  rating,
  vehicleInfo,
  eta,
  online = true,
  onCall,
  onMessage,
  className = ''
}: ProviderCardProps) {
  return (
    <div className={`p-4 rounded-2xl bg-glass-white border border-glass-border ${className}`}>
      <div className="flex items-start gap-4">
        <Avatar src={avatar} name={name} size="lg" online={online} verified />
        
        <div className="flex-1 min-w-0">
          <h4 className="text-body font-semibold text-white">{name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-caption text-amber-400">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {rating.toFixed(1)}
            </span>
            {vehicleInfo && (
              <span className="text-caption text-white/50">• {vehicleInfo}</span>
            )}
          </div>
          {eta !== undefined && (
            <p className="text-caption text-accent-400 mt-1">
              {eta === 0 ? 'Arriving now' : `${eta} min away`}
            </p>
          )}
        </div>

        {(onCall || onMessage) && (
          <div className="flex gap-2">
            {onMessage && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onMessage}
                className="w-10 h-10 rounded-xl bg-glass-white border border-glass-border flex items-center justify-center text-white/60 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </motion.button>
            )}
            {onCall && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onCall}
                className="w-10 h-10 rounded-xl bg-accent-500/20 border border-accent-500/30 flex items-center justify-center text-accent-400"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </motion.button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
