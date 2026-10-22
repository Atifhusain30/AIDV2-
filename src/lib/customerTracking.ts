/**
 * What the customer should see about their driver right now. Pure logic over the booking
 * the server returns (driver card, driverLocation with timestamp, approximate driverEta).
 *
 * The driver app uploads at least every 30 s while sharing (see jobLocationSharing.ts), so a
 * location older than STALE_AFTER_MS means sharing has paused (app closed, no signal, GPS off).
 */

import type { Booking, DriverEta, JobDriverVehicle } from '../types'

export const STALE_AFTER_MS = 90_000
/** Beyond this, the last position is too old to estimate an arrival from. */
export const ETA_MAX_AGE_MS = 10 * 60_000

export type TrackingPhase =
  | 'waiting_location' // accepted / en route, but no position shared yet
  | 'live'             // heading over, fresh position
  | 'stale'            // heading over, last position is old
  | 'arrived'
  | 'in_service'
  | 'ended'            // completed or cancelled

export interface DriverTracking {
  phase: TrackingPhase
  location: { lat: number; lng: number } | null
  /** Milliseconds since the driver's position was taken (null when unknown). */
  ageMs: number | null
  eta: DriverEta | null
}

const HEADING_OVER = new Set(['accepted', 'en_route'])

export function driverTracking(booking: Pick<Booking, 'status' | 'driverLocation' | 'driverEta'>, now: number): DriverTracking {
  const loc = booking.driverLocation
  const location = loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? { lat: loc.lat, lng: loc.lng } : null
  const takenAt = loc?.updatedAt ? Date.parse(loc.updatedAt) : NaN
  // Clamp small clock differences between phone and server.
  const ageMs = location && Number.isFinite(takenAt) ? Math.max(0, now - takenAt) : null

  if (booking.status === 'completed' || booking.status === 'cancelled') return { phase: 'ended', location: null, ageMs: null, eta: null }
  if (booking.status === 'arrived') return { phase: 'arrived', location, ageMs, eta: null }
  if (booking.status === 'in_progress') return { phase: 'in_service', location, ageMs, eta: null }
  if (!HEADING_OVER.has(booking.status) || !location) return { phase: 'waiting_location', location: null, ageMs: null, eta: null }

  const stale = ageMs == null || ageMs > STALE_AFTER_MS
  const eta = booking.driverEta && ageMs != null && ageMs <= ETA_MAX_AGE_MS ? booking.driverEta : null
  return { phase: stale ? 'stale' : 'live', location, ageMs, eta }
}

/** "just now", "45 sec ago", "3 min ago", "2 hr ago". */
export function formatAge(ms: number): string {
  if (ms < 15_000) return 'just now'
  if (ms < 60_000) return `${Math.floor(ms / 1000)} sec ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`
  return `${Math.floor(ms / 3_600_000)} hr ago`
}

/** "White Ford F-550" — what to look for when the driver pulls up. */
export function driverVehicleLabel(vehicle: JobDriverVehicle | null | undefined): string | null {
  if (!vehicle) return null
  const label = [vehicle.color, vehicle.make, vehicle.model].map((part) => part?.trim()).filter(Boolean).join(' ')
  return label || null
}

/** Clock time the driver should arrive, e.g. "2:47 PM". */
export function arrivalClock(eta: DriverEta, now: number): string {
  const base = eta.fromLocationAt ? Date.parse(eta.fromLocationAt) : now
  const at = new Date(Math.max(now, (Number.isFinite(base) ? base : now) + eta.minutes * 60_000))
  return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
