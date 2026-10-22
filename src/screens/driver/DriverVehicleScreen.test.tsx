import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DriverVehicleScreen from './DriverVehicleScreen'
import { useAuthStore } from '../../store/useAuthStore'
import { useDriverStore } from '../../store/useDriverStore'
import { apiService } from '../../services/api'
import type { DriverVehicle } from '../../types'

const TOW_TRUCK: DriverVehicle = { make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed' }

function setDriver(vehicle: DriverVehicle | null) {
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      id: 'driver-1', email: 'driver@aid.test', phone: '555-0100', firstName: 'Alex', lastName: 'Rivera',
      role: 'driver', createdAt: new Date(), isOnline: false, isVerified: true, verificationStatus: 'verified',
      credentialsValidUntil: '2099-01-01', documents: [], rating: 4.9, totalJobs: 3, specializations: [], vehicle,
    },
  })
}

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement

function fillValid() {
  fireEvent.change(field(/^make$/i), { target: { value: ' Ford ' } })
  fireEvent.change(field(/^model$/i), { target: { value: 'F-550' } })
  fireEvent.change(field(/^year$/i), { target: { value: '2021' } })
  fireEvent.change(field(/^color$/i), { target: { value: 'White' } })
  fireEvent.change(field(/^license plate$/i), { target: { value: 'tow-77' } })
  fireEvent.change(field(/^plate state$/i), { target: { value: 'TX' } })
  fireEvent.click(screen.getByLabelText(/flatbed/i))
}

const CATALOG = [
  { id: 'battery_jump', name: "Won't start", description: '', basePrice: 69, estimatedTime: 30, available: true, requiresDropoff: false, equipmentTypes: ['flatbed', 'wheel_lift', 'light_duty'] },
  { id: 'towing', name: 'Towing', description: '', basePrice: 95, estimatedTime: 60, available: true, requiresDropoff: true, equipmentTypes: ['flatbed', 'wheel_lift'] },
  { id: 'detailing', name: 'Detailing', description: '', basePrice: 150, estimatedTime: 120, available: false, requiresDropoff: false, equipmentTypes: [] },
] as never

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(apiService, 'listServices').mockResolvedValue({ success: false, error: 'offline' })
  setDriver(null)
})
afterEach(() => cleanup())

describe('driver vehicle screen', () => {
  it('shows every problem inline and saves nothing until the form is valid', async () => {
    const save = vi.spyOn(apiService, 'updateDriverVehicle')
    render(<DriverVehicleScreen onBack={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Add your vehicle' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }))
    for (const message of ['Enter the vehicle make', 'Enter the vehicle model', 'Enter the vehicle color', 'Enter the license plate', 'Choose the state the plate is registered in', 'Choose your equipment type']) {
      expect(screen.getByText(message)).toBeTruthy()
    }
    expect(screen.getByText(/enter a year between 1980/i)).toBeTruthy()
    expect(field(/^make$/i).getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field(/^make$/i))

    fireEvent.change(field(/^year$/i), { target: { value: '1975' } })
    fireEvent.change(field(/^license plate$/i), { target: { value: 'A' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }))
    expect(screen.getByText(/enter a year between 1980/i)).toBeTruthy()
    expect(screen.getByText(/plates use 2–8 letters or numbers/i)).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('saves cleaned details, shows a saving state, updates the profile and returns', async () => {
    let resolve: (value: { success: true; data: DriverVehicle }) => void = () => {}
    const save = vi.spyOn(apiService, 'updateDriverVehicle').mockImplementation(() => new Promise((done) => { resolve = done }))
    const onSaved = vi.fn()
    render(<DriverVehicleScreen onBack={vi.fn()} onSaved={onSaved} />)
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }))

    expect(save).toHaveBeenCalledWith(TOW_TRUCK)
    const saving = screen.getByRole('button', { name: /saving/i }) as HTMLButtonElement
    expect(saving.disabled).toBe(true)
    expect(field(/^make$/i).disabled).toBe(true)

    resolve({ success: true, data: TOW_TRUCK })
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect((useAuthStore.getState().user as { vehicle?: DriverVehicle }).vehicle).toEqual(TOW_TRUCK)
  })

  it('pre-fills a saved vehicle for editing', () => {
    setDriver(TOW_TRUCK)
    render(<DriverVehicleScreen onBack={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Your vehicle' })).toBeTruthy()
    expect(field(/^make$/i).value).toBe('Ford')
    expect(field(/^year$/i).value).toBe('2021')
    expect(field(/^plate state$/i).value).toBe('TX')
    expect((screen.getByLabelText(/flatbed/i) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('button', { name: 'Save vehicle' })).toBeTruthy()
  })

  it('explains what is missing on a vehicle saved before equipment types', () => {
    setDriver({ ...TOW_TRUCK, year: null, plateState: '', equipmentType: '' })
    render(<DriverVehicleScreen onBack={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByText(/add the model year, plate state and equipment type/i)).toBeTruthy()
    expect(field(/^year$/i).value).toBe('')
  })

  it('puts a server validation error next to the field it names', async () => {
    vi.spyOn(apiService, 'updateDriverVehicle').mockResolvedValue({ success: false, error: 'Choose the state the plate is registered in', field: 'plateState' })
    const onSaved = vi.fn()
    render(<DriverVehicleScreen onBack={vi.fn()} onSaved={onSaved} />)
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }))
    await waitFor(() => expect(field(/^plate state$/i).getAttribute('aria-invalid')).toBe('true'))
    expect(screen.getByText('Choose the state the plate is registered in')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows network failures as a form error and lets the driver retry', async () => {
    const save = vi.spyOn(apiService, 'updateDriverVehicle').mockResolvedValue({ success: false, error: 'Unable to reach AID. Check your connection and try again.' })
    render(<DriverVehicleScreen onBack={vi.fn()} onSaved={vi.fn()} />)
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/unable to reach aid/i)
    expect((screen.getByRole('button', { name: 'Add vehicle' }) as HTMLButtonElement).disabled).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('clears a blocked go-online message once the vehicle is saved', async () => {
    vi.spyOn(apiService, 'updateDriverVehicle').mockResolvedValue({ success: true, data: TOW_TRUCK })
    useDriverStore.setState({ error: 'Add your vehicle and equipment details before going online.' })
    render(<DriverVehicleScreen onBack={vi.fn()} onSaved={vi.fn()} />)
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }))
    await waitFor(() => expect(useDriverStore.getState().error).toBeNull())
  })

  it('says which jobs the chosen equipment will be offered, from the server catalog', async () => {
    vi.spyOn(apiService, 'listServices').mockResolvedValue({ success: true, data: CATALOG })
    render(<DriverVehicleScreen onBack={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.queryByText(/jobs you'll be offered/i)).toBeNull()
    fireEvent.click(screen.getByLabelText(/light-duty/i))
    expect((await screen.findByText(/jobs you'll be offered/i)).textContent).toBe("Jobs you'll be offered: Won't start.")
    fireEvent.click(screen.getByLabelText(/flatbed/i))
    expect(screen.getByText(/jobs you'll be offered/i).textContent).toBe("Jobs you'll be offered: Won't start, Towing.")
  })
})
