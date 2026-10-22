import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import BottomNav from './BottomNav'
import { useAppStore } from '../../store/useAppStore'

afterEach(() => cleanup())

describe('BottomNav information architecture', () => {
  beforeEach(() => {
    useAppStore.setState({ currentScreen: 'home', activeModal: null })
  })

  it('leads with Home (request help), and no tab is called "Help" (Help & Support lives under Account)', () => {
    render(<BottomNav />)

    const home = screen.getByRole('button', { name: 'Home' })
    expect(home.getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    fireEvent.click(home)
    expect(useAppStore.getState().currentScreen).toBe('home')
    expect(screen.queryByRole('button', { name: /^Help/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Activity' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Updates/i })).toBeNull()
  })
})
