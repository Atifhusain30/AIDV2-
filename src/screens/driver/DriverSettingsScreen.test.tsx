import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DriverSettingsScreen from './DriverSettingsScreen'
import { useAuthStore } from '../../store/useAuthStore'

afterEach(() => cleanup())

describe('driver settings', () => {
  it('shows the signed-in driver and their saved vehicle, and every row does something', () => {
    useAuthStore.setState({ user: { id: 'd1', role: 'driver', firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com',
      vehicle: { make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed' } } as never })
    const handlers = { onBack: vi.fn(), onOpenDocuments: vi.fn(), onOpenVehicle: vi.fn(), onOpenHelp: vi.fn(), onLogout: vi.fn() }
    render(<DriverSettingsScreen {...handlers} />)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByText('Sam Lee')).toBeTruthy()
    expect(screen.getByText('sam@example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Documents/ }))
    fireEvent.click(screen.getByRole('button', { name: /Vehicle & equipment.*Ford F-550/ }))
    fireEvent.click(screen.getByRole('button', { name: /Help & Support/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    for (const handler of Object.values(handlers)) expect(handler).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Safety/ }))
    expect(screen.getByRole('dialog', { name: 'Safety' })).toBeTruthy()
  })
})
