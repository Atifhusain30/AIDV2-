import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone,
  Send,
  Image as ImageIcon,
  Check,
  CheckCheck,
  Loader2,
  MessageCircle,
  MapPin,
  Navigation,
  Clock,
  X,
  CheckCircle,
} from 'lucide-react'
import { useAppStore, ChatMessage } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { apiService } from '../services/api'
import { BookingStatus } from '../types'
import { lazy, Suspense } from 'react'
import * as bookingService from '../services/bookingService'
import * as chatService from '../services/chatService'

// Lazy load TrackingMap to avoid SSR issues with Leaflet
const TrackingMap = lazy(() => import('../components/ui/TrackingMap'))

// Types
type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read'

interface Provider {
  id: string
  name: string
  initials: string
  rating: number
  vehicleInfo: string
  eta: number | null
  isOnline: boolean
}

// Provider reply templates moved to chatService


// Status display config
const statusConfig: Record<BookingStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: 'text-gray-400', bgColor: 'bg-gray-500/20' },
  searching: { label: 'Finding Provider...', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  accepted: { label: 'Provider Accepted', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  en_route: { label: 'On The Way', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  arrived: { label: 'Provider Arrived', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  in_progress: { label: 'Service In Progress', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  completed: { label: 'Completed', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  cancelled: { label: 'Cancelled', color: 'text-red-400', bgColor: 'bg-red-500/20' },
}

// Helper functions
const formatMessageTime = (timestamp: string | Date) => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const formatBookingTime = (date: Date) => {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// Typing Indicator Component
function TypingIndicator({ providerName }: { providerName: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="bg-white/10 px-4 py-3 rounded-2xl rounded-bl-md">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{providerName}</span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 bg-gray-400 rounded-full"
                animate={{ y: [0, -4, 0] }}
                transition={{
                  duration: 0.5,
                  repeat: Infinity,
                  delay: i * 0.12,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// System Message Component
function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-center my-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white/5 px-4 py-2 rounded-full border border-white/5"
      >
        <p className="text-xs text-gray-400 text-center">{message.text}</p>
      </motion.div>
    </div>
  )
}

// Message Bubble Component
function MessageBubble({ message, isOwn, status }: { message: ChatMessage; isOwn: boolean; status?: MessageStatus }) {
  const formattedTime = formatMessageTime(message.timestamp)
  const displayStatus = status || 'read' // Default to read for persisted messages

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%]`}>
        <div
          className={`px-4 py-2.5 rounded-2xl ${
            isOwn
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-br-md'
              : 'bg-white/10 text-white rounded-bl-md'
          }`}
        >
          <p className="text-[15px] leading-relaxed">{message.text}</p>
        </div>
        
        {/* Timestamp and status */}
        <div className={`flex items-center gap-1.5 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[11px] text-gray-500">{formattedTime}</span>
          {isOwn && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
            >
              {displayStatus === 'sending' && (
                <Loader2 size={12} className="text-gray-500 animate-spin" />
              )}
              {displayStatus === 'sent' && (
                <Check size={12} className="text-gray-500" />
              )}
              {displayStatus === 'delivered' && (
                <CheckCheck size={12} className="text-gray-500" />
              )}
              {displayStatus === 'read' && (
                <CheckCheck size={12} className="text-emerald-400" />
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

// Empty State Component
function EmptyState({ onRequestService }: { onRequestService: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col items-center justify-center px-8 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.1 }}
        className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6"
      >
        <MessageCircle size={32} strokeWidth={1.5} className="text-gray-500" />
      </motion.div>
      
      <motion.h3
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-xl font-semibold text-white mb-2"
      >
        No Active Request
      </motion.h3>
      
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-gray-400 mb-8 max-w-xs"
      >
        Start a service request to chat with your provider.
      </motion.p>
      
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onRequestService}
        className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 px-8 rounded-xl shadow-lg shadow-emerald-500/20"
      >
        Request Service
      </motion.button>
    </motion.div>
  )
}

// Booking Info Card Component
function BookingInfoCard({ 
  serviceName, 
  status, 
  createdAt, 
  location,
  provider,
  estimatedPrice,
  providerETA,
}: { 
  serviceName: string
  status: BookingStatus
  createdAt: Date
  location: string
  provider: Provider | null
  estimatedPrice: number
  providerETA?: number
}) {
  const config = statusConfig[status]
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10"
    >
      {/* Service & Status */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-white font-semibold">{serviceName}</h3>
          <p className="text-gray-400 text-xs mt-0.5">{formatBookingTime(createdAt)}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
          {config.label}
        </span>
      </div>
      
      {/* Location */}
      <div className="flex items-center gap-2 text-gray-400 text-sm mb-3">
        <MapPin size={14} strokeWidth={1.5} />
        <span className="truncate">{location}</span>
      </div>
      
      {/* Provider info (if accepted) */}
      {provider && (status === 'accepted' || status === 'en_route' || status === 'arrived' || status === 'in_progress') && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="pt-3 border-t border-white/10"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-sm font-semibold text-white">
              {provider.initials}
            </div>
            <div className="flex-1">
              <p className="text-white text-sm font-medium">{provider.name}</p>
              <p className="text-gray-400 text-xs">{provider.vehicleInfo}</p>
            </div>
            {(providerETA !== undefined || provider.eta !== null) && (
              <div className="flex items-center gap-1 text-emerald-400">
                <Clock size={14} />
                <span className="text-sm font-medium">{providerETA ?? provider.eta} min</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
      
      {/* Price */}
      <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/10">
        <span className="text-gray-400 text-sm">Estimated Price</span>
        <span className="text-emerald-400 font-semibold">${estimatedPrice}</span>
      </div>
    </motion.div>
  )
}

// Chat Input Component
function ChatInput({ 
  value, 
  onChange, 
  onSend, 
  isSending,
  disabled 
}: { 
  value: string
  onChange: (val: string) => void
  onSend: () => void
  isSending: boolean
  disabled?: boolean
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm border-t border-white/10 px-4 py-3 rounded-b-2xl"
    >
      <div className="flex items-end gap-3">
        {/* Attachment button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          disabled={disabled}
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 flex-shrink-0 disabled:opacity-50"
        >
          <ImageIcon size={20} strokeWidth={1.5} />
        </motion.button>
        
        {/* Location share button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          disabled={disabled}
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 flex-shrink-0 disabled:opacity-50"
        >
          <MapPin size={20} strokeWidth={1.5} />
        </motion.button>
        
        {/* Text input */}
        <div className="flex-1 bg-white/5 rounded-2xl px-4 py-2.5 flex items-center border border-white/5">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled}
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-[15px] disabled:opacity-50"
          />
        </div>
        
        {/* Send button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onSend}
          disabled={!value.trim() || isSending || disabled}
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            value.trim() && !disabled
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
              : 'bg-white/5 text-gray-500'
          }`}
        >
          {isSending ? (
            <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <Send size={18} strokeWidth={1.5} />
          )}
        </motion.button>
      </div>
    </motion.div>
  )
}

// Status Progress Indicator
function StatusProgress({ currentStatus }: { currentStatus: BookingStatus }) {
  const stages: BookingStatus[] = ['searching', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed']
  const currentIndex = stages.indexOf(currentStatus)
  
  if (currentStatus === 'cancelled' || currentStatus === 'pending') return null
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-between px-2 py-3"
    >
      {stages.slice(0, 5).map((stage, index) => {
        const isActive = index <= currentIndex
        const isCurrent = index === currentIndex
        return (
          <div key={stage} className="flex items-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`w-3 h-3 rounded-full ${
                isActive 
                  ? isCurrent 
                    ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50' 
                    : 'bg-emerald-500' 
                  : 'bg-white/20'
              }`}
            >
              {isCurrent && (
                <motion.div
                  className="w-full h-full rounded-full bg-emerald-400"
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </motion.div>
            {index < 4 && (
              <div className={`w-12 h-0.5 mx-1 ${isActive && index < currentIndex ? 'bg-emerald-500' : 'bg-white/20'}`} />
            )}
          </div>
        )
      })}
    </motion.div>
  )
}

// Action Buttons Component
function BookingActions({ 
  onCancel, 
  onComplete,
  isTerminal
}: { 
  onCancel: () => void
  onComplete: () => void
  isTerminal: boolean
}) {
  if (isTerminal) return null
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 mb-4"
    >
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onCancel}
        className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-medium text-sm hover:bg-red-500/20 transition-colors"
      >
        <X size={18} strokeWidth={2} />
        Cancel Request
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onComplete}
        className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium text-sm hover:bg-emerald-500/20 transition-colors"
      >
        <CheckCircle size={18} strokeWidth={2} />
        Mark Completed
      </motion.button>
    </motion.div>
  )
}

// Main Chat Screen Component
export default function ChatScreen() {
  const { 
    activeBooking, 
    setActiveModal,
    bookingMessages,
    openBookingDetail,
    setActiveBooking,
    updateBookingInHistory,
  } = useAppStore()
  const { token } = useAuthStore()
  
  // State
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [pendingMessageStatus, setPendingMessageStatus] = useState<Record<string, MessageStatus>>({})
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const providerReplyTimerRef = useRef<(() => void) | null>(null)
  const trackingStopRef = useRef<(() => void) | null>(null)
  
  // Get messages for current booking from store
  const messages = activeBooking ? (bookingMessages[activeBooking.id] || []) : []
  
  // Derive provider from activeBooking.mechanic (persisted)
  const provider: Provider | null = activeBooking?.mechanic
    ? {
        id: activeBooking.mechanic.id,
        name: activeBooking.mechanic.name,
        initials: activeBooking.mechanic.initials,
        rating: activeBooking.mechanic.rating,
        vehicleInfo: 'Service Vehicle', // Default vehicle info
        eta: activeBooking.mechanic.eta,
        isOnline: activeBooking.mechanic.isOnline,
      }
    : null
  
  // Terminal states - don't progress
  const isTerminalStatus = activeBooking?.status === 'cancelled' || activeBooking?.status === 'completed'
  
  // Check if provider can reply (has provider + valid status)
  const canProviderReply = activeBooking && 
    provider && 
    chatService.canProviderReply(activeBooking.id)
  
  // Schedule a provider reply with typing indicator
  const scheduleProviderReplyWithTyping = (bookingId: string) => {
    if (!canProviderReply) return
    
    // Clear any existing timer
    if (providerReplyTimerRef.current) {
      providerReplyTimerRef.current()
    }
    
    setIsTyping(true)
    
    // Use chatService to schedule reply
    const cleanup = chatService.scheduleProviderReply(bookingId)
    
    // Set up our own timer to clear typing indicator
    const typingTimer = setTimeout(() => {
      setIsTyping(false)
    }, 3500) // Slightly longer than the max service delay
    
    providerReplyTimerRef.current = () => {
      cleanup()
      clearTimeout(typingTimer)
      setIsTyping(false)
    }
  }
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (providerReplyTimerRef.current) {
        providerReplyTimerRef.current()
      }
      if (trackingStopRef.current) {
        trackingStopRef.current()
      }
      // Cleanup all chat service timers for this booking
      if (activeBooking) {
        chatService.cleanupReplyTimers(activeBooking.id)
      }
    }
  }, [activeBooking?.id])
  
  // Keep managed bookings synchronized with driver actions from the backend.
  useEffect(() => {
    if (!token || !activeBooking) return
    let stopped = false
    const refresh = async () => {
      const result = await apiService.getBooking(activeBooking.id)
      if (!stopped && result.success && result.data) {
        bookingService.reconcileManagedBooking(result.data)
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 4000)
    return () => {
      stopped = true
      window.clearInterval(interval)
    }
  }, [token, activeBooking?.id, setActiveBooking, updateBookingInHistory])

  // Simulate status progression only for local guest demonstrations.
  useEffect(() => {
    if (token) return
    if (!activeBooking) return
    if (['cancelled', 'completed'].includes(activeBooking.status)) return
    
    const timers: ReturnType<typeof setTimeout>[] = []
    const bookingId = activeBooking.id
    
    if (activeBooking.status === 'searching') {
      // After 2.5s: accepted + match provider
      const t1 = setTimeout(() => {
        bookingService.updateBookingStatus(bookingId, 'accepted')
        bookingService.assignProvider(bookingId)
      }, 2500)
      timers.push(t1)
    }
    
    if (activeBooking.status === 'accepted') {
      // After 3s: en_route - initialize tracking
      const t2 = setTimeout(() => {
        bookingService.initializeProviderTracking(bookingId)
      }, 3000)
      timers.push(t2)
    }
    
    return () => {
      timers.forEach(t => clearTimeout(t))
    }
  }, [token, activeBooking?.status, activeBooking?.id])
  
  // Provider tracking - start/stop based on status
  useEffect(() => {
    if (!activeBooking) return
    if (activeBooking.status !== 'en_route') {
      // Stop tracking if not en_route
      if (trackingStopRef.current) {
        trackingStopRef.current()
        trackingStopRef.current = null
      }
      return
    }
    if (!activeBooking.providerCoords) return
    
    // Start tracking via service
    const stopTracking = bookingService.startProviderTracking(activeBooking.id)
    trackingStopRef.current = stopTracking
    
    return () => {
      if (trackingStopRef.current) {
        trackingStopRef.current()
        trackingStopRef.current = null
      }
    }
  }, [activeBooking?.status, activeBooking?.id, activeBooking?.providerCoords?.lat])
  
  // Handle cancel request
  const handleCancelRequest = async () => {
    if (!activeBooking) return
    if (!token) {
      bookingService.cancelBooking(activeBooking.id)
      return
    }
    const result = await apiService.updateBookingStatus(activeBooking.id, 'cancelled')
    if (!result.success || !result.data) {
      window.alert(result.error || 'Unable to cancel this request.')
      return
    }
    setActiveBooking(null)
    updateBookingInHistory(result.data.id, result.data)
  }
  
  // Only providers can complete managed jobs; local guest demos retain the prototype action.
  const handleMarkCompleted = () => {
    if (!activeBooking) return
    if (token) {
      window.alert('Your provider will complete the job when service is finished.')
      return
    }
    bookingService.completeBooking(activeBooking.id)
  }
  
  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages])
  
  // Check if chat is enabled (only when provider is assigned)
  const chatEnabled = activeBooking && provider && 
    ['accepted', 'en_route', 'arrived', 'in_progress'].includes(activeBooking.status)
  
  // Handle send message
  const handleSend = async () => {
    if (!inputValue.trim() || isSending || !chatEnabled || !activeBooking) return
    
    const bookingId = activeBooking.id
    const messageText = inputValue.trim()
    
    // Append message via service
    chatService.appendUserMessage(bookingId, messageText)
    
    setInputValue('')
    setIsSending(true)
    
    // Simulate send/delivered/read progression
    await new Promise(resolve => setTimeout(resolve, 1300))
    
    setIsSending(false)
    
    // Schedule provider auto-reply (70% chance)
    if (Math.random() > 0.3 && canProviderReply) {
      scheduleProviderReplyWithTyping(bookingId)
    }
  }

  const handleCall = () => {
    console.log('Initiating call...')
  }

  // Handle request service
  const handleRequestService = () => {
    setActiveModal('services')
  }

  // No active booking - show empty state
  if (!activeBooking) {
    return (
      <div className="customer-chat max-w-md mx-auto px-5 py-6 flex flex-col h-[calc(100vh-120px)]">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <h1 className="text-xl font-semibold text-white mb-1">Updates</h1>
          <p className="text-white/40 text-sm">Live service status and messages</p>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex-1 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 flex flex-col overflow-hidden"
        >
          <EmptyState onRequestService={handleRequestService} />
        </motion.div>
      </div>
    )
  }

  // Handle view details
  const handleViewDetails = () => {
    if (activeBooking) {
      openBookingDetail(activeBooking.id)
    }
  }

  return (
    <div className="customer-chat max-w-md mx-auto px-5 py-6 flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-start justify-between"
      >
        <div>
          <h1 className="text-xl font-semibold text-white mb-1">Updates</h1>
          <p className="text-white/40 text-sm">
            {chatEnabled ? `Chat with ${provider?.name}` : 'Tracking your service'}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleViewDetails}
          className="px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-colors"
        >
          Details
        </motion.button>
      </motion.div>
      
      {/* Booking Info Card */}
      <div className="mb-4">
        <BookingInfoCard
          serviceName={activeBooking.service.name}
          status={activeBooking.status}
          createdAt={activeBooking.createdAt}
          location={activeBooking.location.address}
          provider={provider}
          estimatedPrice={activeBooking.estimatedPrice}
          providerETA={activeBooking.providerETA}
        />
      </div>
      
      {/* Live Tracking Map - shows when en_route */}
      {activeBooking.status === 'en_route' && activeBooking.providerCoords && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 space-y-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Navigation size={14} className="text-emerald-400" />
              <span>Provider en route</span>
            </div>
            {activeBooking.providerETA && (
              <div className="flex items-center gap-1 text-emerald-400 text-sm font-medium">
                <Clock size={14} />
                <span>{activeBooking.providerETA} min away</span>
              </div>
            )}
          </div>
          <Suspense fallback={
            <div className="h-[220px] rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          }>
            <TrackingMap
              user={activeBooking.location}
              provider={activeBooking.providerCoords}
            />
          </Suspense>
        </motion.div>
      )}
      
      {/* Action Buttons - Cancel / Complete */}
      <BookingActions
        onCancel={handleCancelRequest}
        onComplete={handleMarkCompleted}
        isTerminal={isTerminalStatus}
      />
      
      {/* Status Progress */}
      <StatusProgress currentStatus={activeBooking.status} />
      
      {/* Main Chat Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex-1 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 flex flex-col overflow-hidden"
      >
        {chatEnabled && provider ? (
          <motion.div
            key="chat-active"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex-1 flex flex-col"
          >
            {/* Chat Header */}
            <div className="bg-white/5 backdrop-blur-sm border-b border-white/10 px-4 py-3 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-sm font-semibold text-white">
                      {provider.initials}
                    </div>
                    {provider.isOnline && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#12122a]"
                      />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{provider.name}</h3>
                    <p className="text-xs text-gray-400">{provider.vehicleInfo}</p>
                  </div>
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleCall}
                  className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center"
                >
                  <Phone size={18} strokeWidth={1.5} />
                </motion.button>
              </div>
            </div>
            
            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3 hide-scrollbar"
            >
              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ 
                      type: 'spring', 
                      damping: 25, 
                      stiffness: 300,
                    }}
                  >
                    {message.sender === 'system' ? (
                      <SystemMessage message={message} />
                    ) : (
                      <MessageBubble 
                        message={message} 
                        isOwn={message.sender === 'user'} 
                      />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {/* Typing indicator */}
              <AnimatePresence>
                {isTyping && provider && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <TypingIndicator providerName={provider.name} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Chat Input */}
            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSend}
              isSending={isSending}
            />
          </motion.div>
        ) : (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center p-8 text-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
              className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4"
            >
              <Loader2 size={28} strokeWidth={1.5} className="text-amber-400" />
            </motion.div>
            <h3 className="text-lg font-semibold text-white mb-2">
              {activeBooking.status === 'searching' ? 'Finding a Provider...' : 'Connecting...'}
            </h3>
            <p className="text-gray-400 text-sm">
              Chat will be available once a provider accepts your request
            </p>
          </motion.div>
        )}
      </motion.div>
      
      {/* Quick Actions (when chat is active) */}
      {chatEnabled && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-4 flex gap-2"
        >
          {['On my way', "I'm here", 'Running late', 'Need help'].map((text, index) => (
            <motion.button
              key={text}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.05 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setInputValue(text)}
              className="px-3 py-2 bg-white/5 rounded-xl text-xs text-gray-400 border border-white/5 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors"
            >
              {text}
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  )
}

