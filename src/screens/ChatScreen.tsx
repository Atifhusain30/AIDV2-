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
  CheckCircle2,
  XCircle,
  Wrench,
  MapPin,
  Navigation,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

// Types
type ServiceStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read'
type MessageType = 'text' | 'image' | 'location' | 'system'

interface Provider {
  id: string
  name: string
  initials: string
  rating: number
  vehicleInfo: string
  eta: number | null
  isOnline: boolean
}

interface Message {
  id: string
  senderId: string
  senderType: 'customer' | 'provider' | 'system'
  content: string
  timestamp: Date
  status: MessageStatus
  type: MessageType
}

interface ServiceRequest {
  id: string
  status: ServiceStatus
  serviceType: string
  provider: Provider | null
  createdAt: Date
  acceptedAt: Date | null
  completedAt: Date | null
}

// Sample data - In production, this would come from your store/API
const sampleProvider: Provider = {
  id: 'prov_456',
  name: 'Mike Rodriguez',
  initials: 'MR',
  rating: 4.9,
  vehicleInfo: 'White Ford F-150',
  eta: 5,
  isOnline: true,
}

const sampleMessages: Message[] = [
  {
    id: 'msg_1',
    senderId: 'system',
    senderType: 'system',
    content: 'Mike Rodriguez accepted your request',
    timestamp: new Date(Date.now() - 600000),
    status: 'read',
    type: 'system',
  },
  {
    id: 'msg_2',
    senderId: 'prov_456',
    senderType: 'provider',
    content: "Hi! I'm on my way. I should be there in about 8 minutes.",
    timestamp: new Date(Date.now() - 540000),
    status: 'read',
    type: 'text',
  },
  {
    id: 'msg_3',
    senderId: 'cust_001',
    senderType: 'customer',
    content: "Great, thank you! I'm in the parking lot near the entrance.",
    timestamp: new Date(Date.now() - 480000),
    status: 'read',
    type: 'text',
  },
  {
    id: 'msg_4',
    senderId: 'prov_456',
    senderType: 'provider',
    content: 'Perfect, I see the location. Look for a white Ford F-150.',
    timestamp: new Date(Date.now() - 420000),
    status: 'read',
    type: 'text',
  },
  {
    id: 'msg_5',
    senderId: 'system',
    senderType: 'system',
    content: 'Mike is arriving now',
    timestamp: new Date(Date.now() - 60000),
    status: 'read',
    type: 'system',
  },
]

// For demo, toggle this to see different states
const sampleService: ServiceRequest = {
  id: 'sr_123',
  status: 'in_progress', // Change to 'pending', 'completed', 'cancelled' to see different states
  serviceType: 'Battery Jump',
  provider: sampleProvider,
  createdAt: new Date(Date.now() - 900000),
  acceptedAt: new Date(Date.now() - 600000),
  completedAt: null,
}

// Helper functions
const isChatEnabled = (status: ServiceStatus): boolean => {
  return status === 'accepted' || status === 'in_progress'
}

interface LockedStateConfig {
  type: 'no_service' | 'pending' | 'completed' | 'cancelled'
  title: string
  message: string
  action: string | null
}

const getLockedStateConfig = (service: ServiceRequest | null): LockedStateConfig | null => {
  if (!service) {
    return {
      type: 'no_service',
      title: 'No Active Service',
      message: 'Chat is available when you have an ongoing service request.',
      action: 'Request Service',
    }
  }
  
  switch (service.status) {
    case 'pending':
      return {
        type: 'pending',
        title: 'Finding a Provider',
        message: 'Chat will be available once a provider accepts your request.',
        action: null,
      }
    case 'completed':
      return {
        type: 'completed',
        title: 'Service Completed',
        message: 'This chat session has ended. Thank you for using AID!',
        action: 'Rate Your Experience',
      }
    case 'cancelled':
      return {
        type: 'cancelled',
        title: 'Service Cancelled',
        message: 'This service request was cancelled.',
        action: 'Request New Service',
      }
    default:
      return null
  }
}

const formatMessageTime = (date: Date) => {
  return date.toLocaleTimeString('en-US', {
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
function SystemMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-center my-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white/5 px-4 py-2 rounded-full border border-white/5"
      >
        <p className="text-xs text-gray-400 text-center">{message.content}</p>
      </motion.div>
    </div>
  )
}

// Message Bubble Component
function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const formattedTime = formatMessageTime(message.timestamp)

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
          <p className="text-[15px] leading-relaxed">{message.content}</p>
        </div>
        
        {/* Timestamp and status */}
        <div className={`flex items-center gap-1.5 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[11px] text-gray-500">{formattedTime}</span>
          {isOwn && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
            >
              {message.status === 'sending' && (
                <Loader2 size={12} className="text-gray-500 animate-spin" />
              )}
              {message.status === 'sent' && (
                <Check size={12} className="text-gray-500" />
              )}
              {message.status === 'delivered' && (
                <CheckCheck size={12} className="text-gray-500" />
              )}
              {message.status === 'read' && (
                <CheckCheck size={12} className="text-emerald-400" />
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

// Chat Locked State Component
function ChatLockedState({ 
  config, 
  onAction 
}: { 
  config: LockedStateConfig
  onAction?: () => void 
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col items-center justify-center px-8 text-center"
    >
      {/* Icon based on type */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.1 }}
        className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
          config.type === 'no_service' ? 'bg-white/5' :
          config.type === 'pending' ? 'bg-amber-500/10' :
          config.type === 'completed' ? 'bg-emerald-500/10' :
          'bg-red-500/10'
        }`}
      >
        {config.type === 'no_service' && <MessageCircle size={32} strokeWidth={1.5} className="text-gray-500" />}
        {config.type === 'pending' && (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
          >
            <Loader2 size={32} strokeWidth={1.5} className="text-amber-400" />
          </motion.div>
        )}
        {config.type === 'completed' && <CheckCircle2 size={32} strokeWidth={1.5} className="text-emerald-400" />}
        {config.type === 'cancelled' && <XCircle size={32} strokeWidth={1.5} className="text-red-400" />}
      </motion.div>
      
      <motion.h3
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-xl font-semibold text-white mb-2"
      >
        {config.title}
      </motion.h3>
      
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-gray-400 mb-8 max-w-xs"
      >
        {config.message}
      </motion.p>
      
      {config.action && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onAction}
          className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 px-8 rounded-xl shadow-lg shadow-emerald-500/20"
        >
          {config.action}
        </motion.button>
      )}
    </motion.div>
  )
}

// Chat Header Component
function ChatHeader({ provider, onCall }: { provider: Provider; onCall: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm border-b border-white/10 px-4 py-3 rounded-t-2xl"
    >
      <div className="flex items-center gap-3">
        {/* Provider info */}
        <div className="flex items-center gap-3 flex-1">
          <div className="relative">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-sm font-semibold text-white">
              {provider.initials}
            </div>
            {/* Online indicator */}
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
        
        {/* Call button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onCall}
          className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center"
        >
          <Phone size={18} strokeWidth={1.5} />
        </motion.button>
      </div>
    </motion.div>
  )
}

// Service Status Bar Component
function ServiceStatusBar({ service, provider }: { service: ServiceRequest; provider: Provider }) {
  return (
    <AnimatePresence>
      {service.status === 'accepted' && provider.eta !== null && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2.5 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-2 h-2 bg-emerald-400 rounded-full"
            />
            <Navigation size={14} strokeWidth={1.5} className="text-emerald-400" />
            <span className="text-sm text-emerald-400">
              {provider.eta === 0 ? 'Arriving now' : `Arriving in ${provider.eta} min`}
            </span>
          </div>
          <button className="text-xs text-emerald-400 underline">Track on map</button>
        </motion.div>
      )}
      
      {service.status === 'in_progress' && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center gap-2"
        >
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <Wrench size={14} strokeWidth={1.5} className="text-amber-400" />
          </motion.div>
          <span className="text-sm text-amber-400">Service in progress — {service.serviceType}</span>
        </motion.div>
      )}
    </AnimatePresence>
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

// Main Chat Screen Component
export default function ChatScreen() {
  const { setCurrentScreen, setActiveModal } = useAppStore()
  
  // State
  const [activeService] = useState<ServiceRequest | null>(sampleService)
  const [messages, setMessages] = useState<Message[]>(sampleMessages)
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isSending, setIsSending] = useState(false)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Check if chat is enabled
  const chatEnabled = activeService ? isChatEnabled(activeService.status) : false
  const lockedConfig = !chatEnabled ? getLockedStateConfig(activeService) : null
  
  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages])
  
  // Simulate typing indicator occasionally
  useEffect(() => {
    if (!chatEnabled) return
    
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        setIsTyping(true)
        setTimeout(() => setIsTyping(false), 2000)
      }
    }, 8000)
    
    return () => clearInterval(interval)
  }, [chatEnabled])
  
  // Handle send message
  const handleSend = async () => {
    if (!inputValue.trim() || isSending || !chatEnabled) return
    
    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      senderId: 'cust_001',
      senderType: 'customer',
      content: inputValue.trim(),
      timestamp: new Date(),
      status: 'sending',
      type: 'text',
    }
    
    setMessages(prev => [...prev, newMessage])
    setInputValue('')
    setIsSending(true)
    
    // Simulate sending delay
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Update to sent
    setMessages(prev => 
      prev.map(m => m.id === newMessage.id ? { ...m, status: 'sent' } : m)
    )
    
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Update to delivered
    setMessages(prev => 
      prev.map(m => m.id === newMessage.id ? { ...m, status: 'delivered' } : m)
    )
    
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Update to read
    setMessages(prev => 
      prev.map(m => m.id === newMessage.id ? { ...m, status: 'read' } : m)
    )
    
    setIsSending(false)
    
    // Simulate provider response
    if (Math.random() > 0.5) {
      setIsTyping(true)
      setTimeout(() => {
        setIsTyping(false)
        const providerResponse: Message = {
          id: `msg_${Date.now()}`,
          senderId: 'prov_456',
          senderType: 'provider',
          content: getRandomResponse(),
          timestamp: new Date(),
          status: 'read',
          type: 'text',
        }
        setMessages(prev => [...prev, providerResponse])
      }, 2000)
    }
  }
  
  // Handle locked state actions
  const handleLockedAction = () => {
    if (lockedConfig?.type === 'no_service' || lockedConfig?.type === 'cancelled') {
      setCurrentScreen('home')
      setActiveModal('services')
    }
  }

  const handleCall = () => {
    // In production, this would initiate an in-app call
    console.log('Initiating call...')
  }

  return (
    <div className="max-w-md mx-auto px-5 py-6 flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4"
      >
        <h1 className="text-xl font-semibold text-white mb-1">Messages</h1>
        <p className="text-white/40 text-sm">
          {chatEnabled ? `Chat with ${activeService?.provider?.name}` : 'Service communication'}
        </p>
      </motion.div>
      
      {/* Main Chat Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex-1 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 flex flex-col overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {chatEnabled && activeService?.provider ? (
            <motion.div
              key="chat-active"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex-1 flex flex-col"
            >
              {/* Chat Header */}
              <ChatHeader provider={activeService.provider} onCall={handleCall} />
              
              {/* Service Status Bar */}
              <ServiceStatusBar service={activeService} provider={activeService.provider} />
              
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
                      {message.type === 'system' ? (
                        <SystemMessage message={message} />
                      ) : (
                        <MessageBubble 
                          message={message} 
                          isOwn={message.senderType === 'customer'} 
                        />
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                
                {/* Typing indicator */}
                <AnimatePresence>
                  {isTyping && activeService.provider && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <TypingIndicator providerName={activeService.provider.name} />
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
              key="chat-locked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex"
            >
              {lockedConfig && (
                <ChatLockedState 
                  config={lockedConfig} 
                  onAction={handleLockedAction} 
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
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

// Helper for simulated responses
function getRandomResponse(): string {
  const responses = [
    "Got it! I'll be there soon.",
    "Thanks for letting me know!",
    "Perfect, see you in a few minutes.",
    "Understood. I'm about 2 minutes away.",
    "Great, I can see your location on the map.",
  ]
  return responses[Math.floor(Math.random() * responses.length)]
}
