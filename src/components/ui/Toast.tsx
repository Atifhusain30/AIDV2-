/**
 * Toast Notification System - Premium AID Design System
 * Global toast notifications with animations
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, XCircle, Info, X } from 'lucide-react'

// ============================================
// TYPES
// ============================================

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface ToastContextValue {
  toasts: Toast[]
  showToast: (toast: Omit<Toast, 'id'>) => void
  hideToast: (id: string) => void
}

// ============================================
// CONTEXT
// ============================================

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

// ============================================
// PROVIDER
// ============================================

interface ToastProviderProps {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(7)
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 4000,
    }

    setToasts(prev => [...prev, newToast])

    // Auto-dismiss
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, newToast.duration)
    }
  }, [])

  const hideToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, showToast, hideToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

// ============================================
// CONTAINER
// ============================================

function ToastContainer() {
  const { toasts, hideToast } = useToast()

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none flex flex-col items-center pt-4 px-4 safe-top">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => hideToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// ============================================
// TOAST ITEM
// ============================================

const toastConfig: Record<ToastType, { 
  icon: typeof CheckCircle2
  bg: string
  border: string
  iconColor: string 
}> = {
  success: { 
    icon: CheckCircle2, 
    bg: 'bg-accent-500/10', 
    border: 'border-accent-500/30',
    iconColor: 'text-accent-400'
  },
  error: { 
    icon: XCircle, 
    bg: 'bg-error/10', 
    border: 'border-error/30',
    iconColor: 'text-error'
  },
  warning: { 
    icon: AlertCircle, 
    bg: 'bg-warning/10', 
    border: 'border-warning/30',
    iconColor: 'text-warning'
  },
  info: { 
    icon: Info, 
    bg: 'bg-info/10', 
    border: 'border-info/30',
    iconColor: 'text-info'
  },
}

interface ToastItemProps {
  toast: Toast
  onDismiss: () => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const config = toastConfig[toast.type]
  const Icon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={`
        pointer-events-auto
        w-full max-w-[380px] mb-2
        rounded-2xl p-4
        backdrop-blur-xl
        border
        shadow-lg
        ${config.bg}
        ${config.border}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${config.iconColor}`}>
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-body-sm">{toast.title}</p>
          {toast.message && (
            <p className="text-white/60 text-caption mt-1">{toast.message}</p>
          )}
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick()
                onDismiss()
              }}
              className="mt-2 text-caption font-medium text-primary-400 hover:text-primary-300 transition-colors"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-white/40 hover:text-white/60 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  )
}

// ============================================
// HELPER HOOKS
// ============================================

export function useShowToast() {
  const { showToast } = useToast()

  return {
    success: (title: string, message?: string) => 
      showToast({ type: 'success', title, message }),
    error: (title: string, message?: string) => 
      showToast({ type: 'error', title, message }),
    warning: (title: string, message?: string) => 
      showToast({ type: 'warning', title, message }),
    info: (title: string, message?: string) => 
      showToast({ type: 'info', title, message }),
  }
}
