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
    useDriverStore.setState({ isOnline: false, incomingRequests: [], activeBooking: null, isLoading: false, currentLocation: null })
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

    expect(screen.getByRole('button', { name: 'Complete verification to go online' }).hasAttribute('disabled')).toBe(true)
  })
})
