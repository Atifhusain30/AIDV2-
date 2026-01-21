/**
 * Skeleton Loading Components - Premium AID Design System
 * For showing loading states with animated placeholders
 */

import { motion } from 'framer-motion'

// ============================================
// BASE SKELETON
// ============================================

interface SkeletonProps {
  className?: string
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
}

const roundedStyles = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
}

export function Skeleton({ className = '', rounded = 'lg' }: SkeletonProps) {
  return (
    <motion.div
      className={`
        bg-white/5 
        ${roundedStyles[rounded]}
        overflow-hidden relative
        ${className}
      `}
      animate={{
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {/* Shimmer effect */}
      <motion.div
        className="absolute inset-0 bg-shine"
        animate={{
          x: ['-100%', '100%'],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{
          backgroundSize: '200% 100%',
        }}
      />
    </motion.div>
  )
}

// ============================================
// SKELETON TEXT
// ============================================

interface SkeletonTextProps {
  lines?: number
  className?: string
}

export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
          rounded="md"
        />
      ))}
    </div>
  )
}

// ============================================
// SKELETON AVATAR
// ============================================

interface SkeletonAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const avatarSizes = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
}

export function SkeletonAvatar({ size = 'md', className = '' }: SkeletonAvatarProps) {
  return <Skeleton className={`${avatarSizes[size]} ${className}`} rounded="full" />
}

// ============================================
// SKELETON CARD
// ============================================

interface SkeletonCardProps {
  hasImage?: boolean
  hasAvatar?: boolean
  lines?: number
  className?: string
}

export function SkeletonCard({ 
  hasImage = false, 
  hasAvatar = false, 
  lines = 2,
  className = '' 
}: SkeletonCardProps) {
  return (
    <div 
      className={`
        p-4 rounded-2xl 
        bg-glass-white border border-glass-border
        ${className}
      `}
    >
      {hasImage && <Skeleton className="h-40 w-full mb-4" rounded="xl" />}
      <div className="flex items-start gap-3">
        {hasAvatar && <SkeletonAvatar />}
        <div className="flex-1">
          <Skeleton className="h-5 w-3/4 mb-2" rounded="md" />
          <SkeletonText lines={lines} />
        </div>
      </div>
    </div>
  )
}

// ============================================
// SKELETON LIST
// ============================================

interface SkeletonListProps {
  count?: number
  hasAvatar?: boolean
  className?: string
}

export function SkeletonList({ count = 3, hasAvatar = true, className = '' }: SkeletonListProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className="p-4 rounded-2xl bg-glass-white border border-glass-border flex items-center gap-4"
        >
          {hasAvatar && <SkeletonAvatar size="lg" />}
          <div className="flex-1">
            <Skeleton className="h-5 w-1/2 mb-2" rounded="md" />
            <Skeleton className="h-4 w-3/4" rounded="md" />
          </div>
          <Skeleton className="h-6 w-16" rounded="full" />
        </div>
      ))}
    </div>
  )
}

// ============================================
// SKELETON SERVICE CARD
// ============================================

export function SkeletonServiceCard({ className = '' }: { className?: string }) {
  return (
    <div 
      className={`
        p-4 rounded-2xl 
        bg-glass-white border border-glass-border
        ${className}
      `}
    >
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="w-12 h-12" rounded="xl" />
        <div className="flex-1">
          <Skeleton className="h-5 w-1/2 mb-2" rounded="md" />
          <Skeleton className="h-4 w-24" rounded="full" />
        </div>
        <Skeleton className="h-8 w-20" rounded="lg" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-4 w-20" rounded="md" />
        <Skeleton className="h-4 w-24" rounded="md" />
      </div>
    </div>
  )
}

// ============================================
// SKELETON MAP CARD
// ============================================

export function SkeletonMapCard({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl ${className}`}>
      <Skeleton className="h-[300px] w-full" rounded="none" />
      <div className="absolute top-4 left-4 right-4">
        <div className="flex justify-between">
          <Skeleton className="h-14 w-40" rounded="xl" />
          <Skeleton className="h-10 w-20" rounded="xl" />
        </div>
      </div>
      <div className="absolute bottom-4 left-4 right-4">
        <Skeleton className="h-14 w-full" rounded="2xl" />
      </div>
    </div>
  )
}

// ============================================
// SKELETON STATS
// ============================================

export function SkeletonStats({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-${count} gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className="p-4 rounded-2xl bg-glass-white border border-glass-border text-center"
        >
          <Skeleton className="h-8 w-16 mx-auto mb-2" rounded="md" />
          <Skeleton className="h-4 w-12 mx-auto" rounded="md" />
        </div>
      ))}
    </div>
  )
}
