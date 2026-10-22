/**
 * Booking Service
 * Creates bookings through the API and mirrors the server's booking state into the customer UI.
 * Nothing here simulates a driver: matching, status and location all come from the server.
 *
 * Uses Zustand store via getState() - no React hooks
 */

import { useAppStore } from '../store/useAppStore'
import { Booking, Service, PriceBreakdown } from '../types'
import { apiService } from './api'
import { ACTIVE_REQUEST_CODE } from '../lib/jobLifecycle'

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
  store.setActiveRequestRedirect(false)
  
  // Add to history
  store.addToBookingHistory(booking)
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
  if (booking.status === 'cancelled' || booking.status === 'expired') {
    if (store.activeBooking?.id === booking.id) {
      store.setEndedBookingNotice(endedNotice(booking))
      store.clearActiveBooking()
    }
    return
  }
  store.setActiveBooking(booking)
}

/** What to tell the customer when their active request ended without them ending it in this app. */
function endedNotice(booking: Booking): NonNullable<ReturnType<typeof useAppStore.getState>['endedBookingNotice']> {
  const base = { bookingId: booking.id, serviceName: booking.service.name }
  // E4: the server closed it — no driver accepted in time, or the driver stopped responding.
  if (booking.status === 'expired') return { ...base, reason: 'expired' }
  if (booking.cancelledBy === 'system') return { ...base, reason: 'driver_unresponsive', driverName: booking.driver?.firstName }
  // The customer's own cancel in this app clears the booking directly, so this is usually the driver;
  // the server says who (cancelledBy), e.g. a cancel from the customer's other device.
  return {
    ...base,
    driverName: booking.cancelledBy === 'customer' ? undefined : booking.driver?.firstName,
    byCustomer: booking.cancelledBy === 'customer',
  }
}

/**
 * After the app was closed: if the request this device was following is no longer active on the
 * server, say how it ended (e.g. it expired with no driver) instead of silently dropping it.
 */
export async function settleStaleActiveBooking(previous: Booking | null, serverActive: Booking | null): Promise<void> {
  const store = useAppStore.getState()
  if (serverActive || !previous) {
    store.setActiveBooking(serverActive)
    return
  }
  const latest = await apiService.getBooking(previous.id)
  if (latest.success && latest.data && (latest.data.status === 'expired' || latest.data.status === 'cancelled')) {
    store.setActiveBooking(previous) // so the reconcile below recognises it and says how it ended
    reconcileManagedBooking(latest.data)
    return
  }
  if (latest.success && latest.data) store.updateBookingInHistory(latest.data.id, latest.data)
  store.setActiveBooking(null)
}

/** Thrown-free result of a request attempt: a new booking, or the one already in progress. */
export interface RequestOutcome {
  booking: Booking
  /** True when the customer already had an active request and was taken to it instead (E4). */
  alreadyActive: boolean
}

/**
 * Persist a booking through the authenticated API, then mirror it into the UI store.
 * The backend derives customer identity and pricing from the secure session and service catalog.
 * One active request per customer (E4): if the server says one is already in progress, that request
 * becomes the active one in the app and is returned with alreadyActive, rather than an error.
 */
export async function requestAndStartBooking(
  input: CreateBookingInput & { dropoffLocation?: { address: string; lat: number; lng: number } }
): Promise<RequestOutcome> {
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
  if (!result.success && result.code === ACTIVE_REQUEST_CODE) {
    const active = await apiService.getActiveBooking()
    if (active.success && active.data) {
      const store = useAppStore.getState()
      if (store.bookingHistory.some((item) => item.id === active.data!.id)) store.updateBookingInHistory(active.data.id, active.data)
      else store.addToBookingHistory(active.data)
      store.setActiveBooking(active.data)
      return { booking: active.data, alreadyActive: true }
    }
  }
  if (!result.success || !result.data) throw new Error(result.error || 'Unable to request service.')
  startBooking(result.data)
  return { booking: result.data, alreadyActive: false }
}
