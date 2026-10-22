import { beforeEach, describe, expect, it, vi } from 'vitest'

const geo = vi.hoisted(() => ({ getCurrentPosition: vi.fn(), requestPermissions: vi.fn() }))
vi.mock('@capacitor/geolocation', () => ({ Geolocation: geo }))
vi.mock('../services/api', () => ({ apiService: { getServiceRequests: vi.fn(), updateDriverOnlineStatus: vi.fn() } }))

import { formatDistance, locateDriver } from './nearbyRequests'
import { apiService } from '../services/api'
import { useDriverStore } from '../store/useDriverStore'
import { useAuthStore } from '../store/useAuthStore'

describe('formatDistance', () => {
  it('shows miles with one decimal under 10, whole miles above', () => {
    expect(formatDistance(3.24)).toBe('3.2 mi away')
    expect(formatDistance(0.05)).toBe('Under 0.1 mi away')
    expect(formatDistance(12.6)).toBe('13 mi away')
    expect(formatDistance(undefined)).toBeNull()
    expect(formatDistance(Number.NaN)).toBeNull()
  })
})

describe('locateDriver', () => {
  beforeEach(() => vi.clearAllMocks())

  it('takes one battery-friendly fix (coarse accuracy, reuses a fix up to a minute old)', async () => {
    geo.getCurrentPosition.mockResolvedValue({ coords: { latitude: 32.7, longitude: -96.8 } })
    expect(await locateDriver()).toEqual({ ok: true, lat: 32.7, lng: -96.8 })
    expect(geo.getCurrentPosition).toHaveBeenCalledWith({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
  })

  it('tells a denied permission apart from no GPS signal', async () => {
    geo.getCurrentPosition.mockRejectedValueOnce(new Error('Location permission was denied'))
    expect(await locateDriver()).toEqual({ ok: false, problem: 'denied' })
    geo.getCurrentPosition.mockRejectedValueOnce(new Error('Timeout expired'))
    expect(await locateDriver()).toEqual({ ok: false, problem: 'unavailable' })
  })
})

describe('driver store nearby requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDriverStore.setState({ isOnline: true, incomingRequests: [], nearbyStatus: 'idle', locationProblem: null, requestRadiusMiles: null, error: null })
  })

  it('sends the current position and keeps the server order (nearest first)', async () => {
    geo.getCurrentPosition.mockResolvedValue({ coords: { latitude: 32.7, longitude: -96.8 } })
    const requests = [{ id: 'a', distanceMiles: 1.2 }, { id: 'b', distanceMiles: 7.5 }]
    vi.mocked(apiService.getServiceRequests).mockResolvedValue({ success: true, data: { status: 'ok', radiusMiles: 25, requests } } as never)
    await useDriverStore.getState().fetchIncomingRequests()
    expect(apiService.getServiceRequests).toHaveBeenCalledWith({ lat: 32.7, lng: -96.8 })
    const state = useDriverStore.getState()
    expect(state.incomingRequests.map((r) => r.id)).toEqual(['a', 'b'])
    expect(state.nearbyStatus).toBe('ok')
    expect(state.requestRadiusMiles).toBe(25)
  })

  it('without a fix, asks the server anyway and records why the phone could not locate', async () => {
    geo.getCurrentPosition.mockRejectedValue(new Error('User denied permission'))
    vi.mocked(apiService.getServiceRequests).mockResolvedValue({ success: true, data: { status: 'location_required', radiusMiles: 25, requests: [] } } as never)
    await useDriverStore.getState().fetchIncomingRequests()
    expect(apiService.getServiceRequests).toHaveBeenCalledWith(undefined)
    expect(useDriverStore.getState().nearbyStatus).toBe('location_required')
    expect(useDriverStore.getState().locationProblem).toBe('denied')
  })

  it('does not locate or fetch while offline, and going offline clears the list', async () => {
    useDriverStore.setState({ isOnline: false })
    await useDriverStore.getState().fetchIncomingRequests()
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    expect(apiService.getServiceRequests).not.toHaveBeenCalled()

    useAuthStore.setState({ user: { id: 'driver-1', role: 'driver' } as never })
    vi.mocked(apiService.updateDriverOnlineStatus).mockResolvedValue({ success: true, data: { isOnline: false } })
    useDriverStore.setState({ isOnline: true, incomingRequests: [{ id: 'x' } as never], nearbyStatus: 'ok' })
    await useDriverStore.getState().setOnlineStatus(false)
    expect(useDriverStore.getState().incomingRequests).toEqual([])
    expect(useDriverStore.getState().nearbyStatus).toBe('idle')
  })
})
