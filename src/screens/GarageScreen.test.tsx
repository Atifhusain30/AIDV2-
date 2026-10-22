import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import GarageScreen from './GarageScreen'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { apiService } from '../services/api'

vi.mock('../services/api', () => ({ apiService: { listVehicles: vi.fn(), createVehicle: vi.fn(), deleteVehicle: vi.fn() } }))

const CIVIC = { id: 'v1', make: 'Honda', model: 'Civic', year: 2020, color: 'Blue', plate: 'ABC123', createdAt: '' }
const signIn = () => useAuthStore.setState({ isAuthenticated: true, token: 'token', user: {
  id: 'customer-1', email: 'alex@example.com', phone: '', firstName: 'Alex', lastName: 'Morgan', role: 'customer', createdAt: new Date(), savedAddresses: [], vehicles: [], paymentMethods: [],
} })

beforeEach(() => {
  useAppStore.setState({ user: null, vehicles: [], activeVehicleId: null, currentScreen: 'garage' })
  useAuthStore.setState({ isAuthenticated: false, user: null, token: null })
  vi.clearAllMocks()
})
afterEach(() => cleanup())

describe('Garage tab (saved vehicles)', () => {
  it('is its own screen titled Garage, with a placeholder while vehicles load (F5)', () => {
    vi.mocked(apiService.listVehicles).mockReturnValue(new Promise(() => undefined))
    signIn()
    render(<GarageScreen />)
    expect(screen.getByRole('heading', { level: 1, name: 'Garage' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading your vehicles' })).toBeTruthy()
  })

  it('says when the garage could not load and retries; the default vehicle is marked', async () => {
    vi.mocked(apiService.listVehicles).mockResolvedValueOnce({ success: false, error: 'Unable to reach AID.' })
    vi.mocked(apiService.listVehicles).mockResolvedValueOnce({ success: true, data: [CIVIC] })
    signIn()
    render(<GarageScreen />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't load your garage/)
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    const civic = await screen.findByRole('button', { name: /2020 Honda Civic/ })
    expect(civic.getAttribute('aria-pressed')).toBe('true')
    expect(civic.textContent).toContain('Blue · ABC123')
    expect(screen.getByText('Default')).toBeTruthy()
  })

  it('Remove appears only in Edit mode, and Add vehicle is offered otherwise', async () => {
    vi.mocked(apiService.listVehicles).mockResolvedValue({ success: true, data: [CIVIC] })
    vi.mocked(apiService.deleteVehicle).mockResolvedValue({ success: true })
    signIn()
    render(<GarageScreen />)
    await screen.findByRole('button', { name: /2020 Honda Civic/ })
    expect(screen.queryByRole('button', { name: 'Remove Honda Civic' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add vehicle' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit garage' }))
    expect(screen.queryByRole('button', { name: 'Add vehicle' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Honda Civic' }))
    await waitFor(() => expect(apiService.deleteVehicle).toHaveBeenCalledWith('v1'))
    await waitFor(() => expect(useAppStore.getState().vehicles).toHaveLength(0))
  })

  it('adds a vehicle through the server and makes it available for requests', async () => {
    vi.mocked(apiService.listVehicles).mockResolvedValue({ success: true, data: [] })
    vi.mocked(apiService.createVehicle).mockResolvedValue({ success: true, data: CIVIC })
    signIn()
    render(<GarageScreen />)
    fireEvent.click(await screen.findByRole('button', { name: /Add your first vehicle/ }))
    const sheet = screen.getByRole('dialog', { name: 'Add a vehicle' })
    fireEvent.change(sheet.querySelector('input[placeholder="Toyota"]')!, { target: { value: 'Honda' } })
    fireEvent.change(sheet.querySelector('input[placeholder="Camry"]')!, { target: { value: 'Civic' } })
    fireEvent.change(sheet.querySelector('input[placeholder="2024"]')!, { target: { value: '2020' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save vehicle' }))
    await waitFor(() => expect(apiService.createVehicle).toHaveBeenCalledWith(expect.objectContaining({ make: 'Honda', model: 'Civic', year: 2020 })))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useAppStore.getState().vehicles[0].id).toBe('v1')
  })
})
