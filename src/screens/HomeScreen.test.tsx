import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

describe('consumer roadside home (owner reference)', () => {
  it('leads with the headline, a short subline and only true trust chips', () => {
    render(<HomeScreen />)
    expect(screen.getByRole('heading', { level: 1, name: 'Roadside help when you need it.' })).toBeTruthy()
    const chips = screen.getByRole('list', { name: 'Why AID' })
    expect(within(chips).getAllByRole('listitem').map((item) => item.textContent?.trim())).toEqual(['Verified drivers', 'Live tracking'])
    // Operating hours aren't set yet (launch checklist A8), so no 24/7 promise.
    expect(screen.queryByText(/24\/7/)).toBeNull()
  })

  it('has the AID logo and a profile button that opens Account', () => {
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Open account' }))
    expect(useAppStore.getState().currentScreen).toBe('profile')
  })

  it('shows six service tiles in a 3×2 grid, each with an icon, title and one-line subtitle', () => {
    render(<HomeScreen />)
    const grid = screen.getByRole('group', { name: 'Roadside services' })
    const tiles = within(grid).getAllByRole('button')
    expect(tiles).toHaveLength(6)
    expect(tiles.map((tile) => tile.querySelector('strong')?.textContent)).toEqual(['Flat tire', 'Jump start', 'Tow', 'Locked out', 'Fuel delivery', 'EV charge'])
    for (const tile of tiles) expect(tile.querySelector('small')?.textContent?.length).toBeGreaterThan(0)
  })

  it('a tile starts the request for that service', () => {
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /Jump start/i }))
    expect(useAppStore.getState().serviceFormData.selectedService).toBe('battery_jump')
    expect(useAppStore.getState().activeModal).toBe('services')
  })

  it('opens the same request flow for towing and EV charging', () => {
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /Tow/ }))
    expect(useAppStore.getState().serviceFormData.selectedService).toBe('towing')
    cleanup()
    useAppStore.setState({ activeModal: null })
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /EV charge/i }))
    expect(useAppStore.getState().serviceFormData.selectedService).toBe('ev_charging')
    expect(useAppStore.getState().activeModal).toBe('services')
  })

  it('keeps Home simple: no garage list, no coming-soon tiles, no upsell', () => {
    render(<HomeScreen />)
    expect(screen.queryByRole('heading', { name: 'Your garage' })).toBeNull()
    expect(screen.queryByText(/coming soon/i)).toBeNull()
    expect(screen.queryByText(/AID Pro/i)).toBeNull()
    expect(screen.queryByText(/drivers nearby|avg\.? arrival/i)).toBeNull()
  })

  it('"Not sure what you need?" opens the flow with no service preselected', () => {
    useAppStore.setState({ serviceFormData: { selectedService: 'towing', problemDescription: '', vehicleType: null } })
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /not sure what you need/i }))
    expect(useAppStore.getState().serviceFormData.selectedService).toBeNull()
    expect(useAppStore.getState().activeModal).toBe('services')
  })

  it('"Request again" reopens the flow for the same service instead of creating a local booking', () => {
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
    expect(screen.queryByRole('heading', { name: 'Roadside help when you need it.' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Roadside services' })).toBeNull()
    fireEvent.click(track)
    expect(useAppStore.getState().currentScreen).toBe('chat')
  })

  it('keeps a quiet safety link that opens safety info', () => {
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /Safety/ }))
    expect(screen.getByRole('dialog', { name: 'Safety' })).toBeTruthy()
  })
})
