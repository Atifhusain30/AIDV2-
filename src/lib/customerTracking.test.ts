import { describe, expect, it } from 'vitest'
import { arrivalClock, driverTracking, driverVehicleLabel, ETA_MAX_AGE_MS, formatAge, STALE_AFTER_MS } from './customerTracking'
import type { Booking } from '../types'

const NOW = Date.parse('2026-10-22T19:00:00Z')
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const eta = { miles: 3.4, minutes: 7, approximate: true as const, fromLocationAt: at(10_000) }
const booking = (overrides: Partial<Booking> = {}) => ({
  status: 'en_route' as Booking['status'],
  driverLocation: { lat: 33.1, lng: -97, updatedAt: at(10_000) },
  driverEta: eta,
  ...overrides,
})

describe('customer driver tracking', () => {
  it('is live with the server ETA while the driver is heading over with a fresh position', () => {
    expect(driverTracking(booking(), NOW)).toEqual({ phase: 'live', location: { lat: 33.1, lng: -97 }, ageMs: 10_000, eta })
    expect(driverTracking(booking({ status: 'accepted' }), NOW).phase).toBe('live')
  })

  it('waits for a location instead of inventing one', () => {
    const t = driverTracking(booking({ status: 'accepted', driverLocation: undefined, driverEta: undefined }), NOW)
    expect(t).toEqual({ phase: 'waiting_location', location: null, ageMs: null, eta: null })
  })

  it('marks the position stale after the driver stops sharing, and drops the ETA once it is too old', () => {
    const stale = driverTracking(booking({ driverLocation: { lat: 33.1, lng: -97, updatedAt: at(STALE_AFTER_MS + 1000) } }), NOW)
    expect(stale.phase).toBe('stale')
    expect(stale.eta).toEqual(eta)
    const old = driverTracking(booking({ driverLocation: { lat: 33.1, lng: -97, updatedAt: at(ETA_MAX_AGE_MS + 1000) } }), NOW)
    expect(old.phase).toBe('stale')
    expect(old.location).toEqual({ lat: 33.1, lng: -97 })
    expect(old.eta).toBeNull()
  })

  it('treats a position without a timestamp as stale', () => {
    const t = driverTracking(booking({ driverLocation: { lat: 33.1, lng: -97 } }), NOW)
    expect(t.phase).toBe('stale')
    expect(t.ageMs).toBeNull()
    expect(t.eta).toBeNull()
  })

  it('tolerates the phone clock being slightly behind the server', () => {
    expect(driverTracking(booking({ driverLocation: { lat: 33.1, lng: -97, updatedAt: at(-5000) } }), NOW).ageMs).toBe(0)
  })

  it('shows no ETA after arrival, during service, or once the job is over', () => {
    expect(driverTracking(booking({ status: 'arrived' }), NOW)).toMatchObject({ phase: 'arrived', eta: null })
    expect(driverTracking(booking({ status: 'in_progress' }), NOW)).toMatchObject({ phase: 'in_service', eta: null })
    expect(driverTracking(booking({ status: 'cancelled' }), NOW)).toEqual({ phase: 'ended', location: null, ageMs: null, eta: null })
    expect(driverTracking(booking({ status: 'completed' }), NOW).phase).toBe('ended')
  })

  it('formats ages and vehicles for people', () => {
    expect(formatAge(3000)).toBe('just now')
    expect(formatAge(45_000)).toBe('45 sec ago')
    expect(formatAge(185_000)).toBe('3 min ago')
    expect(formatAge(2 * 3_600_000)).toBe('2 hr ago')
    expect(driverVehicleLabel({ make: 'Ford', model: 'F-550', color: 'White', plate: 'TOW-77' })).toBe('White Ford F-550')
    expect(driverVehicleLabel({ make: 'Ford', model: 'F-550', color: '', plate: '' })).toBe('Ford F-550')
    expect(driverVehicleLabel(null)).toBeNull()
  })

  it('projects the arrival time from when the location was taken, never in the past', () => {
    const fromNow = new Date(NOW + 7 * 60_000 - 10_000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    expect(arrivalClock(eta, NOW)).toBe(fromNow)
    const overdue = { ...eta, minutes: 1, fromLocationAt: at(5 * 60_000) }
    expect(arrivalClock(overdue, NOW)).toBe(new Date(NOW).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
  })
})
