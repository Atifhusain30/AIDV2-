import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { useAuthStore } from './store/useAuthStore'
import { initNotifications } from './lib/notifications'
import { apiService } from './services/api'
import { useDriverStore } from './store/useDriverStore'

vi.mock('./lib/notifications', () => ({
  initNotifications: vi.fn(),
  registerNotificationTapHandler: vi.fn(),
}))

vi.mock('./lib/leafletFix', () => ({
  applyLeafletIconFix: vi.fn(),
}))

vi.mock('./services/api', () => ({
  apiService: {
    getProfile: vi.fn(),
    getDriverActiveBooking: vi.fn(),
    getServiceRequests: vi.fn(),
    listBookings: vi.fn(async () => ({ success: true, data: [] })),
  },
}))

afterEach(() => cleanup())

describe('first-run flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      token: null,
      isLoading: false,
      error: null,
    })
  })

  it('presents one clear AID brand and both role choices immediately', () => {
    render(<App />)

    // Permission prompts should follow an explained user action, not app launch.
    expect(initNotifications).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Help, right when it matters.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Get roadside help/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Drive with AID/i })).toBeTruthy()
  })

  it('takes customers directly to the usable sign-in screen', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Get roadside help/i }))

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('takes drivers directly to the usable sign-in screen without an intro delay', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Drive with AID/i }))

    expect(screen.getByRole('heading', { name: 'Ready when you are.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('provides feedback when password recovery is requested', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Get roadside help/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(screen.getByRole('alert').textContent).toContain('Enter your email address first.')
  })

  it('sends password recovery through managed authentication', async () => {
    const requestPasswordReset = vi.spyOn(useAuthStore.getState(), 'requestPasswordReset').mockResolvedValue(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Get roadside help/i }))
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'alex@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith('alex@example.com'))
  })

  it('does not advertise a guest request flow that cannot reach the authenticated API', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Get roadside help/i }))

    expect(screen.queryByRole('button', { name: 'Explore with a guest account' })).toBeNull()
  })

  it('hydrates verified driver status and online state from the authoritative profile', async () => {
    vi.mocked(apiService.getProfile).mockResolvedValue({
      success: true,
      data: {
        id: 'driver-1', role: 'driver', status: 'active', email: 'driver@aid.test', firstName: 'Alex', lastName: 'Rivera', phone: '',
        createdAt: '2026-01-01T00:00:00.000Z', verificationStatus: 'verified', isVerified: true, isOnline: true,
        rating: 4.9, totalJobs: 18, specializations: [],
      },
    })
    vi.mocked(apiService.getDriverActiveBooking).mockResolvedValue({ success: true, data: undefined })
    vi.mocked(apiService.getServiceRequests).mockResolvedValue({ success: true, data: { status: 'ok', radiusMiles: 25, requests: [] } })
    useAuthStore.setState({
      isAuthenticated: true,
      token: 'managed-token',
      user: {
        id: 'driver-1', email: 'driver@aid.test', phone: '', firstName: 'Alex', lastName: 'Rivera', role: 'driver', createdAt: new Date(),
        isOnline: false, isVerified: false, verificationStatus: 'pending', documents: [], rating: 0, totalJobs: 0, specializations: [],
      },
    })
    useDriverStore.setState({ isOnline: false, incomingRequests: [], activeBooking: null, documents: [] })

    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Go offline' })).toBeTruthy())
    expect((useAuthStore.getState().user as { verificationStatus?: string }).verificationStatus).toBe('verified')
    expect(useDriverStore.getState().isOnline).toBe(true)

    // Driver settings has a Safety entry with Call 911 behind a confirm step.
    fireEvent.click(screen.getByRole('button', { name: 'Driver settings' }))
    fireEvent.click(await screen.findByRole('button', { name: /Safety/ }))
    expect(screen.getByRole('dialog', { name: 'Safety' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Call 911' }))
    expect(screen.getByRole('link', { name: 'Call 911 now' }).getAttribute('href')).toBe('tel:911')
  })
})
