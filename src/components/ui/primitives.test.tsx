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
import FlowStepper from './FlowStepper'
import SegmentedControl from './SegmentedControl'
import StatusPill from './StatusPill'
import VehicleCard from './VehicleCard'
import DriverCard from './DriverCard'
import ProgressRing from './ProgressRing'
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

  it('FlowStepper: four named steps, done steps checked, the current one marked for screen readers', () => {
    render(<FlowStepper current={1} />)
    const steps = screen.getByRole('list', { name: 'Request steps' })
    const items = steps.querySelectorAll('li')
    expect([...items].map((item) => item.textContent?.replace(/\(.*\)/, '').trim())).toEqual(['Location', 'Details', 'Driver', 'Complete'])
    expect(items[0].className).toContain('is-done')
    expect(items[1].getAttribute('aria-current')).toBe('step')
    expect(items[2].className).not.toMatch(/is-done|is-current/)
  })

  it('SegmentedControl: a radio group (Yes / No) with 44px+ options and no answer until one is picked', () => {
    const onChange = vi.fn()
    const { rerender } = render(<SegmentedControl label="Spare tire available?" value={null} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={onChange} />)
    const group = screen.getByRole('radiogroup', { name: 'Spare tire available?' })
    const yes = screen.getByRole('radio', { name: 'Yes' })
    expect(group.querySelectorAll('[aria-checked="true"]')).toHaveLength(0)
    fireEvent.click(yes)
    expect(onChange).toHaveBeenCalledWith('yes')
    rerender(<SegmentedControl label="Spare tire available?" value="yes" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'Yes' }).getAttribute('aria-checked')).toBe('true')
  })

  it('StatusPill: one pill per meaning (green done, red cancelled, violet live)', () => {
    render(<><StatusPill tone="success">Completed</StatusPill><StatusPill tone="danger">Cancelled</StatusPill><StatusPill tone="brand">Live</StatusPill></>)
    expect(screen.getByText('Completed').className).toContain('ui-pill--success')
    expect(screen.getByText('Cancelled').className).toContain('ui-pill--danger')
    expect(screen.getByText('Live').className).toContain('ui-pill--brand')
  })

  it('VehicleCard: the real vehicle, colour · plate, and a chevron only when tappable', () => {
    const onClick = vi.fn()
    const vehicle = { id: 'v', make: 'Honda', model: 'Civic', year: 2020, color: 'Blue', plate: 'ABC123' }
    const { rerender } = render(<VehicleCard vehicle={vehicle as never} label="Your vehicle" onClick={onClick} />)
    const card = screen.getByRole('button', { name: /Your vehicle.*2020 Honda Civic.*Blue · ABC123/ })
    fireEvent.click(card)
    expect(onClick).toHaveBeenCalled()
    rerender(<VehicleCard vehicle={vehicle as never} label="Your vehicle" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('2020 Honda Civic')).toBeTruthy()
  })

  it('DriverCard: initials avatar, real rating only from 3 ratings up, vehicle and plate badge', () => {
    const { rerender } = render(<DriverCard name="Preview D." rating={{ rating: 5, ratingCount: 328 }} vehicle="White Ford F-550" plate="TOW 77" />)
    expect(screen.getByRole('group', { name: 'Your driver' }).textContent).toMatch(/Preview D\..*5\.0.*\(328\).*White Ford F-550.*TOW 77/)
    expect(screen.getByLabelText('Rated 5.0 out of 5 from 328 ratings')).toBeTruthy()
    rerender(<DriverCard name="Dana S." rating={{ rating: 5, ratingCount: 2 }} vehicle="" />)
    expect(screen.getByRole('group', { name: 'Your driver' }).textContent).toMatch(/New on AID/)
    expect(screen.queryByText(/5\.0/)).toBeNull()
  })

  it('ProgressRing: a progressbar with the real value and a text label', () => {
    render(<ProgressRing value={0.5} label="Service progress">Changing tire</ProgressRing>)
    const ring = screen.getByRole('progressbar', { name: 'Service progress' })
    expect(ring.getAttribute('aria-valuenow')).toBe('50')
    expect(ring.textContent).toContain('Changing tire')
  })

  it('StickyActionBar keeps the primary action and its hint together', () => {
    render(<StickyActionBar hint="Tap when you reach the pickup"><Button>I've arrived</Button></StickyActionBar>)
    expect(screen.getByRole('button', { name: "I've arrived" }).parentElement?.className).toContain('ui-actionbar')
    expect(screen.getByText('Tap when you reach the pickup')).toBeTruthy()
  })
})
