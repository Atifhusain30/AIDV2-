import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import HomeScreen from './HomeScreen'
import { useAppStore } from '../store/useAppStore'

beforeEach(() => {
  useAppStore.setState({
    activeBooking: null,
    activeModal: null,
    currentScreen: 'home',
    userLocationLabel: '',
    serviceFormData: { selectedService: null, problemDescription: '', vehicleType: null },
    vehicles: [],
    activeVehicleId: null,
    bookingHistory: [],
  })
})

afterEach(() => cleanup())

describe('consumer roadside home', () => {
  it('makes location, service selection, and saved vehicle acceleration obvious', () => {
    render(<HomeScreen />)

    expect(screen.getByRole('button', { name: /Confirm your location/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'How can we help?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Won't start/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Flat tire/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Need a tow/i })).toBeTruthy()
    expect(screen.getByText('Add a vehicle to request faster')).toBeTruthy()
  })

  it('preselects the matching service when a shortcut is chosen', () => {
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /Won't start/i }))

    expect(useAppStore.getState().serviceFormData.selectedService).toBe('battery_jump')
    expect(useAppStore.getState().activeModal).toBe('services')
  })
})
