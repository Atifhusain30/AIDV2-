import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import Button from './Button'
import { List, ListRow } from './ListRow'
import BottomSheet from './BottomSheet'
import { EmptyState, ErrorState } from './States'
import { SkeletonRows } from './Skeleton'
import OfflineBanner from './OfflineBanner'
import PersonAvatar, { initials } from './PersonAvatar'
import StepProgress from './StepProgress'
import StickyActionBar from './StickyActionBar'
import { reportServerReachable, resetConnectivityForTests } from '../../lib/connectivity'

afterEach(() => { cleanup(); resetConnectivityForTests() })

describe('design system primitives', () => {
  it('Button: one class per variant, loading disables and swaps the label', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button variant="secondary" onClick={onClick}>Keep</Button>)
    const button = screen.getByRole('button', { name: 'Keep' })
    expect(button.className).toContain('ui-btn--secondary')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<Button loading loadingLabel="Saving…">Save</Button>)
    const busy = screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect(busy.getAttribute('aria-busy')).toBe('true')
  })

  it('ListRow: a named button with title and subtitle inside one grouped list', () => {
    const onClick = vi.fn()
    render(<List label="More options"><ListRow title="Report an issue" subtitle="Not for emergencies" onClick={onClick} /></List>)
    expect(screen.getByRole('group', { name: 'More options' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Report an issue/ }))
    expect(onClick).toHaveBeenCalled()
  })

  it('BottomSheet: a named dialog with a close button and a pinned footer', () => {
    const onClose = vi.fn()
    render(<BottomSheet title="Choose a service" subtitle="Prices from the server" onClose={onClose} footer={<Button>Request</Button>}><p>Body</p></BottomSheet>)
    const dialog = screen.getByRole('dialog', { name: 'Choose a service' })
    expect(dialog.className).toContain('account-sheet')
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
    expect(dialog.querySelector('.ui-sheet__footer')?.textContent).toBe('Request')
  })

  it('EmptyState offers the next step; ErrorState is an alert with Try again', () => {
    const next = vi.fn()
    const retry = vi.fn()
    render(<><EmptyState title="No activity yet" body="Requests show here." action={{ label: 'Request help', onClick: next }} /><ErrorState title="Couldn't load your activity" onRetry={retry} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Request help' }))
    expect(next).toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load your activity/)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
  })

  it('Skeleton rows are a single polite loading status with no invented text', () => {
    render(<SkeletonRows count={3} label="Loading your activity" />)
    const status = screen.getByRole('status', { name: 'Loading your activity' })
    expect(status.textContent).toBe('')
  })

  it('OfflineBanner: hidden online; shown when the device is offline or the server is unreachable', () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => reportServerReachable(false))
    expect(screen.getByRole('status').textContent).toMatch(/Can't reach AID/)
    act(() => reportServerReachable(true))
    expect(screen.queryByRole('status')).toBeNull()
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(screen.getByRole('status').textContent).toMatch(/You're offline/)
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('PersonAvatar shows real initials only (never a made-up picture)', () => {
    expect(initials('Casey Customer')).toBe('CC')
    expect(initials('Marcus T.')).toBe('MT')
    expect(initials('  ')).toBe('')
    const { container } = render(<PersonAvatar name="Preview D." />)
    expect(container.firstElementChild?.getAttribute('data-initials')).toBe('PD')
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })

  it('StepProgress names the current step and its position', () => {
    render(<StepProgress label="Job progress" current={1} steps={[{ id: 'a', label: 'Accepted' }, { id: 'b', label: 'On the way' }, { id: 'c', label: 'Arrived' }]} />)
    expect(screen.getByRole('group', { name: 'Job progress' }).textContent).toContain('On the way · Step 2 of 3')
  })

  it('StickyActionBar keeps the primary action and its hint together', () => {
    render(<StickyActionBar hint="Tap when you reach the pickup"><Button>I've arrived</Button></StickyActionBar>)
    expect(screen.getByRole('button', { name: "I've arrived" }).parentElement?.className).toContain('ui-actionbar')
    expect(screen.getByText('Tap when you reach the pickup')).toBeTruthy()
  })
})
