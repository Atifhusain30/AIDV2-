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

  it('opens the same request sheet for towing and EV charging', () => {
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /Need a tow/i }))
    expect(useAppStore.getState().serviceFormData.selectedService).toBe('towing')
    expect(useAppStore.getState().activeModal).toBe('services')
    cleanup()
    useAppStore.setState({ activeModal: null })
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /EV charge/i }))
    expect(useAppStore.getState().serviceFormData.selectedService).toBe('ev_charging')
    expect(useAppStore.getState().activeModal).toBe('services')
  })

  it('marks detailing and window tint as coming soon instead of faking a booking', () => {
    render(<HomeScreen />)
    for (const name of [/detailing/i, /window tint/i]) {
      const card = screen.getByRole('button', { name })
      expect(card.hasAttribute('disabled')).toBe(true)
      expect(card.textContent).toMatch(/coming soon/i)
    }
  })

  it('"Not sure what you need?" opens the sheet with no service preselected', () => {
    useAppStore.setState({ serviceFormData: { selectedService: 'towing', problemDescription: '', vehicleType: null } })
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /not sure what you need/i }))
    expect(useAppStore.getState().serviceFormData.selectedService).toBeNull()
    expect(useAppStore.getState().activeModal).toBe('services')
  })

  it('"Request again" reopens the sheet for the same service instead of creating a local booking', () => {
    useAppStore.setState({
      bookingHistory: [{
        id: 'old-1', status: 'completed', createdAt: new Date(), service: { id: 'towing', name: 'Towing', description: '', basePrice: 125, estimatedTime: 60 },
        location: { address: '1 Main', lat: 1, lng: 1 }, dropoffLocation: { address: 'Joe Garage', lat: 2, lng: 2 },
      }] as never,
    })
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /request again/i }))
    const state = useAppStore.getState()
    expect(state.activeModal).toBe('services')
    expect(state.serviceFormData.selectedService).toBe('towing')
    expect(state.serviceFormData.dropoff).toEqual({ address: 'Joe Garage', lat: 2, lng: 2 })
    expect(state.activeBooking).toBeNull()
    expect(state.bookingHistory).toHaveLength(1)
  })

  it('a live request takes over the top of Home: track it first, no second request offered', () => {
    useAppStore.setState({
      activeBooking: {
        id: 'b-live', status: 'en_route', createdAt: new Date(), estimatedPrice: 79,
        service: { id: 'flat_tire', name: 'Flat tire', description: '', basePrice: 79, estimatedTime: 35 },
        location: { address: '1 Main St', lat: 1, lng: 1 },
        driver: { id: 'd1', name: 'Sam D.', firstName: 'Sam' },
      } as never,
    })
    render(<HomeScreen />)
    const track = screen.getByRole('button', { name: /track active request/i })
    expect(track.textContent).toMatch(/Flat tire/)
    expect(screen.queryByRole('heading', { name: 'How can we help?' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Won't start/i })).toBeNull()
    fireEvent.click(track)
    expect(useAppStore.getState().currentScreen).toBe('chat')
  })

  it('vehicle care is a compact grid (nothing scrolls sideways off-screen)', () => {
    render(<HomeScreen />)
    const care = screen.getByRole('group', { name: 'Vehicle care' })
    expect(care.className).not.toMatch(/care-row/)
    expect(care.querySelectorAll('button')).toHaveLength(3)
  })

  it('does not promise 24/7 help and opens safety info instead', () => {
    render(<HomeScreen />)
    expect(screen.queryByText(/24\/7/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Safety/ }))
    expect(screen.getByRole('dialog', { name: 'Safety' })).toBeTruthy()
  })
})
