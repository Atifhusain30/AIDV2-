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
    expect(screen.getByRole('button', { name: 'Add vehicle' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Roadside support/i })).toBeTruthy()
    expect(screen.queryByText('John Doe')).toBeNull()
  })

  it('requires explicit confirmation before deleting an authenticated account', async () => {
    vi.mocked(apiService.listVehicles).mockResolvedValue({ success: true, data: [] })
    vi.mocked(apiService.deleteAccount).mockResolvedValue({ success: true })
    useAuthStore.setState({ isAuthenticated: true, token: 'token', user: {
      id: 'customer-1', email: 'alex@example.com', phone: '', firstName: 'Alex', lastName: 'Morgan', role: 'customer', createdAt: new Date(), savedAddresses: [], vehicles: [], paymentMethods: [],
    } })
    render(<ProfileScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(screen.getByRole('dialog', { name: 'Permanently delete account?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account permanently' }))

    await waitFor(() => expect(apiService.deleteAccount).toHaveBeenCalled())
  })
})
