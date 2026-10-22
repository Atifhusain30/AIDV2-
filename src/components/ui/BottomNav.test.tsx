import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import BottomNav from './BottomNav'
import { useAppStore } from '../../store/useAppStore'

afterEach(() => cleanup())

describe('BottomNav information architecture', () => {
  beforeEach(() => {
    useAppStore.setState({ currentScreen: 'home', activeModal: null })
  })

  it('keeps emergency help primary and moves messages into the active request', () => {
    render(<BottomNav />)

    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Activity' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Updates/i })).toBeNull()
  })
})
