import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PasswordRecoveryScreen from './PasswordRecoveryScreen'
import { managedAuth } from '../../auth/supabase'

vi.mock('../../auth/supabase', () => ({
  managedAuth: { updatePassword: vi.fn() },
}))

describe('PasswordRecoveryScreen', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('blocks mismatched passwords without updating the account', () => {
    render(<PasswordRecoveryScreen onComplete={vi.fn()} />)
    const fields = screen.getAllByPlaceholderText(/password|characters/i)
    fireEvent.change(fields[0], { target: { value: 'new-password' } })
    fireEvent.change(fields[1], { target: { value: 'different-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))

    expect(screen.getByRole('alert').textContent).toContain('Passwords do not match')
    expect(managedAuth.updatePassword).not.toHaveBeenCalled()
  })

  it('updates the password and returns to sign in', async () => {
    vi.mocked(managedAuth.updatePassword).mockResolvedValue({ success: true, message: 'Your password has been updated.' })
    const onComplete = vi.fn()
    render(<PasswordRecoveryScreen onComplete={onComplete} />)
    const fields = screen.getAllByPlaceholderText(/password|characters/i)
    fireEvent.change(fields[0], { target: { value: 'new-password' } })
    fireEvent.change(fields[1], { target: { value: 'new-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('updated'))
    fireEvent.click(screen.getByRole('button', { name: 'Return to sign in' }))
    expect(onComplete).toHaveBeenCalled()
  })
})
