import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RatingSheet from './RatingSheet'
import { apiService } from '../../services/api'
import type { PendingRating } from '../../lib/ratings'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const pending = (overrides: Partial<PendingRating> = {}): PendingRating => ({
  bookingId: 'booking-1', serviceName: 'Towing', completedAt: '2026-10-22T12:00:00.000Z', rateeRole: 'driver', rateeFirstName: 'Marcus',
  rateBy: '2026-10-29T12:00:00.000Z', commentMaxLength: 500,
  tags: [{ id: 'on_time', label: 'On time' }, { id: 'professional', label: 'Professional' }, { id: 'careful_with_vehicle', label: 'Careful with vehicle' }, { id: 'friendly', label: 'Friendly' }],
  ...overrides,
})

describe('rating sheet (B15)', () => {
  it('submits stars, tags and a private note to the server, then thanks the customer', async () => {
    const submit = vi.spyOn(apiService, 'submitRating').mockResolvedValue({ success: true, data: { bookingId: 'booking-1', stars: 4 } })
    const onRated = vi.fn()
    render(<RatingSheet pending={pending()} context="after_job" onRated={onRated} onSkip={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'How was Marcus?' })).toBeTruthy()
    const send = screen.getByRole('button', { name: 'Choose stars to submit' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: '4 stars, Good' }))
    fireEvent.click(screen.getByRole('button', { name: 'On time' }))
    fireEvent.click(screen.getByRole('button', { name: 'Friendly' }))
    expect(screen.getByRole('button', { name: 'Friendly' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/Only the AID team sees this — Marcus won't/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Private note to AID (optional)'), { target: { value: '  Very careful  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit rating' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Thanks for rating' })).toBeTruthy())
    expect(submit).toHaveBeenCalledWith('booking-1', { stars: 4, tags: ['on_time', 'friendly'], comment: 'Very careful' })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onRated).toHaveBeenCalledTimes(1)
  })

  it('can be skipped without sending anything', () => {
    const submit = vi.spyOn(apiService, 'submitRating')
    const onSkip = vi.fn()
    render(<RatingSheet pending={pending()} context="after_job" onRated={vi.fn()} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(submit).not.toHaveBeenCalled()
  })

  it('the reminder says which job and offers "Not now"', () => {
    const onSkip = vi.fn()
    render(<RatingSheet pending={pending()} context="reminder" onRated={vi.fn()} onSkip={onSkip} />)
    expect(screen.getByText("You haven't rated your towing with Marcus yet.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onSkip).toHaveBeenCalled()
  })

  it('stars work from the keyboard and are announced, with large targets', () => {
    render(<RatingSheet pending={pending()} context="after_job" onRated={vi.fn()} onSkip={vi.fn()} />)
    const group = screen.getByRole('radiogroup', { name: 'Rating, 1 to 5 stars' })
    const stars = screen.getAllByRole('radio')
    expect(stars.map((star) => star.getAttribute('aria-label'))).toEqual(['1 star, Poor', '2 stars, Fair', '3 stars, Okay', '4 stars, Good', '5 stars, Great'])
    expect(stars.filter((star) => star.tabIndex === 0)).toHaveLength(1) // one tab stop for the group
    fireEvent.keyDown(stars[0], { key: 'ArrowRight' })
    expect(stars[1].getAttribute('aria-checked')).toBe('true')
    expect(stars[1].tabIndex).toBe(0)
    fireEvent.keyDown(stars[0], { key: 'End' })
    expect(stars[4].getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(stars[4], { key: 'ArrowLeft' })
    expect(stars[3].getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(stars[3])
    expect(group.contains(document.activeElement)).toBe(true)
    for (const star of stars) expect(star.className).toContain('rating-star') // 52px in rebrand.css
  })

  it('a driver rates the customer with the driver tag list', () => {
    render(<RatingSheet pending={pending({ rateeRole: 'customer', rateeFirstName: 'Casey', tags: [{ id: 'clear_location', label: 'Clear location' }, { id: 'ready_on_arrival', label: 'Ready on arrival' }, { id: 'respectful', label: 'Respectful' }] })} context="after_job" onRated={vi.fn()} onSkip={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'How was Casey?' })).toBeTruthy()
    expect(screen.getByText('Rate Casey for this towing job.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ready on arrival' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'On time' })).toBeNull()
  })

  it('shows the server error and keeps the rating to retry; an already-rated job just closes', async () => {
    const submit = vi.spyOn(apiService, 'submitRating').mockResolvedValueOnce({ success: false, error: 'Jobs can be rated for 7 days after they\'re completed' })
    render(<RatingSheet pending={pending()} context="after_job" onRated={vi.fn()} onSkip={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: '5 stars, Great' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit rating' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/7 days/)
    expect(screen.getByRole('radio', { name: '5 stars, Great' }).getAttribute('aria-checked')).toBe('true')
    submit.mockResolvedValueOnce({ success: false, error: "You've already rated this job", code: 'already_rated' })
    fireEvent.click(screen.getByRole('button', { name: 'Submit rating' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Thanks for rating' })).toBeTruthy())
  })

  it('limits the note to the server limit', () => {
    render(<RatingSheet pending={pending({ commentMaxLength: 500 })} context="after_job" onRated={vi.fn()} onSkip={vi.fn()} />)
    expect(screen.getByLabelText('Private note to AID (optional)').getAttribute('maxLength')).toBe('500')
    expect(screen.getByText(/0\/500/)).toBeTruthy()
  })
})
