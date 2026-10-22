/**
 * E6 at the app level: which screens open is decided by the role the AID server returns, never by a
 * role saved on the phone; and signing out stops the polling timers and returns to sign-in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => {
  // A phone where someone edited the saved data to claim a driver (and admin) role.
  localStorage.setItem('auth-storage', JSON.stringify({ state: { user: { id: 'u1', role: 'admin' }, isAuthenticated: true } }))
  localStorage.setItem('aid-bookings-v1', JSON.stringify({
    version: 1,
    state: { ownerId: 'u1', ownerRole: 'driver', isAuthed: true, user: { id: 'u1', role: 'driver' }, bookingHistory: [{ id: 'tampered-booking' }], vehicles: [] },
  }))
  return {
    restore: vi.fn(),
    managedSignOut: vi.fn(async () => {}),
    calls: { getBooking: 0 },
  }
})

vi.mock('./auth/supabase', () => ({
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }), getSession: vi.fn() } },
  managedAuth: { restore: mocks.restore, signOut: mocks.managedSignOut, signIn: vi.fn(), register: vi.fn() },
  clearStoredSession: vi.fn(async () => {}),
}))
vi.mock('./lib/notifications', () => ({
  initNotifications: vi.fn(), registerNotificationTapHandler: vi.fn(), clearAllNotifications: vi.fn(async () => {}),
  notifyBookingStatus: vi.fn(),
}))
vi.mock('./services/location', () => ({ stopWatchLocation: vi.fn(async () => {}), watchLocation: vi.fn() }))
vi.mock('./services/api', () => {
  const activeBooking = {
    id: 'b-live', customerId: 'u1', status: 'en_route', price: 79, createdAt: new Date(),
    service: { id: 'flat_tire', name: 'Flat tire', description: '', basePrice: 79, estimatedTime: 35 },
    location: { address: '1 Main St', lat: 32.7, lng: -96.8 },
  }
  const fallback = vi.fn(async () => ({ success: false, error: 'not in this test' }))
  const known: Record<string, unknown> = {
    listBookings: vi.fn(async () => ({ success: true, data: [activeBooking] })),
    getActiveBooking: vi.fn(async () => ({ success: true, data: activeBooking })),
    getBooking: vi.fn(async () => { mocks.calls.getBooking += 1; return { success: true, data: activeBooking } }),
    listServices: vi.fn(async () => ({ success: true, data: [] })),
    listPendingRatings: vi.fn(async () => ({ success: true, data: [] })),
    listVehicles: vi.fn(async () => ({ success: true, data: [] })),
    createRealtimeTicket: vi.fn(async () => ({ ok: false, disabled: true })),
  }
  return { apiService: new Proxy(known, { get: (target, key: string) => target[key] ?? fallback }) }
})

import App from './App'
import { useAuthStore } from './store/useAuthStore'
import { useAppStore } from './store/useAppStore'
import { signOut } from './auth/signOut'

const serverCustomer = {
  id: 'u1', email: 'casey@aid.test', phone: '', firstName: 'Casey', lastName: 'C', role: 'customer' as const,
  createdAt: new Date(), savedAddresses: [], vehicles: [], paymentMethods: [],
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  mocks.calls.getBooking = 0
})

describe('E6: role comes from the server', () => {
  it('opens the customer app for a server customer even though the phone claims driver/admin, and wipes the stale data', async () => {
    mocks.restore.mockResolvedValue({ success: true, data: { user: serverCustomer, token: 'tok-1' } })
    render(<App />)

    expect(await screen.findByRole('navigation', { name: 'Customer navigation' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Go (online|offline)/ })).toBeNull()
    expect(useAuthStore.getState().user?.role).toBe('customer')
    // The saved role disagreed with the server: the saved data is gone, and the owner stamp is the server's.
    expect(localStorage.getItem('auth-storage')).toBeNull()
    expect(useAppStore.getState().bookingHistory.some((item) => item.id === 'tampered-booking')).toBe(false)
    expect(useAppStore.getState()).toMatchObject({ ownerId: 'u1', ownerRole: 'customer' })
  })

  it('loads the garage with the account, so Home shows the saved vehicle without visiting Account first', async () => {
    const { apiService } = await import('./services/api')
    vi.mocked(apiService.listVehicles).mockResolvedValueOnce({ success: true, data: [{ id: 'v9', make: 'Honda', model: 'Civic', year: 2020, color: 'Blue', plate: 'SIM 123', createdAt: '' }] })
    mocks.restore.mockResolvedValue({ success: true, data: { user: serverCustomer, token: 'tok-1' } })
    render(<App />)
    await screen.findByRole('navigation', { name: 'Customer navigation' })
    await waitFor(() => expect(useAppStore.getState().vehicles.map((vehicle) => vehicle.id)).toEqual(['v9']))
  })

  it('opens nothing when the server cannot confirm the account at app start', async () => {
    useAuthStore.setState({ isAuthenticated: false, user: null, token: null, error: null })
    mocks.restore.mockResolvedValue({ success: false, error: 'Unable to reach AID to confirm your account. Check your connection and try again.' })
    render(<App />)
    await waitFor(() => expect(mocks.restore).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /Get roadside help/i })).toBeTruthy()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

describe('E6: signing out stops timers and returns to sign-in', () => {
  it('polling for the active request stops and the customer sign-in screen shows', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mocks.restore.mockResolvedValue({ success: true, data: { user: serverCustomer, token: 'tok-1' } })
    render(<App />)
    await screen.findByRole('navigation', { name: 'Customer navigation' })
    await waitFor(() => expect(useAppStore.getState().activeBooking?.id).toBe('b-live'))

    await act(async () => { vi.advanceTimersByTime(4_500) })
    await waitFor(() => expect(mocks.calls.getBooking).toBeGreaterThan(0))

    await act(async () => { await signOut('user') })
    const afterSignOut = mocks.calls.getBooking
    await act(async () => { vi.advanceTimersByTime(60_000) })

    expect(mocks.calls.getBooking).toBe(afterSignOut)
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(useAppStore.getState().activeBooking).toBeNull()
    expect(localStorage.length).toBe(0)
  })
})
