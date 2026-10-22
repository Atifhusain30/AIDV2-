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
