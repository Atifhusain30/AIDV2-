import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import DriverHomeScreen from './DriverHomeScreen'
import { useAuthStore } from '../../store/useAuthStore'
import { useDriverStore } from '../../store/useDriverStore'

afterEach(() => cleanup())

describe('driver work layout', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'driver-1', email: 'driver@aid.test', phone: '555-0100', firstName: 'Alex', lastName: 'Rivera',
        role: 'driver', createdAt: new Date(), isOnline: false, isVerified: false,
        verificationStatus: 'verified', documents: [], rating: 4.9, totalJobs: 18, specializations: [],
      },
    })
    useDriverStore.setState({ isOnline: false, incomingRequests: [], activeBooking: null, isLoading: false, currentLocation: null, error: null })
  })

  it('organizes the dashboard around availability, current work, today, and readiness', () => {
    render(<DriverHomeScreen onOpenOnboarding={vi.fn()} onOpenSettings={vi.fn()} onOpenActiveJob={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Work' })).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Incoming requests')).toBeTruthy()
    expect(screen.getByText('Driver readiness')).toBeTruthy()
  })

  it('does not let an unverified driver go online', () => {
    render(<DriverHomeScreen onOpenOnboarding={vi.fn()} onOpenSettings={vi.fn()} onOpenActiveJob={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /^go online$/i })).toBeNull()
  })

  function setDriver(extra: Record<string, unknown>) {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'driver-1', email: 'driver@aid.test', phone: '555-0100', firstName: 'Alex', lastName: 'Rivera',
        role: 'driver', createdAt: new Date(), isOnline: false, isVerified: false,
        verificationStatus: 'pending', documents: [], rating: 0, totalJobs: 0, specializations: [], ...extra,
      } as never,
    })
  }
  const renderHome = (onOpenOnboarding = vi.fn()) => render(<DriverHomeScreen onOpenOnboarding={onOpenOnboarding} onOpenSettings={vi.fn()} onOpenActiveJob={vi.fn()} />)

  it('sends a new driver straight to verification from the availability card', () => {
    const open = vi.fn()
    setDriver({})
    renderHome(open)
    const cta = screen.getByRole('button', { name: /start verification/i })
    cta.click()
    expect(open).toHaveBeenCalled()
  })

  it('tells a driver whose application is under review to wait', () => {
    setDriver({ verificationStatus: 'under_review' })
    renderHome()
    expect(screen.getAllByText(/under review/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^go online$/i })).toBeNull()
  })

  it('asks a rejected driver to fix their documents', () => {
    setDriver({ verificationStatus: 'rejected' })
    renderHome()
    expect(screen.getByRole('button', { name: /fix documents/i })).toBeTruthy()
  })

  it('blocks a verified driver whose credentials expired', () => {
    setDriver({ verificationStatus: 'verified', isVerified: true, credentialsValidUntil: '2001-01-01' })
    renderHome()
    expect(screen.getAllByText(/expired/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^go online$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /update documents/i })).toBeTruthy()
  })

  it('lets a verified driver with current credentials go online', () => {
    setDriver({ verificationStatus: 'verified', isVerified: true, credentialsValidUntil: '2099-01-01' })
    renderHome()
    expect(screen.getByRole('button', { name: /^go online$/i })).toBeTruthy()
  })

  it('shows availability errors from the server', () => {
    setDriver({ verificationStatus: 'verified', isVerified: true, credentialsValidUntil: '2099-01-01' })
    useDriverStore.setState({ error: 'Your license, insurance, or registration has expired.' })
    renderHome()
    expect(screen.getByRole('alert').textContent).toMatch(/expired/)
  })
})

