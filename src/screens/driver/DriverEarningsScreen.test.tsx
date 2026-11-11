import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DriverEarningsScreen from './DriverEarningsScreen'
import { apiService } from '../../services/api'

vi.mock('../../services/api', () => ({ apiService: { getDriverEarnings: vi.fn(), startPayoutSetup: vi.fn() } }))

const base = { enabled: true, hasAccount: false, ready: false, payoutPercent: 80, pending: 55.2, paid: 0, thisWeek: 55.2,
  jobs: [{ bookingId: 'b-1', service: 'Battery Jump', jobStatus: 'completed', payoutStatus: 'pending', amount: 55.2, finishedAt: '2026-11-10T15:00:00Z' }] }

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => cleanup())

describe('driver earnings (C4)', () => {
  it('shows totals, the split and each job, and asks a new driver to set up payouts', async () => {
    vi.mocked(apiService.getDriverEarnings).mockResolvedValue({ success: true, data: base })
    render(<DriverEarningsScreen onBack={() => {}} />)
    expect(await screen.findByRole('heading', { name: 'Set up payouts' })).toBeTruthy()
    expect(screen.getAllByText('$55.20').length).toBeGreaterThan(1)
    expect(screen.getByText(/\$55\.20 is waiting for you/)).toBeTruthy()
    expect(screen.getByText(/you keep 80%/i)).toBeTruthy()
    expect(screen.getByText(/Nov 10 · waiting to send/i)).toBeTruthy()
  })

  it('opens Stripe\'s hosted setup page', async () => {
    vi.mocked(apiService.getDriverEarnings).mockResolvedValue({ success: true, data: base })
    vi.mocked(apiService.startPayoutSetup).mockResolvedValue({ success: true, data: { url: 'https://connect.stripe.com/setup/x' } })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<DriverEarningsScreen onBack={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /set up payouts/i }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://connect.stripe.com/setup/x', '_blank', 'noopener'))
  })

  it('once payouts are on, says so instead of asking', async () => {
    vi.mocked(apiService.getDriverEarnings).mockResolvedValue({ success: true, data: { ...base, hasAccount: true, ready: true } })
    render(<DriverEarningsScreen onBack={() => {}} />)
    expect(await screen.findByText(/payouts are on/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /set up payouts|continue setup/i })).toBeNull()
  })

  it('shows a load error', async () => {
    vi.mocked(apiService.getDriverEarnings).mockResolvedValue({ success: false, error: 'Unable to reach AID.' })
    render(<DriverEarningsScreen onBack={() => {}} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/unable to reach aid/i)
  })
})
