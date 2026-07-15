import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import HistoryScreen from './HistoryScreen'
import { useAppStore } from '../store/useAppStore'

beforeEach(() => {
  useAppStore.setState({ activeBooking: null, bookingHistory: [], currentScreen: 'history' })
})

afterEach(() => cleanup())

describe('customer activity', () => {
  it('uses a simple activity feed rather than a calendar-first interface', () => {
    render(<HistoryScreen />)
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeTruthy()
    expect(screen.getByText('No roadside activity yet')).toBeTruthy()
    expect(screen.queryByText('January')).toBeNull()
  })

  it('returns the customer to roadside help from the empty state', () => {
    render(<HistoryScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Request roadside help' }))
    expect(useAppStore.getState().currentScreen).toBe('home')
  })
})
