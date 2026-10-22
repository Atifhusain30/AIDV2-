import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import BottomNav from './BottomNav'
import { useAppStore } from '../../store/useAppStore'

afterEach(() => cleanup())

describe('BottomNav information architecture', () => {
  beforeEach(() => {
    useAppStore.setState({ currentScreen: 'home', activeModal: null })
  })

  it('four tabs — Home · Activity · Garage · Account — and none is called "Help"', () => {
    render(<BottomNav />)
    const nav = screen.getByRole('navigation', { name: 'Customer navigation' })
    expect(within(nav).getAllByRole('button').map((tab) => tab.getAttribute('aria-label'))).toEqual(['Home', 'Activity', 'Garage', 'Account'])
    expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('button', { name: /^Help/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Updates/i })).toBeNull()
  })

  it('switches screens and marks the active tab', () => {
    const { rerender } = render(<BottomNav />)
    fireEvent.click(screen.getByRole('button', { name: 'Garage' }))
    expect(useAppStore.getState().currentScreen).toBe('garage')
    rerender(<BottomNav />)
    expect(screen.getByRole('button', { name: 'Garage' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(useAppStore.getState().currentScreen).toBe('home')
  })
})
