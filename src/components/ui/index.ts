/**
 * UI Component Library - Premium AID Design System
 * Export all reusable components
 */

// Buttons
export { default as Button, IconButton } from './Button'
export type { ButtonVariant, ButtonSize } from './Button'

// Cards
export { default as Card, CardHeader, CardTitle, CardContent, CardFooter, SelectionCard } from './Card'
export type { CardVariant } from './Card'

// Badges & Status
export { Badge, StatusBadge, NotificationDot, OnlineIndicator, Chip } from './Badge'
export type { BadgeVariant, BadgeSize, ServiceStatus } from './Badge'

// Inputs
export { Input, Textarea, SearchInput, PinInput } from './Input'

// Progress & Loading
export { StepIndicator, ProgressBar, CircularProgress, Spinner, LoadingOverlay, PulseLoader } from './Progress'

// Avatars
export { Avatar, AvatarGroup } from './Avatar'

// Skeletons
export { 
  Skeleton, 
  SkeletonText, 
  SkeletonAvatar, 
  SkeletonCard, 
  SkeletonList, 
  SkeletonServiceCard, 
  SkeletonMapCard, 
  SkeletonStats 
} from './Skeleton'

// Empty States
export { 
  EmptyState, 
  EmptyHistory, 
  EmptyMessages, 
  EmptyNotifications, 
  EmptyVehicles, 
  EmptyAddresses, 
  EmptyPayments, 
  EmptySearch, 
  EmptyDriverJobs,
  ErrorState,
  OfflineState
} from './EmptyState'

// Toast Notifications
export { ToastProvider, useToast, useShowToast } from './Toast'
export type { ToastType } from './Toast'

// Modal (existing)
export { default as Modal } from './Modal'
export { 
  LoadingSpinner, 
  SuccessCheckmark, 
  StepIndicator as ModalStepIndicator, 
  AnimatedButton, 
  SelectionCard as ModalSelectionCard,
  InputField,
  TextareaField,
  Slider
} from './Modal'

// Bottom Navigation (existing)
export { default as BottomNav } from './BottomNav'
