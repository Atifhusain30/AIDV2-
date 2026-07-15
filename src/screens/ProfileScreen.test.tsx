import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ProfileScreen from './ProfileScreen'
import { useAppStore } from '../store/useAppStore'

beforeEach(() => {
  useAppStore.setState({ user: null, vehicles: [], activeVehicleId: null, currentScreen: 'profile' })
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
})
