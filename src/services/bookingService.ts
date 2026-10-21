/**
 * Booking Service
 * Handles booking lifecycle: creation, status updates, provider matching, tracking
 * 
 * Uses Zustand store via getState() - no React hooks
 */

import { useAppStore } from '../store/useAppStore'
import { Booking, BookingStatus, Service, PriceBreakdown } from '../types'
import { notifyBookingUpdate, getNotificationTemplate } from '../lib/notifications'
import * as chatService from './chatService'
import { apiService } from './api'

// Types for booking creation input
export interface CreateBookingInput {
  service: Service
  notes?: string
  locationLabel: string
  locationCoords: { lat: number; lng: number }
  priceBreakdown?: PriceBreakdown
  paymentMethodLabel?: string
}

/**
 * Start a new booking - sets it as active and adds to history
 */
export function startBooking(booking: Booking): void {
  const store = useAppStore.getState()
  
  // Set as active booking
  store.setActiveBooking(booking)
  
  // Add to history
  store.addToBookingHistory(booking)
  
  // Initialize chat thread with system message
  chatService.appendSystemMessage(booking.id, 'Searching for a provider near you...', 'status_update')
}

/** Mirror an authoritative managed booking update into customer UI state. */
export function reconcileManagedBooking(booking: Booking): void {
  const store = useAppStore.getState()
  store.updateBookingInHistory(booking.id, booking)
  if (booking.status === 'completed') {
    store.openReceipt(booking.id)
    if (store.activeBooking?.id === booking.id) store.clearActiveBooking()
    return
  }
  if (booking.status === 'cancelled') {
    if (store.activeBooking?.id === booking.id) store.clearActiveBooking()
    return
  }
  store.setActiveBooking(booking)
}

/**
 * Persist a booking through the authenticated API, then mirror it into the UI store.
 * The backend derives customer identity and pricing from the secure session and service catalog.
 */
export async function requestAndStartBooking(
  input: CreateBookingInput & { dropoffLocation?: { address: string; lat: number; lng: number } }
): Promise<Booking> {
  const { activeVehicleId } = useAppStore.getState()
  const result = await apiService.createBooking({
    serviceType: input.service.id,
    vehicleId: activeVehicleId,
    location: {
      address: input.locationLabel,
      lat: input.locationCoords.lat,
      lng: input.locationCoords.lng,
    },
    dropoffLocation: input.dropoffLocation,
    notes: input.notes,
  })
  if (!result.success || !result.data) throw new Error(result.error || 'Unable to request service.')
  startBooking(result.data)
  return result.data
}

/**
 * Update booking status with optional additional fields
 */
export function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
  patch?: Partial<Booking>
): void {
  const store = useAppStore.getState()
  const activeBooking = store.activeBooking
  
  // Update active booking if it matches
  if (activeBooking?.id === bookingId) {
    store.updateActiveBookingStatus(status, patch)
  }
  
  // Always update in history
  store.updateBookingInHistory(bookingId, { status, ...patch })
  
  // Trigger notification for status change
  triggerStatusNotification(bookingId, status)
}

/**
 * Assign a provider to a booking (uses store's matchProviderForBooking)
 */
export function assignProvider(bookingId: string): void {
  const store = useAppStore.getState()
  
  // Match provider from mechanics list
  store.matchProviderForBooking(bookingId)
  
  // Get updated booking to send provider intro
  const updatedBooking = store.activeBooking?.id === bookingId 
    ? store.activeBooking 
    : store.bookingHistory.find(b => b.id === bookingId)
  
  if (updatedBooking?.mechanic) {
    // Add system message for acceptance
    chatService.appendSystemMessage(
      bookingId,
      `${updatedBooking.mechanic.name} accepted your request`,
      'status_update'
    )
    
    // Schedule provider intro message
    chatService.scheduleProviderIntro(bookingId)
  }
}

/**
 * Initialize provider coordinates when transitioning to en_route
 */
export function initializeProviderTracking(bookingId: string): void {
  const store = useAppStore.getState()
  const booking = store.activeBooking?.id === bookingId 
    ? store.activeBooking 
    : store.bookingHistory.find(b => b.id === bookingId)
  
  if (!booking) return
  
  // Initialize provider start position (slightly away from user)
  const userCoords = booking.location
  const startCoords = {
    lat: userCoords.lat + (Math.random() * 0.01 - 0.005),
    lng: userCoords.lng + (Math.random() * 0.01 - 0.005),
  }
  const initialETA = 12
  
  updateBookingStatus(bookingId, 'en_route', {
    providerCoords: startCoords,
    providerETA: initialETA,
  })
  
  // Add system message
  const providerName = booking.mechanic?.name || 'Your provider'
  chatService.appendSystemMessage(bookingId, `${providerName} is on their way`, 'status_update')
}

// Store initial distance for ETA calculation
const trackingState = new Map<string, { initialDistance: number; intervalId: ReturnType<typeof setInterval> }>()

/**
 * Start provider tracking simulation
 * Returns a cleanup function to stop tracking
 */
export function startProviderTracking(bookingId: string): () => void {
  const store = useAppStore.getState()
  
  // Calculate distance helper
  const calculateDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) => {
    return Math.sqrt(Math.pow(p1.lat - p2.lat, 2) + Math.pow(p1.lng - p2.lng, 2))
  }
  
  // Get current booking state
  const booking = store.activeBooking?.id === bookingId 
    ? store.activeBooking 
    : store.bookingHistory.find(b => b.id === bookingId)
  
  if (!booking?.providerCoords) {
    return () => {}
  }
  
  // Calculate and store initial distance
  const initialDistance = calculateDistance(booking.providerCoords, booking.location)
  
  // Tracking interval - update every 3 seconds
  const intervalId = setInterval(() => {
    const currentStore = useAppStore.getState()
    const currentBooking = currentStore.activeBooking?.id === bookingId 
      ? currentStore.activeBooking 
      : currentStore.bookingHistory.find(b => b.id === bookingId)
    
    if (!currentBooking || currentBooking.status !== 'en_route' || !currentBooking.providerCoords) {
      stopProviderTracking(bookingId)
      return
    }
    
    const currentProviderPos = currentBooking.providerCoords
    const targetPos = currentBooking.location
    
    // Calculate remaining distance
    const remainingDistance = calculateDistance(currentProviderPos, targetPos)
    
    // Check if arrived (within ~30 meters)
    if (remainingDistance < 0.0003) {
      stopProviderTracking(bookingId)
      
      // Trigger arrived status
      updateBookingStatus(bookingId, 'arrived', {
        providerCoords: targetPos,
        providerETA: 0,
      })
      
      // Add system message for arrival
      const providerName = currentBooking.mechanic?.name || 'Your provider'
      chatService.appendSystemMessage(
        bookingId,
        `${providerName} has arrived at your location!`,
        'status_update'
      )
      
      return
    }
    
    // Move provider closer (20% of remaining distance per tick)
    const moveRatio = 0.2
    const nextPos = {
      lat: currentProviderPos.lat + (targetPos.lat - currentProviderPos.lat) * moveRatio,
      lng: currentProviderPos.lng + (targetPos.lng - currentProviderPos.lng) * moveRatio,
    }
    
    // Calculate new ETA based on remaining distance
    const progressRatio = remainingDistance / initialDistance
    const newETA = Math.max(1, Math.round(12 * progressRatio))
    
    // Update provider position and ETA
    currentStore.updateActiveBookingStatus('en_route', {
      providerCoords: nextPos,
      providerETA: newETA,
    })
    currentStore.updateBookingInHistory(bookingId, {
      providerCoords: nextPos,
      providerETA: newETA,
    })
  }, 3000)
  
  // Store tracking state
  trackingState.set(bookingId, { initialDistance, intervalId })
  
  // Return cleanup function
  return () => stopProviderTracking(bookingId)
}

/**
 * Stop provider tracking for a booking
 */
export function stopProviderTracking(bookingId: string): void {
  const state = trackingState.get(bookingId)
  if (state) {
    clearInterval(state.intervalId)
    trackingState.delete(bookingId)
  }
}

/**
 * Complete a booking
 */
export function completeBooking(bookingId: string): void {
  const store = useAppStore.getState()
  
  // Stop any active tracking
  stopProviderTracking(bookingId)
  
  // Update status
  store.updateBookingInHistory(bookingId, { 
    status: 'completed', 
    completedAt: new Date() 
  })
  
  // Open receipt
  store.openReceipt(bookingId)
  
  // Clear active booking if it matches
  if (store.activeBooking?.id === bookingId) {
    store.clearActiveBooking()
  }
  
  // Trigger notification
  triggerStatusNotification(bookingId, 'completed')
}

/**
 * Cancel a booking
 */
export function cancelBooking(bookingId: string): void {
  const store = useAppStore.getState()
  
  // Stop any active tracking
  stopProviderTracking(bookingId)
  
  // Update status
  store.updateBookingInHistory(bookingId, { status: 'cancelled' })
  
  // Clear active booking if it matches
  if (store.activeBooking?.id === bookingId) {
    store.clearActiveBooking()
  }
  
  // Trigger notification
  triggerStatusNotification(bookingId, 'cancelled')
}

/**
 * Trigger push notification for status change
 */
async function triggerStatusNotification(
  bookingId: string,
  status: BookingStatus
): Promise<void> {
  const store = useAppStore.getState()
  
  // Check if already notified for this status
  const lastNotified = store.lastNotifiedStatusByBooking[bookingId]
  if (lastNotified === status) return
  
  // Get booking info for notification
  const booking = store.bookingHistory.find(b => b.id === bookingId)
  if (!booking) return
  
  const serviceType = booking.service.name
  const providerName = booking.mechanic?.name
  const providerETA = booking.providerETA || booking.mechanic?.eta
  
  // Get notification template
  const template = getNotificationTemplate(status, serviceType, providerName, providerETA)
  if (!template) return
  
  // Send notification
  await notifyBookingUpdate({
    bookingId,
    status,
    title: template.title,
    body: template.body,
  })
  
  // Mark as notified
  store.setLastNotifiedStatus(bookingId, status)
}
