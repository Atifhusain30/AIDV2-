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
    if (store.activeBooking?.id === booking.id) {
      // The customer's own cancel in this app clears the booking directly, so this is usually the driver;
      // the server says who (cancelledBy), e.g. a cancel from the customer's other device.
      store.setEndedBookingNotice({
        bookingId: booking.id, serviceName: booking.service.name,
        driverName: booking.cancelledBy === 'customer' ? undefined : booking.driver?.firstName,
        byCustomer: booking.cancelledBy === 'customer',
      })
      store.clearActiveBooking()
    }
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
