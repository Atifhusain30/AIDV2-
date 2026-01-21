/**
 * Chat Service
 * Handles chat messaging: system messages, user messages, provider replies
 * 
 * Uses Zustand store via getState() - no React hooks
 */

import { useAppStore, hasProviderIntroMessage, MessageKind } from '../store/useAppStore'

// Provider reply templates
const PROVIDER_INTRO_TEMPLATES = [
  "Hey! This is {providerName}. I'm on my way. ETA ~{eta} minutes.",
  "{providerName} here — heading to you now. Be there in about {eta} minutes!",
  "On the way! Should arrive in about {eta} minutes. 👋",
  "Hi! I'm {providerName}. Heading your way, I'll be there in ~{eta} min.",
]

const PROVIDER_REPLY_TEMPLATES = [
  "Got it 👍",
  "On it — see you soon.",
  "Thanks! I'm about {eta} minutes away.",
  "Can you confirm you're in a safe spot?",
  "I'm pulling up shortly.",
  "Perfect, almost there!",
  "Sounds good! 🚗",
  "Understood, see you in a bit.",
]

// Active timers for provider replies (to prevent stacking)
const replyTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Helper to get random template and replace placeholders
 */
function getProviderMessage(templates: string[], providerName: string, eta: number): string {
  const template = templates[Math.floor(Math.random() * templates.length)]
  return template
    .replace('{providerName}', providerName)
    .replace('{eta}', String(eta))
}

/**
 * Append a system message to a booking's chat thread
 */
export function appendSystemMessage(
  bookingId: string,
  text: string,
  kind?: MessageKind
): void {
  const store = useAppStore.getState()
  
  // Check if this exact message already exists (prevent duplicates)
  const existingMessages = store.bookingMessages[bookingId] || []
  const isDuplicate = existingMessages.some(m => 
    m.sender === 'system' && 
    m.text === text &&
    m.meta?.kind === kind
  )
  
  if (isDuplicate) {
    console.log('[ChatService] Skipping duplicate system message:', text)
    return
  }
  
  store.appendMessage(bookingId, {
    sender: 'system',
    text,
    meta: kind ? { kind } : undefined,
  })
}

/**
 * Append a user message to a booking's chat thread
 */
export function appendUserMessage(bookingId: string, text: string): void {
  const store = useAppStore.getState()
  
  store.appendMessage(bookingId, {
    sender: 'user',
    text,
    meta: { kind: 'user_message' },
  })
}

/**
 * Append a provider message to a booking's chat thread
 */
export function appendProviderMessage(
  bookingId: string,
  text: string,
  kind: 'provider_intro' | 'provider_auto_reply'
): void {
  const store = useAppStore.getState()
  
  store.appendMessage(bookingId, {
    sender: 'provider',
    text,
    meta: { kind },
  })
}

/**
 * Schedule provider intro message after provider is assigned
 * Only sends once per booking
 */
export function scheduleProviderIntro(bookingId: string): void {
  // Check if intro already sent
  if (hasProviderIntroMessage(bookingId)) {
    console.log('[ChatService] Provider intro already sent for:', bookingId)
    return
  }
  
  const store = useAppStore.getState()
  const booking = store.activeBooking?.id === bookingId 
    ? store.activeBooking 
    : store.bookingHistory.find(b => b.id === bookingId)
  
  if (!booking?.mechanic) return
  
  // Clear any existing timer
  const existingTimer = replyTimers.get(bookingId)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }
  
  // Random delay between 1-3 seconds
  const delay = 1000 + Math.random() * 2000
  
  const timer = setTimeout(() => {
    // Re-check booking state
    const currentStore = useAppStore.getState()
    const currentBooking = currentStore.activeBooking?.id === bookingId 
      ? currentStore.activeBooking 
      : currentStore.bookingHistory.find(b => b.id === bookingId)
    
    if (!currentBooking || ['cancelled', 'completed'].includes(currentBooking.status)) {
      replyTimers.delete(bookingId)
      return
    }
    
    const providerName = currentBooking.mechanic?.name || 'Provider'
    const eta = currentBooking.mechanic?.eta || 8
    
    const text = getProviderMessage(PROVIDER_INTRO_TEMPLATES, providerName, eta)
    appendProviderMessage(bookingId, text, 'provider_intro')
    
    replyTimers.delete(bookingId)
  }, delay)
  
  replyTimers.set(bookingId, timer)
}

/**
 * Schedule a provider reply after user sends a message
 * @param bookingId Booking ID
 * @param _userText User's message text (reserved for future context-aware replies)
 * @returns Cleanup function to cancel the reply
 */
export function scheduleProviderReply(
  bookingId: string,
  _userText?: string
): () => void {
  const store = useAppStore.getState()
  const booking = store.activeBooking?.id === bookingId 
    ? store.activeBooking 
    : store.bookingHistory.find(b => b.id === bookingId)
  
  // Only reply if provider is assigned and status is appropriate
  if (!booking?.mechanic) {
    return () => {}
  }
  
  if (!['accepted', 'en_route', 'arrived'].includes(booking.status)) {
    return () => {}
  }
  
  // Clear any existing timer
  const existingTimer = replyTimers.get(bookingId)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }
  
  // Random delay between 1-3 seconds
  const delay = 1000 + Math.random() * 2000
  
  const timer = setTimeout(() => {
    // Re-check booking state
    const currentStore = useAppStore.getState()
    const currentBooking = currentStore.activeBooking?.id === bookingId 
      ? currentStore.activeBooking 
      : currentStore.bookingHistory.find(b => b.id === bookingId)
    
    if (!currentBooking || ['cancelled', 'completed'].includes(currentBooking.status)) {
      replyTimers.delete(bookingId)
      return
    }
    
    if (!currentBooking.mechanic) {
      replyTimers.delete(bookingId)
      return
    }
    
    const providerName = currentBooking.mechanic.name || 'Provider'
    const eta = currentBooking.providerETA || currentBooking.mechanic.eta || 8
    
    const text = getProviderMessage(PROVIDER_REPLY_TEMPLATES, providerName, eta)
    appendProviderMessage(bookingId, text, 'provider_auto_reply')
    
    replyTimers.delete(bookingId)
  }, delay)
  
  replyTimers.set(bookingId, timer)
  
  // Return cleanup function
  return () => {
    const timer = replyTimers.get(bookingId)
    if (timer) {
      clearTimeout(timer)
      replyTimers.delete(bookingId)
    }
  }
}

/**
 * Check if provider can reply to messages for a booking
 */
export function canProviderReply(bookingId: string): boolean {
  const store = useAppStore.getState()
  const booking = store.activeBooking?.id === bookingId 
    ? store.activeBooking 
    : store.bookingHistory.find(b => b.id === bookingId)
  
  if (!booking?.mechanic) return false
  
  return ['accepted', 'en_route', 'arrived'].includes(booking.status)
}

/**
 * Clean up any pending reply timers for a booking
 */
export function cleanupReplyTimers(bookingId: string): void {
  const timer = replyTimers.get(bookingId)
  if (timer) {
    clearTimeout(timer)
    replyTimers.delete(bookingId)
  }
}

/**
 * Clean up all reply timers (for app cleanup)
 */
export function cleanupAllTimers(): void {
  replyTimers.forEach((timer) => clearTimeout(timer))
  replyTimers.clear()
}
