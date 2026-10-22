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
 * Where the notification permission stands, without asking: 'prompt' = never answered,
 * 'unavailable' = web / plugin missing. Never shows a system prompt.
 */
export async function getNotificationPermission(): Promise<'prompt' | 'granted' | 'denied' | 'unavailable'> {
  if (!isNotificationsAvailable()) return 'unavailable'
  try {
    const { display } = await LocalNotifications.checkPermissions()
    if (display === 'granted' || display === 'denied') return display
    return 'prompt'
  } catch {
    return 'unavailable'
  }
}

/**
 * Request permission (shows the system prompt if never answered) and create the Android channel.
 * Only call this from a contextual moment — after the in-app explainer (src/lib/alertsPrompt.ts) or
 * when permission is already granted. Never on app start or sign-in.
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
