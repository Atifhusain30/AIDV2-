import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import PendingRatingReminder from './PendingRatingReminder'
import { apiService } from '../../services/api'
import type { PendingRating } from '../../lib/ratings'

const pending = (bookingId: string, rateeFirstName = 'Marcus'): PendingRating => ({
  bookingId, serviceName: 'Towing', completedAt: '2026-10-22T12:00:00.000Z', rateeRole: 'driver', rateeFirstName,
  rateBy: '2026-10-29T12:00:00.000Z', tags: [{ id: 'on_time', label: 'On time' }], commentMaxLength: 500,
})

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('pending rating reminder on open (B15)', () => {
  it('asks once for a job still waiting, and "Not now" means it does not ask again', async () => {
    vi.spyOn(apiService, 'listPendingRatings').mockResolvedValue({ success: true, data: [pending('b1')] })
    const first = render(<PendingRatingReminder userId="u1" delayMs={0} />)
    expect(await screen.findByRole('dialog', { name: 'How was Marcus?' })).toBeTruthy()
    expect(screen.getByText("You haven't rated your towing with Marcus yet.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    first.unmount()

    // Next app open: same job still pending on the server, but it already had its reminder.
    render(<PendingRatingReminder userId="u1" delayMs={0} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('skips the job whose receipt is already asking, and shows nothing when nothing is pending', async () => {
    const list = vi.spyOn(apiService, 'listPendingRatings').mockResolvedValue({ success: true, data: [pending('b1')] })
    render(<PendingRatingReminder userId="u1" delayMs={0} busyBookingId={() => 'b1'} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(screen.queryByRole('dialog')).toBeNull()
    cleanup()

    list.mockResolvedValue({ success: true, data: [] })
    render(<PendingRatingReminder userId="u2" delayMs={0} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does nothing when signed out', async () => {
    const list = vi.spyOn(apiService, 'listPendingRatings')
    render(<PendingRatingReminder userId={null} delayMs={0} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(list).not.toHaveBeenCalled()
  })
})
