import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AuthPortal from './AuthPortal'
import { useAuthStore } from '../../store/useAuthStore'

beforeEach(() => useAuthStore.setState({ isLoading: false, error: null, notice: null }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('sign in / sign up (first impression)', () => {
  it('labels every field and keeps one primary action', () => {
    render(<AuthPortal role="customer" onLoginSuccess={vi.fn()} onSwitchRole={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' }).className).toContain('ui-btn--primary')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect((screen.getByLabelText('Password') as HTMLInputElement).type).toBe('text')
  })

  it('switches to create account with name and phone fields', () => {
    render(<AuthPortal role="driver" onLoginSuccess={vi.fn()} onSwitchRole={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('heading', { name: 'Earn on your schedule.' })).toBeTruthy()
    expect(screen.getByLabelText('First name')).toBeTruthy()
    expect(screen.getByLabelText('Phone')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull()
  })

  it('after a sign-up that needs email confirmation, shows "Check your email" instead of the form', async () => {
    vi.spyOn(useAuthStore.getState(), 'customerRegister').mockImplementation(async () => {
      useAuthStore.setState({ notice: 'Check your email to confirm your account.' })
      return false
    })
    render(<AuthPortal role="customer" onLoginSuccess={vi.fn()} onSwitchRole={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy()
    expect(screen.getByText('alex@example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy())
  })

  it('shows a sent reset link as a confirmation, and a sign-in error as an alert tied to the fields', () => {
    useAuthStore.setState({ notice: 'Check your email for a password reset link.' })
    const { unmount } = render(<AuthPortal role="customer" onLoginSuccess={vi.fn()} onSwitchRole={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toMatch(/password reset link/)
    unmount()
    useAuthStore.setState({ notice: null, error: 'Wrong email or password.' })
    render(<AuthPortal role="customer" onLoginSuccess={vi.fn()} onSwitchRole={vi.fn()} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/Wrong email or password/)
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe(alert.id)
  })
})
