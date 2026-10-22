/**
 * Shares the driver's GPS position with the server while they are on an active job,
 * so the customer can watch them arrive. Pure logic with injected GPS/upload functions.
 *
 * Throttling: first fix uploads immediately; then at most every 5 s while moving
 * (>= 15 m), and a heartbeat every 30 s while parked so the customer sees it's live.
 */

import type { BookingStatus } from '../types'

export const SHARE_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>(['accepted', 'en_route', 'arrived', 'in_progress'])

export type SharingStatus = 'off' | 'starting' | 'sharing' | 'denied' | 'error'

type Coords = { lat: number; lng: number }

interface SharerDeps {
  upload: (bookingId: string, location: Coords) => Promise<{ success: boolean; error?: string }>
  watch: (onLocation: (location: Coords) => void, onError: (error: Error) => void) => Promise<string>
  stopWatch: (watchId: string) => Promise<void>
  onStatus: (status: SharingStatus) => void
  onLocation?: (location: Coords) => void
  now?: () => number
}

const MIN_INTERVAL_MS = 5000
const HEARTBEAT_MS = 30000
const MIN_MOVE_METERS = 15

function metersBetween(a: Coords, b: Coords) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

const isPermissionError = (error: unknown) =>
  error instanceof Error && (/denied|permission|not authorized/i.test(error.message) || /0003|0007/.test(String((error as { code?: string }).code ?? '')))

export function createLocationSharer(deps: SharerDeps) {
  const now = deps.now ?? (() => Date.now())
  let bookingId: string | null = null
  let watchId: string | null = null
  let session = 0
  let last: { at: number; at_location: Coords } | null = null

  const shouldUpload = (location: Coords) => {
    if (!last) return true
    const elapsed = now() - last.at
    if (elapsed >= HEARTBEAT_MS) return true
    return elapsed >= MIN_INTERVAL_MS && metersBetween(last.at_location, location) >= MIN_MOVE_METERS
  }

  async function stop() {
    session += 1
    const id = watchId
    bookingId = null
    watchId = null
    last = null
    if (id) await deps.stopWatch(id)
    deps.onStatus('off')
  }

  async function start(nextBookingId: string) {
    if (bookingId === nextBookingId && watchId) return
    if (watchId) await stop()
    const mySession = ++session
    bookingId = nextBookingId
    deps.onStatus('starting')
    try {
      const id = await deps.watch(
        (location) => {
          if (mySession !== session || !bookingId) return
          deps.onLocation?.(location)
          deps.onStatus('sharing')
          if (!shouldUpload(location)) return
          last = { at: now(), at_location: location }
          const forBooking = bookingId
          void deps.upload(forBooking, { lat: location.lat, lng: location.lng }).then((result) => {
            if (mySession === session && !result.success) deps.onStatus('error')
          }, () => { if (mySession === session) deps.onStatus('error') })
        },
        () => { if (mySession === session) deps.onStatus('error') },
      )
      if (mySession !== session) { await deps.stopWatch(id); return }
      watchId = id
    } catch (error) {
      if (mySession !== session) return
      bookingId = null
      deps.onStatus(isPermissionError(error) ? 'denied' : 'error')
    }
  }

  return { start, stop }
}
