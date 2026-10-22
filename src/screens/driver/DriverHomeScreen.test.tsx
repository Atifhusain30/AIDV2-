import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DriverHomeScreen from './DriverHomeScreen'
import { useAuthStore } from '../../store/useAuthStore'
import { useDriverStore } from '../../store/useDriverStore'
import { apiService } from '../../services/api'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

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
    render(<DriverHomeScreen onOpenOnboarding={vi.fn()} onOpenVehicle={vi.fn()} onOpenSettings={vi.fn()} onOpenActiveJob={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Work' })).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Incoming requests')).toBeTruthy()
    expect(screen.getByText('Driver readiness')).toBeTruthy()
  })

  it('shows only real figures for today: completed jobs from job history, no invented earnings or rating', async () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 36 * 60 * 60 * 1000)
    vi.spyOn(apiService, 'listBookings').mockResolvedValue({ success: true, data: [
      { id: 'b1', status: 'completed', completedAt: now },
      { id: 'b2', status: 'completed', completedAt: now },
      { id: 'b3', status: 'completed', completedAt: yesterday },
      { id: 'b4', status: 'cancelled', cancelledAt: now },
    ] as never })
    useAuthStore.setState({ user: { ...(useAuthStore.getState().user as object), rating: null, ratingCount: 2, totalJobs: 0 } as never })
    render(<DriverHomeScreen onOpenOnboarding={vi.fn()} onOpenVehicle={vi.fn()} onOpenSettings={vi.fn()} onOpenActiveJob={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText('Jobs completed today').textContent).toContain('2'))
    expect(screen.getByLabelText('Earnings coming soon').textContent).toContain('Soon')
    expect(screen.getByLabelText('Rating').textContent).toContain('—')
    expect(screen.getByText(/Your rating shows once 3 customers have rated you \(2 so far\)/)).toBeTruthy()
    expect(screen.queryByText('$0.00')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull()
  })

  it('shows the real average on Today once customers have rated (B15)', async () => {
    vi.spyOn(apiService, 'listBookings').mockResolvedValue({ success: true, data: [] })
    useAuthStore.setState({ user: { ...(useAuthStore.getState().user as object), rating: 4.7, ratingCount: 12 } as never })
    render(<DriverHomeScreen onOpenOnboarding={vi.fn()} onOpenVehicle={vi.fn()} onOpenSettings={vi.fn()} onOpenActiveJob={vi.fn()} />)
    expect(screen.getByLabelText('Rating').textContent).toContain('4.7')
    await waitFor(() => expect(screen.getByText(/Rating from 12 customer ratings/)).toBeTruthy())
  })

  it('says so when today\'s jobs cannot be loaded instead of showing zero', async () => {
    vi.spyOn(apiService, 'listBookings').mockResolvedValue({ success: false, error: 'offline' })
    render(<DriverHomeScreen onOpenOnboarding={vi.fn()} onOpenVehicle={vi.fn()} onOpenSettings={vi.fn()} onOpenActiveJob={vi.fn()} />)

    await waitFor(() => expect(screen.getByText(/Couldn't load today's jobs/)).toBeTruthy())
    expect(screen.getByLabelText('Jobs completed today').textContent).toContain('—')
  })

  it('does not let an unverified driver go online', () => {
    render(<DriverHomeScreen onOpenOnboarding={vi.fn()} onOpenVehicle={vi.fn()} onOpenSettings={vi.fn()} onOpenActiveJob={vi.fn()} />)

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
  const renderHome = (onOpenOnboarding = vi.fn(), onOpenVehicle = vi.fn()) =>
    render(<DriverHomeScreen onOpenOnboarding={onOpenOnboarding} onOpenVehicle={onOpenVehicle} onOpenSettings={vi.fn()} onOpenActiveJob={vi.fn()} />)
  const TOW_TRUCK = { make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed' }

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

  it('lets a verified driver with current credentials and a vehicle go online', () => {
    setDriver({ verificationStatus: 'verified', isVerified: true, credentialsValidUntil: '2099-01-01', vehicle: TOW_TRUCK })
    renderHome()
    expect(screen.getByRole('button', { name: /^go online$/i })).toBeTruthy()
    expect(screen.getByText('Ready to take requests')).toBeTruthy()
    expect(screen.getByText('2021 White Ford F-550 · TOW-77 (TX)')).toBeTruthy()
  })

  it('asks a verified driver with no vehicle to add one before going online', () => {
    const openVehicle = vi.fn()
    const goOnline = vi.fn(async () => {})
    useDriverStore.setState({ setOnlineStatus: goOnline })
    setDriver({ verificationStatus: 'verified', isVerified: true, credentialsValidUntil: '2099-01-01', vehicle: null })
    renderHome(vi.fn(), openVehicle)
    expect(screen.queryByRole('button', { name: /^go online$/i })).toBeNull()
    expect(screen.getAllByText(/add your vehicle/i).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /^add vehicle$/i }))
    expect(openVehicle).toHaveBeenCalledTimes(1)
    expect(goOnline).not.toHaveBeenCalled()
  })

  it('asks a driver with a vehicle saved before equipment types to finish it', () => {
    setDriver({ verificationStatus: 'verified', isVerified: true, credentialsValidUntil: '2099-01-01', vehicle: { ...TOW_TRUCK, year: null, plateState: '', equipmentType: '' } })
    renderHome()
    expect(screen.queryByRole('button', { name: /^go online$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^finish vehicle$/i })).toBeTruthy()
  })

  it('always lets an online driver without vehicle details go offline', () => {
    const setOnlineStatus = vi.fn(async () => {})
    useDriverStore.setState({ isOnline: true, setOnlineStatus })
    setDriver({ verificationStatus: 'verified', isVerified: true, credentialsValidUntil: '2099-01-01', vehicle: null })
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: /^go offline$/i }))
    expect(setOnlineStatus).toHaveBeenCalledWith(false)
    // No request list or accept buttons until the vehicle is added.
    expect(screen.queryByRole('button', { name: /accept request/i })).toBeNull()
  })

  it('shows availability errors from the server', () => {
    setDriver({ verificationStatus: 'verified', isVerified: true, credentialsValidUntil: '2099-01-01', vehicle: TOW_TRUCK })
    useDriverStore.setState({ error: 'Your license, insurance, or registration has expired.' })
    renderHome()
    expect(screen.getByRole('alert').textContent).toMatch(/expired/)
  })

  it('shows why the server refused an accept and refreshes the list to compatible jobs only', async () => {
    const lightDuty = { ...TOW_TRUCK, model: 'Transit', equipmentType: 'light_duty' }
    setDriver({ verificationStatus: 'verified', isVerified: true, credentialsValidUntil: '2099-01-01', vehicle: lightDuty })
    const tow = {
      id: 'tow-1', service: { id: 'towing', name: 'Towing', description: '', basePrice: 95, estimatedTime: 60 }, status: 'searching',
      location: { address: 'Approximate pickup area', lat: 32.78, lng: -96.8 }, estimatedPrice: 95, createdAt: new Date(), expiresAt: new Date(Date.now() + 600000),
    }
    const message = "Towing needs a flatbed or wheel-lift tow truck. Your light-duty service vehicle can't take this job."
    vi.spyOn(apiService, 'getDriverActiveBooking').mockResolvedValue({ success: true, data: null })
    const refresh = vi.spyOn(apiService, 'getServiceRequests').mockResolvedValue({ success: true, data: { status: 'ok', radiusMiles: 25, requests: [] } })
    const accept = vi.spyOn(apiService, 'acceptServiceRequest').mockResolvedValue({ success: false, error: message, code: 'equipment_mismatch' } as never)
    useDriverStore.setState({ isOnline: true, incomingRequests: [tow as never] })
    const openJob = vi.fn()
    render(<DriverHomeScreen onOpenOnboarding={vi.fn()} onOpenVehicle={vi.fn()} onOpenSettings={vi.fn()} onOpenActiveJob={openJob} />)
    refresh.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /accept request/i }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(message))
    expect(accept).toHaveBeenCalledWith('tow-1', 'driver-1')
    expect(refresh).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('button', { name: /accept request/i })).toBeNull())
    expect(openJob).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  // B8: nearby requests.
  const READY = { verificationStatus: 'verified', isVerified: true, credentialsValidUntil: '2099-01-01', vehicle: TOW_TRUCK }
  const job = (id: string, name: string, distanceMiles: number) => ({
    id, service: { id: 'battery_jump', name, description: '', basePrice: 69, estimatedTime: 30 }, status: 'searching',
    location: { address: 'Approximate pickup area', lat: 32.78, lng: -96.8 }, estimatedPrice: 69, createdAt: new Date(), expiresAt: new Date(Date.now() + 600000), distanceMiles,
  })
  // A no-op refresh keeps the store state each test sets up.
  const holdState = () => useDriverStore.setState({ fetchIncomingRequests: vi.fn(async () => {}), fetchActiveBooking: vi.fn(async () => {}) })

  it('shows each request with its distance, in the order the server sent (nearest first)', () => {
    setDriver(READY)
    holdState()
    useDriverStore.setState({ isOnline: true, nearbyStatus: 'ok', requestRadiusMiles: 25, incomingRequests: [job('a', "Won't start", 1.24), job('b', 'Flat tire', 12.6)] as never })
    renderHome()
    expect(screen.getByText('1.2 mi away')).toBeTruthy()
    expect(screen.getByText('13 mi away')).toBeTruthy()
    const names = screen.getAllByRole('article').map((card) => card.querySelector('strong')?.textContent)
    expect(names).toEqual(["Won't start", 'Flat tire'])
  })

  it('says there are no requests nearby (with the radius) instead of a blank list', () => {
    setDriver(READY)
    holdState()
    useDriverStore.setState({ isOnline: true, nearbyStatus: 'ok', requestRadiusMiles: 15, incomingRequests: [] })
    renderHome()
    expect(screen.getByText('No requests near you right now')).toBeTruthy()
    expect(screen.getByText(/within 15 miles of you/)).toBeTruthy()
  })

  it('asks for location when the server cannot place the driver, and retries on tap', () => {
    setDriver(READY)
    holdState()
    const retryLocation = vi.fn(async () => {})
    useDriverStore.setState({ isOnline: true, nearbyStatus: 'location_required', locationProblem: 'denied', requestRadiusMiles: 25, incomingRequests: [], retryLocation })
    renderHome()
    expect(screen.getByText('Turn on location to see nearby requests')).toBeTruthy()
    expect(screen.getByText(/Allow location for AID in your phone's Settings/)).toBeTruthy()
    expect(screen.queryByText('No requests near you right now')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /turn on location/i }))
    expect(retryLocation).toHaveBeenCalledTimes(1)
  })

  it('explains a missing GPS signal differently from a denied permission', () => {
    setDriver(READY)
    holdState()
    useDriverStore.setState({ isOnline: true, nearbyStatus: 'location_required', locationProblem: 'unavailable', incomingRequests: [] })
    renderHome()
    expect(screen.getByText("We couldn't find your location")).toBeTruthy()
    expect(screen.getByText(/location services are on/)).toBeTruthy()
  })
})
