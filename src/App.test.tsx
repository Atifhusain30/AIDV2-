import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { useAuthStore } from './store/useAuthStore'
import { initNotifications } from './lib/notifications'

vi.mock('./lib/notifications', () => ({
  initNotifications: vi.fn(),
  registerNotificationTapHandler: vi.fn(),
}))

vi.mock('./lib/leafletFix', () => ({
  applyLeafletIconFix: vi.fn(),
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

  it('initializes booking notifications after entering an authenticated customer session', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Get roadside help/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Explore with a guest account' }))

    await waitFor(() => expect(initNotifications).toHaveBeenCalledTimes(1))
  })
})
