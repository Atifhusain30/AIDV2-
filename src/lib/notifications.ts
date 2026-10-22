/**
 * Local Push Notifications Helper
 * Uses Capacitor Local Notifications plugin
 * Gracefully no-ops on web where plugin isn't available
 */

import { LocalNotifications } from '@capacitor/local-notifications'

// Check if the plugin is available (won't work on web without native setup)
const isNotificationsAvailable = (): boolean => {
  try {
    return !!LocalNotifications && typeof LocalNotifications.schedule === 'function'
  } catch {
    return false
  }
}

/**
 * Generate a stable notification ID from bookingId and status
 * Converts string to a number hash for the notification ID
 */
const generateNotificationId = (bookingId: string, status: string): number => {
  const combined = `${bookingId}-${status}`
  let hash = 0
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  // Ensure positive and within reasonable range
  return Math.abs(hash) % 1000000
}

/**
 * Initialize notifications - request permission and create channel
 * Call this once on app startup
 */
export async function initNotifications(): Promise<void> {
  if (!isNotificationsAvailable()) {
    console.log('[Notifications] Plugin not available (web mode)')
    return
  }

  try {
    // Request permission
    const permResult = await LocalNotifications.requestPermissions()
    console.log('[Notifications] Permission status:', permResult.display)

    // Create Android notification channel
    try {
      await LocalNotifications.createChannel({
        id: 'aid-booking-updates',
        name: 'AID Booking Updates',
        description: 'Notifications for booking status changes',
        importance: 4, // HIGH
        visibility: 1, // PUBLIC
        vibration: true,
        sound: 'default',
      })
      console.log('[Notifications] Android channel created')
    } catch (channelError) {
      // Channel creation may fail on iOS (not needed) or if already exists
      console.log('[Notifications] Channel creation skipped:', channelError)
    }
  } catch (error) {
    console.error('[Notifications] Init error:', error)
  }
}

/**
 * E6 sign-out: cancel scheduled booking notifications and remove the ones already shown, so the
 * next person on this phone never sees the previous person's job updates.
 */
export async function clearAllNotifications(): Promise<void> {
  if (!isNotificationsAvailable()) return
  try {
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map(({ id }) => ({ id })) })
    }
    await LocalNotifications.removeAllDeliveredNotifications()
  } catch {
    // Web or plugin unavailable: nothing was scheduled.
  }
}

/**
 * Parameters for booking update notification
 */
export interface NotifyBookingUpdateParams {
  bookingId: string
  status: string
  title: string
  body: string
}

/**
 * Schedule a local notification for a booking update
 */
export async function notifyBookingUpdate(params: NotifyBookingUpdateParams): Promise<void> {
  const { bookingId, status, title, body } = params

  if (!isNotificationsAvailable()) {
    console.log(`[Notifications] Would notify: ${title} - ${body}`)
    return
  }

  try {
    const notificationId = generateNotificationId(bookingId, status)

    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationId,
          title,
          body,
          // Schedule slightly in the future to ensure it fires
          schedule: { at: new Date(Date.now() + 200) },
          channelId: 'aid-booking-updates',
          extra: { bookingId, status },
        },
      ],
    })

    console.log(`[Notifications] Scheduled: ${title}`)
  } catch (error) {
    console.error('[Notifications] Schedule error:', error)
  }
}

/**
 * Notification templates for different booking statuses
 */
export interface NotificationTemplate {
  title: string
  body: string
}

export function getNotificationTemplate(
  status: string,
  serviceType: string,
  providerName?: string,
  providerETA?: number
): NotificationTemplate | null {
  const provider = providerName || 'Your provider'
  
  switch (status) {
    case 'accepted':
      return {
        title: 'Provider accepted ✅',
        body: providerETA 
          ? `${provider} accepted your ${serviceType} request. ETA ${providerETA} min.`
          : `${provider} accepted your ${serviceType} request.`,
      }
    case 'en_route':
      return {
        title: 'On the way 🚗',
        body: `${provider} is en route for ${serviceType}.`,
      }
    case 'arrived':
      return {
        title: 'Arrived 📍',
        body: `${provider} has arrived.`,
      }
    case 'completed':
      return {
        title: 'Completed 🎉',
        body: `${serviceType} service completed. Thanks for using AID!`,
      }
    case 'cancelled':
      return {
        title: 'Cancelled',
        body: `Your ${serviceType} request was cancelled.`,
      }
    default:
      // No notification for 'searching', 'pending', etc.
      return null
  }
}

/**
 * Register a handler for when user taps a notification
 * Call this ONCE from App.tsx on mount
 * 
 * @param onTap - Callback with bookingId when notification is tapped
 */
export function registerNotificationTapHandler(
  onTap: (bookingId: string) => void
): void {
  if (!isNotificationsAvailable()) {
    console.log('[Notifications] Tap handler not registered (web mode)')
    return
  }

  try {
    LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (event) => {
        console.log('[Notifications] Notification tapped:', event)
        
        const bookingId = event?.notification?.extra?.bookingId
        if (bookingId) {
          onTap(String(bookingId))
        } else {
          console.log('[Notifications] No bookingId in notification extra')
        }
      }
    )
    
    console.log('[Notifications] Tap handler registered')
  } catch (error) {
    console.error('[Notifications] Failed to register tap handler:', error)
  }
}
