/**
 * E6: one sign-out that leaves nothing of the person on the phone, triggered by Log Out, account
 * deletion, an ended session or any 401; and a different account never sees the previous one's data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking, Driver } from '../types'

const mocks = vi.hoisted(() => ({
  managedSignOut: vi.fn(async () => {}),
  restore: vi.fn(),
  signIn: vi.fn(),
  clearStoredSession: vi.fn(async () => {}),
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok-1' } }, error: null })),
  authListener: null as null | ((event: string, session: unknown) => void),
  stopWatchLocation: vi.fn(async () => {}),
  clearAllNotifications: vi.fn(async () => {}),
  clearGeocodingCache: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
        mocks.authListener = listener
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
    },
  },
  managedAuth: { signOut: mocks.managedSignOut, restore: mocks.restore, signIn: mocks.signIn },
  clearStoredSession: mocks.clearStoredSession,
}))
vi.mock('../services/location', () => ({ stopWatchLocation: mocks.stopWatchLocation, watchLocation: vi.fn() }))
vi.mock('../lib/notifications', () => ({ clearAllNotifications: mocks.clearAllNotifications }))
vi.mock('../lib/geocoding', () => ({ clearGeocodingCache: mocks.clearGeocodingCache }))

import { signOut, claimDeviceFor, installSessionWatch } from './signOut'
import { useAuthStore } from '../store/useAuthStore'
import { useAppStore } from '../store/useAppStore'
import { useDriverStore } from '../store/useDriverStore'
import { apiService } from '../services/api'
import { RealtimeClient, setRealtimeClient, type EventSourceLike } from '../lib/realtime'
import { APP_STORE_KEY, RATING_PROMPTS_PREFIX, SECURE_STORAGE_WEB_PREFIX } from './deviceData'

const booking = (id: string): Booking => ({
  id, customerId: 'u1', status: 'en_route',
  service: { id: 'flat_tire', name: 'Flat tire', description: '', basePrice: 79, estimatedTime: 35 },
  location: { address: '1 Main St', lat: 32.7, lng: -96.8 }, price: 79, createdAt: new Date(),
} as unknown as Booking)

const driverUser = {
  id: 'u1', email: 'd@aid.test', phone: '', firstName: 'Dana', lastName: 'D', role: 'driver', createdAt: new Date(),
  isOnline: true, isVerified: true, verificationStatus: 'verified', documents: [], rating: null, totalJobs: 0, specializations: [],
} as Driver

const fetchMock = vi.fn()

function seedEverything() {
  useAuthStore.setState({ isAuthenticated: true, user: driverUser, token: 'tok-1', error: null, notice: null })
  useAppStore.setState({
    ownerId: 'u1', ownerRole: 'driver', bookingHistory: [booking('b1')], activeBooking: booking('b1'),
    vehicles: [{ id: 'v1', make: 'Honda', model: 'Civic', year: 2020, color: 'Blue', plate: 'ABC', createdAt: '' }], activeVehicleId: 'v1',
    userLocationLabel: '1 Main St', userCoords: { lat: 32.7, lng: -96.8 }, locationConfirmedAt: new Date().toISOString(),
    receiptBookingId: 'b1', searchQuery: 'home address',
  })
  useDriverStore.setState({ isOnline: true, activeBooking: booking('b2'), currentLocation: { lat: 32.7, lng: -96.8 }, incomingRequests: [], documents: [] })
  // Every key the app writes (see deviceData.ts), plus the browser fallback of the secure session store.
  localStorage.setItem(`${RATING_PROMPTS_PREFIX}u1`, JSON.stringify({ skipped: ['b1'], reminded: [] }))
  localStorage.setItem('auth-storage', '{"state":{"user":{"role":"admin"}}}')
  localStorage.setItem('auth_token', 'old')
  localStorage.setItem('user', '{"role":"driver"}')
  localStorage.setItem(`${SECURE_STORAGE_WEB_PREFIX}sb-proj-auth-token`, '{"access_token":"tok-1"}')
  sessionStorage.setItem('anything', 'x')
}

class FakeSource implements EventSourceLike {
  closed = false
  onerror: ((event: unknown) => void) | null = null
  addEventListener() {}
  close() { this.closed = true }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ isOnline: false }), { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-1' } }, error: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  setRealtimeClient(null)
})

describe('signOut', () => {
  it('clears every inventoried key and store, and stops live updates, GPS and the session', async () => {
    seedEverything()
    expect(localStorage.getItem(APP_STORE_KEY)).toContain('u1')
    const source = new FakeSource()
    const realtime = new RealtimeClient({ requestTicket: async () => ({ ok: true, url: 'https://api.test/s' }), createEventSource: () => source })
    setRealtimeClient(realtime)
    realtime.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(realtime.status).not.toBe('off')

    await signOut('user')

    // Live updates closed (no reconnect / ticket pending), GPS watch stopped.
    expect(realtime.status).toBe('off')
    expect(source.closed).toBe(true)
    expect(mocks.stopWatchLocation).toHaveBeenCalled()
    // The online driver was set offline on the server before the session ended.
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/drivers/me/online'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isOnline: false }) }))
    // Session ended on this device and removed from the secure store even if Supabase was unreachable.
    expect(mocks.managedSignOut).toHaveBeenCalledTimes(1)
    expect(mocks.clearStoredSession).toHaveBeenCalled()
    expect(mocks.clearAllNotifications).toHaveBeenCalled()
    expect(mocks.clearGeocodingCache).toHaveBeenCalled()
    // Nothing left in storage.
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    // In-memory state back to a fresh install.
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null, token: null })
    expect(useAppStore.getState()).toMatchObject({
      ownerId: null, ownerRole: null, bookingHistory: [], activeBooking: null, vehicles: [], activeVehicleId: null,
      userLocationLabel: '', userCoords: null, receiptBookingId: null, searchQuery: '',
    })
    expect(useDriverStore.getState()).toMatchObject({ isOnline: false, activeBooking: null, currentLocation: null, incomingRequests: [], documents: [] })
  })

  it('still clears everything when Supabase cannot be reached', async () => {
    seedEverything()
    mocks.managedSignOut.mockRejectedValueOnce(new TypeError('offline'))
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await signOut('user')
    expect(mocks.clearStoredSession).toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('account deletion and an ended session sign out with a notice (no offline call for a dead session)', async () => {
    seedEverything()
    await signOut('deleted')
    expect(useAuthStore.getState().notice).toMatch(/deleted/i)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)

    seedEverything()
    await signOut('expired')
    expect(useAuthStore.getState().notice).toMatch(/session ended/i)
  })

  it('a 401 from the API signs out exactly once, and answers from before sign-out are dropped', async () => {
    seedEverything()
    useDriverStore.setState({ isOnline: false })
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401, headers: { 'content-type': 'application/json' } }))

    const results = await Promise.all([apiService.listBookings(), apiService.getActiveBooking(), apiService.listPendingRatings()])
    await vi.waitFor(() => expect(useAuthStore.getState().token).toBeNull())
    await vi.waitFor(() => expect(localStorage.length).toBe(0))

    expect(mocks.managedSignOut).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().notice).toMatch(/session ended/i)
    expect(results.every((result) => !result.success)).toBe(true)

    // A late 401 after sign-out (nobody signed in) does nothing more.
    await apiService.listBookings()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.managedSignOut).toHaveBeenCalledTimes(1)
  })

  it('an answer that arrives after sign-out never reaches the stores', async () => {
    seedEverything()
    useDriverStore.setState({ isOnline: false })
    let answer: (response: Response) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { answer = resolve }))
    const pending = apiService.listBookings()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await signOut('user')
    answer(new Response(JSON.stringify([booking('b1')]), { status: 200, headers: { 'content-type': 'application/json' } }))
    const result = await pending
    expect(result).toMatchObject({ success: false, code: 'signed_out' })
  })

  it('Supabase reporting the session ended (refresh failed / revoked) signs out here', async () => {
    seedEverything()
    useDriverStore.setState({ isOnline: false })
    const stop = installSessionWatch()
    // The first "no session yet" event at app start is not a sign-out.
    mocks.authListener?.('INITIAL_SESSION', null)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    mocks.authListener?.('SIGNED_OUT', null)
    await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false))
    await vi.waitFor(() => expect(localStorage.length).toBe(0))
    expect(useAuthStore.getState().notice).toMatch(/session ended/i)
    stop()
  })

  it('the store Log Out (useAuthStore.logout) is the same full sign-out', async () => {
    seedEverything()
    useAuthStore.getState().logout()
    await vi.waitFor(() => expect(localStorage.length).toBe(0))
    expect(mocks.managedSignOut).toHaveBeenCalledTimes(1)
  })
})

describe('switching accounts on one phone', () => {
  it('a different account signing in wipes the previous account’s data first (session kept)', () => {
    seedEverything()
    useAppStore.setState({ ownerId: 'u1', ownerRole: 'customer' })
    claimDeviceFor({ id: 'u2', role: 'customer' })
    expect(useAppStore.getState()).toMatchObject({ ownerId: 'u2', ownerRole: 'customer', bookingHistory: [], activeBooking: null, vehicles: [], userCoords: null })
    expect(useDriverStore.getState().activeBooking).toBeNull()
    expect(localStorage.getItem(`${RATING_PROMPTS_PREFIX}u1`)).toBeNull()
    expect(localStorage.getItem('auth-storage')).toBeNull()
    expect(localStorage.getItem(`${SECURE_STORAGE_WEB_PREFIX}sb-proj-auth-token`)).not.toBeNull()
    expect(JSON.parse(localStorage.getItem(APP_STORE_KEY) || '{}').state.ownerId).toBe('u2')
  })

  it('the same account keeps its data; the same account with a different server role does not', () => {
    seedEverything()
    useAppStore.setState({ ownerId: 'u1', ownerRole: 'customer' })
    claimDeviceFor({ id: 'u1', role: 'customer' })
    expect(useAppStore.getState().bookingHistory).toHaveLength(1)
    expect(localStorage.getItem(`${RATING_PROMPTS_PREFIX}u1`)).not.toBeNull()

    claimDeviceFor({ id: 'u1', role: 'driver' })
    expect(useAppStore.getState()).toMatchObject({ ownerId: 'u1', ownerRole: 'driver', bookingHistory: [], vehicles: [] })
  })

  it('data saved before owner stamps existed (no owner) is wiped, not guessed', () => {
    useAppStore.setState({ ownerId: null, ownerRole: null, bookingHistory: [booking('old')], vehicles: [] })
    claimDeviceFor({ id: 'u3', role: 'customer' })
    expect(useAppStore.getState().bookingHistory).toEqual([])
  })

  it('signing in through the store as another account wipes the previous one', async () => {
    seedEverything()
    useAuthStore.setState({ isAuthenticated: false, user: null, token: null })
    useAppStore.setState({ ownerId: 'u1', ownerRole: 'customer' })
    mocks.signIn.mockResolvedValue({
      success: true,
      data: { token: 'tok-2', user: { id: 'u2', email: 'b@aid.test', phone: '', firstName: 'B', lastName: '', role: 'customer', createdAt: new Date(), savedAddresses: [], vehicles: [], paymentMethods: [] } },
    })
    await useAuthStore.getState().customerLogin('b@aid.test', 'pw')
    expect(useAuthStore.getState().user?.id).toBe('u2')
    expect(useAppStore.getState()).toMatchObject({ ownerId: 'u2', bookingHistory: [], activeBooking: null })
  })

  it('a different account appearing in the Supabase session wipes and reloads from the server', async () => {
    seedEverything()
    useDriverStore.setState({ isOnline: false })
    mocks.restore.mockResolvedValue({ success: true, data: null })
    const stop = installSessionWatch()
    mocks.authListener?.('SIGNED_IN', { access_token: 'tok-9', user: { id: 'u9' } })
    await vi.waitFor(() => expect(mocks.restore).toHaveBeenCalled())
    expect(useAppStore.getState().bookingHistory).toEqual([])
    expect(localStorage.getItem(`${RATING_PROMPTS_PREFIX}u1`)).toBeNull()
    stop()
  })
})
