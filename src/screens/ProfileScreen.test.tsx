import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import ProfileScreen from './ProfileScreen'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { apiService } from '../services/api'

vi.mock('../services/api', () => ({ apiService: { listVehicles: vi.fn(), deleteAccount: vi.fn() } }))

beforeEach(() => {
  useAppStore.setState({ user: null, vehicles: [], activeVehicleId: null, currentScreen: 'profile' })
  useAuthStore.setState({ isAuthenticated: false, user: null, token: null })
  vi.clearAllMocks()
})

afterEach(() => cleanup())

describe('customer account', () => {
  it('prioritizes real profile, garage, and roadside support controls', () => {
    render(<ProfileScreen />)
    expect(screen.getByRole('heading', { name: 'Account' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add your first vehicle/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Safety/i })).toBeTruthy()
    expect(screen.queryByText('John Doe')).toBeNull()
  })

  it('opens safety info from Help & safety, with Call 911 behind a confirm step (no one-tap 911 link)', () => {
    render(<ProfileScreen />)
    expect(screen.queryByRole('link', { name: /911/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Roadside support/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Safety/i }))
    expect(screen.getByRole('dialog', { name: 'Safety' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Call 911' }))
    expect(screen.getByRole('link', { name: 'Call 911 now' }).getAttribute('href')).toBe('tel:911')
  })

  it('design (owner reference): logo + gear header, rows Help & support · Safety · Settings, red Sign out, no fake Payment methods', () => {
    vi.mocked(apiService.listVehicles).mockResolvedValue({ success: true, data: [] })
    useAuthStore.setState({ isAuthenticated: true, token: 'token', user: {
      id: 'customer-1', email: 'alex@example.com', phone: '', firstName: 'Alex', lastName: 'Morgan', role: 'customer', createdAt: new Date(), savedAddresses: [], vehicles: [], paymentMethods: [],
    } })
    const { container } = render(<ProfileScreen />)
    expect(container.querySelector('.account-top .aid-brand, .account-top [class*="brand"]')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Settings/ }).length).toBe(2)
    expect(screen.getByRole('button', { name: /Help & support/ })).toBeTruthy()
    expect(screen.queryByText(/Payment methods/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' }).className).toContain('ui-row--danger')
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull()
  })

  it('requires explicit confirmation before deleting an authenticated account', async () => {
    vi.mocked(apiService.listVehicles).mockResolvedValue({ success: true, data: [] })
    vi.mocked(apiService.deleteAccount).mockResolvedValue({ success: true })
    useAuthStore.setState({ isAuthenticated: true, token: 'token', user: {
      id: 'customer-1', email: 'alex@example.com', phone: '', firstName: 'Alex', lastName: 'Morgan', role: 'customer', createdAt: new Date(), savedAddresses: [], vehicles: [], paymentMethods: [],
    } })
    render(<ProfileScreen />)

    // Owner reference: deletion lives under Settings (gear in the header or the Settings row).
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(screen.getByRole('alertdialog', { name: 'Permanently delete account?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account permanently' }))

    await waitFor(() => expect(apiService.deleteAccount).toHaveBeenCalled())
  })
})

describe('account garage states (F5)', () => {
  const signIn = () => useAuthStore.setState({ isAuthenticated: true, token: 'token', user: {
    id: 'customer-1', email: 'alex@example.com', phone: '', firstName: 'Alex', lastName: 'Morgan', role: 'customer', createdAt: new Date(), savedAddresses: [], vehicles: [], paymentMethods: [],
  } })

  it('shows the person (initials, real name and email) and a placeholder while the garage loads', () => {
    vi.mocked(apiService.listVehicles).mockReturnValue(new Promise(() => undefined))
    signIn()
    render(<ProfileScreen />)
    expect(screen.getByText('Alex Morgan')).toBeTruthy()
    expect(screen.getAllByText('alex@example.com').length).toBeGreaterThan(0)
    expect(screen.getByRole('status', { name: 'Loading your vehicles' })).toBeTruthy()
  })

  it('says when the garage could not load and retries', async () => {
    vi.mocked(apiService.listVehicles).mockResolvedValueOnce({ success: false, error: 'Unable to reach AID.' })
    vi.mocked(apiService.listVehicles).mockResolvedValueOnce({ success: true, data: [{ id: 'v1', make: 'Honda', model: 'Civic', year: 2020, color: 'Blue', plate: 'ABC123', createdAt: '' }] })
    signIn()
    render(<ProfileScreen />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't load your garage/)
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByRole('button', { name: /2020 Honda Civic/ })).toBeTruthy()
  })

  it('shows a garage summary (vehicles + Add vehicle); Edit opens the Garage tab', async () => {
    vi.mocked(apiService.listVehicles).mockResolvedValue({ success: true, data: [{ id: 'v1', make: 'Honda', model: 'Civic', year: 2020, color: 'Blue', plate: 'ABC123', createdAt: '' }] })
    signIn()
    render(<ProfileScreen />)
    const civic = await screen.findByRole('button', { name: /2020 Honda Civic/ })
    expect(civic.textContent).toContain('Blue · ABC123')
    expect(screen.getByRole('button', { name: 'Add vehicle' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit garage' }))
    expect(useAppStore.getState().currentScreen).toBe('garage')
  })

  it('offers to add the first vehicle when the garage is empty', async () => {
    vi.mocked(apiService.listVehicles).mockResolvedValue({ success: true, data: [] })
    signIn()
    render(<ProfileScreen />)
    fireEvent.click(await screen.findByRole('button', { name: /Add your first vehicle/ }))
    expect(screen.getByRole('dialog', { name: 'Add a vehicle' })).toBeTruthy()
  })
})
