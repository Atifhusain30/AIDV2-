/**
 * F4 accessibility: every main screen and state renders with no serious or critical axe-core
 * violations, and every dialog / sheet behaves the same for keyboard and screen-reader users
 * (shared Dialog: named, aria-modal, focus moves in, Tab is trapped, Escape closes when safe,
 * the background is inert, focus returns to the button that opened it).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { seriousA11yViolations } from './test/axe'
import { shouldAnnounceEta, ETA_ANNOUNCE_MIN_MS } from './lib/announce'
import App from './App'
import HomeScreen from './screens/HomeScreen'
import HistoryScreen from './screens/HistoryScreen'
import UpdatesScreen from './screens/UpdatesScreen'
import ProfileScreen from './screens/ProfileScreen'
import HelpSupportScreen from './screens/HelpSupportScreen'
import CustomerTrackingScreen from './screens/customer/CustomerTrackingScreen'
import { CustomerLoginScreen } from './screens/customer'
import { DriverHomeScreen, DriverJobScreen, DriverOnboardingScreen, DriverVehicleScreen } from './screens/driver'
import RatingSheet from './components/rating/RatingSheet'
import { Call911Button, SafetySheet } from './components/safety/Safety'
import { ConfirmSheet } from './components/job/JobSheets'
import JobChat from './components/chat/JobChat'
import BottomNav from './components/ui/BottomNav'
import { useAppStore } from './store/useAppStore'
import { useAuthStore } from './store/useAuthStore'
import { useDriverStore } from './store/useDriverStore'
import type { Booking } from './types'
import type { PendingRating } from './lib/ratings'

vi.mock('./lib/notifications', () => ({ initNotifications: vi.fn(), registerNotificationTapHandler: vi.fn() }))
vi.mock('./lib/leafletFix', () => ({ applyLeafletIconFix: vi.fn() }))
vi.mock('./components/tracking/LiveDriverMap', () => ({ default: () => null }))
vi.mock('./services/api', () => {
  const ok = (data: unknown) => vi.fn(async () => ({ success: true, data }))
  return {
    apiService: {
      listServices: ok([{ id: 'flat_tire', name: 'Flat tire', description: 'Tire change', basePrice: 79, estimatedTime: 35, available: true, requiresDropoff: false }]),
      quoteBooking: ok(null), listBookings: ok([]), listVehicles: ok([]), getSupportConfig: ok({ contact: { email: null, phone: null }, messageMaxLength: 2000, reportsPerHour: 10 }),
      listSupportReports: ok([]), listPendingRatings: ok([]), getServiceRequests: ok({ status: 'ok', radiusMiles: 25, requests: [] }),
      getDriverActiveBooking: ok(undefined), listJobMessages: ok({ state: 'open', unread: 0, blockedByMe: false, readOnlyUntil: null, bookingStatus: 'en_route', messages: [], cursor: null, maxLength: 1000 }),
      markJobMessagesRead: ok({ marked: 0 }), sendJobMessage: ok(null), blockJobParty: ok(null), createSupportReport: ok(null), submitRating: ok(null),
      updateBookingStatus: ok(null), getProfile: ok(null), deleteAccount: ok(null), updateDriverVehicle: ok(null),
    },
  }
})

const NOW = Date.now()
const job = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-9', customerId: 'customer-1', driverId: 'driver-1', status: 'en_route',
  service: { id: 'towing', name: 'Towing', description: '', basePrice: 152.15, estimatedTime: 60 },
  location: { address: '500 Elm St, Denton, TX', lat: 33.21, lng: -97.13 },
  dropoffLocation: { address: "Joe's Garage", lat: 33.05, lng: -96.99 },
  estimatedPrice: 152.15, notes: 'Hazards on',
  vehicle: { vehicleId: 'veh-1', label: '2020 Honda Civic', plate: 'ABC123', color: 'Blue' },
  customer: { name: 'Casey C.', firstName: 'Casey', phone: '+194****0100' },
  driver: { id: 'driver-1', name: 'Marcus T.', firstName: 'Marcus', phone: '+194****0199', ratingCount: 0, totalJobs: 3, vehicle: { make: 'Ford', model: 'F-550', color: 'White', plate: 'TOW-77' } },
  driverLocation: { lat: 33.1, lng: -97.0, updatedAt: new Date(NOW - 8000).toISOString() },
  driverEta: { miles: 13.4, minutes: 27, approximate: true, fromLocationAt: new Date(NOW - 8000).toISOString() },
  createdAt: new Date(NOW - 600_000),
  ...overrides,
} as Booking)
const pending: PendingRating = { bookingId: 'b1', serviceName: 'Towing', completedAt: new Date().toISOString(), rateeRole: 'driver', rateeFirstName: 'Marcus', rateBy: new Date(NOW + 86_400_000).toISOString(), tags: [{ id: 'on_time', label: 'On time' }] as never, commentMaxLength: 500 }
const customer = { id: 'customer-1', email: 'c@aid.test', phone: '', firstName: 'Casey', lastName: 'C', name: 'Casey C', role: 'customer', createdAt: new Date() }
const driver = { id: 'driver-1', email: 'd@aid.test', phone: '', firstName: 'Alex', lastName: 'R', role: 'driver', createdAt: new Date(), isOnline: false, isVerified: true, verificationStatus: 'verified', documents: [], totalJobs: 0, specializations: [] }
const noop = () => undefined

/** Render inside the app's own landmark, as the shells do. */
const inMain = (node: React.ReactNode) => render(<main>{node}</main>)
async function expectNoSeriousViolations() {
  // Let async effects (catalog/reports loads) settle first.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  expect(await seriousA11yViolations()).toEqual([])
}

beforeEach(() => {
  // As in index.html / admin/index.html.
  document.documentElement.lang = 'en'
  document.title = 'AID'
  useAuthStore.setState({ isAuthenticated: false, user: null, token: null, isLoading: false, error: null })
  useAppStore.setState({ activeBooking: null, bookingHistory: [], currentScreen: 'home', activeModal: null, vehicles: [], userLocationLabel: '500 Elm St, Denton, TX', userCoords: { lat: 33.21, lng: -97.13 } as never })
  useDriverStore.setState({ isOnline: false, incomingRequests: [], activeBooking: null, isLoading: false, currentLocation: null, error: null, jobEndedNotice: null, locationSharing: 'sharing' as never })
})
afterEach(() => { cleanup(); document.body.innerHTML = '' })

describe('axe: no serious or critical violations (F4)', () => {
  it('role chooser', async () => { render(<App />); await expectNoSeriousViolations() })
  it('sign-in, with an error tied to the fields', async () => {
    useAuthStore.setState({ error: 'Email or password is incorrect.' })
    render(<CustomerLoginScreen onLoginSuccess={noop} onSwitchToDriver={noop} />)
    const email = screen.getByLabelText('Email')
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(email.getAttribute('aria-describedby')!)?.textContent).toMatch(/incorrect/)
    await expectNoSeriousViolations()
  })
  it('customer home + bottom navigation', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: customer as never })
    render(<><main><HomeScreen /></main><BottomNav /></>)
    await expectNoSeriousViolations()
  })
  it('request sheet (service picked)', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: customer as never })
    useAppStore.setState({ activeModal: 'services' as never, serviceFormData: { selectedService: 'flat_tire', problemDescription: '', vehicleType: null } as never })
    inMain(<HomeScreen />)
    await screen.findByRole('dialog', { name: 'Flat tire' })
    await expectNoSeriousViolations()
  })
  it('activity', async () => { inMain(<HistoryScreen />); await expectNoSeriousViolations() })
  it('updates, no active request', async () => { inMain(<UpdatesScreen />); await expectNoSeriousViolations() })
  it('account', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: customer as never })
    inMain(<ProfileScreen />)
    await expectNoSeriousViolations()
  })
  it('help & support', async () => { inMain(<HelpSupportScreen audience="customer" onBack={noop} />); await screen.findByText(/common questions/i); await expectNoSeriousViolations() })
  for (const status of ['accepted', 'en_route', 'arrived', 'in_progress'] as const) {
    it(`customer tracking: ${status}`, async () => { inMain(<CustomerTrackingScreen booking={job({ status })} />); await expectNoSeriousViolations() })
  }
  it('driver home', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: driver as never })
    inMain(<DriverHomeScreen onOpenOnboarding={noop} onOpenVehicle={noop} onOpenSettings={noop} onOpenActiveJob={noop} />)
    await expectNoSeriousViolations()
  })
  for (const status of ['accepted', 'en_route', 'arrived', 'in_progress'] as const) {
    it(`driver job: ${status}`, async () => {
      useDriverStore.setState({ activeBooking: job({ status }), updateJobStatus: vi.fn(async () => true) as never })
      inMain(<DriverJobScreen onBack={noop} />)
      await expectNoSeriousViolations()
    })
  }
  it('driver vehicle form with errors', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: driver as never })
    inMain(<DriverVehicleScreen onBack={noop} onSaved={noop} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }))
    const make = screen.getByLabelText('Make')
    expect(make.getAttribute('aria-invalid')).toBe('true')
    expect(make.getAttribute('aria-describedby')).toBeTruthy()
    await expectNoSeriousViolations()
  })
  it('driver verification', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: driver as never })
    useDriverStore.setState({
      fetchVerification: vi.fn(async () => null) as never,
      verification: { status: 'pending', reviewNotes: null, submittedAt: null, reviewedAt: null, credentialsValidUntil: null, requiredDocuments: [], documents: [],
        readiness: { missing: ['drivers_license'], rejected: [], unapproved: [], expired: [], canSubmit: false, canVerify: false, credentialsValidUntil: null } } as never,
    })
    inMain(<DriverOnboardingScreen onComplete={noop} onOpenVehicle={noop} />)
    await expectNoSeriousViolations()
  })
  it('rating sheet (star radio group)', async () => {
    render(<RatingSheet pending={pending} context="after_job" onRated={noop} onSkip={noop} />)
    expect(screen.getByRole('radiogroup', { name: /rating/i })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    await expectNoSeriousViolations()
  })
  it('safety sheet', async () => { render(<SafetySheet audience="customer" onClose={noop} />); await expectNoSeriousViolations() })
  it('cancel confirmation with reasons', async () => {
    render(<ConfirmSheet id="c" title="Cancel this request?" text="The driver is told." confirmLabel="Yes, cancel" busyLabel="Cancelling…" keepLabel="Keep request" busy={false} tone="danger"
      reasons={[{ id: 'a', label: 'Found other help' }]} onConfirm={noop} onClose={noop} />)
    await expectNoSeriousViolations()
  })
  it('chat', async () => {
    render(<JobChat bookingId="booking-9" audience="customer" otherName="Marcus" serviceName="Towing" onClose={noop} />)
    await screen.findByText('No messages yet')
    await expectNoSeriousViolations()
  })
})

describe('shared dialog behaviour (F4)', () => {
  it('Call 911 confirm: named alertdialog, focus moves in, Tab is trapped, Escape closes, focus returns, background inert', async () => {
    render(<><main><button type="button">Behind</button><Call911Button /></main></>)
    const trigger = screen.getByRole('button', { name: 'Call 911' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('alertdialog', { name: 'Call 911?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-describedby')).toBe('call-911-text')
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.querySelector('main')!.closest('[inert]')).not.toBeNull()

    // Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last.
    const call = within(dialog).getByRole('link', { name: 'Call 911 now' })
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    cancel.focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(document.activeElement).toBe(call)
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel)

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.querySelector('main')!.closest('[inert]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('a busy confirmation ignores Escape (nothing is lost mid-save)', () => {
    const onClose = vi.fn()
    render(<ConfirmSheet id="c" title="Complete this job?" text="x" confirmLabel="Complete" busyLabel="Completing…" keepLabel="Not yet" busy tone="primary" onConfirm={noop} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('nested: Escape closes only the top dialog (block confirm over the chat)', async () => {
    const onClose = vi.fn()
    render(<JobChat bookingId="booking-9" audience="customer" otherName="Marcus" serviceName="Towing" onClose={onClose} />)
    await screen.findByText('No messages yet')
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Report Marcus' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Block Marcus' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Block Marcus' }))
    expect(screen.getByRole('alertdialog', { name: 'Block Marcus?' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Marcus' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('every sheet in the app uses the shared dialog (no hand-rolled role="dialog")', () => {
    const sources = import.meta.glob(['./**/*.tsx', '../admin/src/**/*.tsx', '!./**/*.test.tsx', '!../admin/src/**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const handRolled = Object.entries(sources)
      .filter(([file]) => !file.endsWith('/components/ui/Dialog.tsx') && !file.endsWith('/components/chat/JobChat.tsx'))
      .filter(([, text]) => /aria-modal|<(div|section|form|aside)\b[^>]*\brole="(alert)?dialog"/.test(text))
      .map(([file]) => file)
    // Unused legacy UI-kit files (F6 dead code) are the only exceptions.
    expect(handRolled.filter((file) => !/components\/ui\/(Modal|BottomSheet)\.tsx$/.test(file))).toEqual([])
    // JobChat is full-screen and uses the same useDialog hook.
    expect(sources['./components/chat/JobChat.tsx']).toMatch(/useDialog\(/)
  })
})

describe('screen-reader announcements (F4)', () => {
  it('the customer hears job status changes, politely', () => {
    const { rerender } = render(<CustomerTrackingScreen booking={job({ status: 'en_route' })} />)
    const region = document.querySelector('[aria-live="polite"][data-live-region]')!
    expect(region.textContent).toBe('')
    rerender(<CustomerTrackingScreen booking={job({ status: 'arrived', driverEta: undefined })} />)
    expect(region.textContent).toMatch(/Marcus has arrived\. Look for the White Ford F-550/)
  })

  it('the driver hears status changes', () => {
    useDriverStore.setState({ activeBooking: job({ status: 'en_route' }), updateJobStatus: vi.fn(async () => true) as never })
    render(<DriverJobScreen onBack={noop} />)
    const region = document.querySelector('[aria-live="polite"][data-live-region]')!
    act(() => useDriverStore.setState({ activeBooking: job({ status: 'arrived' }) }))
    expect(region.textContent).toMatch(/Job status: Arrived/i)
  })

  it('ETA is read out only when the minutes change, at most once a minute', () => {
    const t0 = 1_000_000
    expect(shouldAnnounceEta(null, 20, t0)).toBe(false)
    expect(shouldAnnounceEta({ minutes: 20, at: t0 }, 20, t0 + ETA_ANNOUNCE_MIN_MS * 5)).toBe(false)
    expect(shouldAnnounceEta({ minutes: 20, at: t0 }, 19, t0 + 10_000)).toBe(false)
    expect(shouldAnnounceEta({ minutes: 20, at: t0 }, 18, t0 + ETA_ANNOUNCE_MIN_MS)).toBe(true)
    expect(shouldAnnounceEta({ minutes: 20, at: t0 }, null, t0 + ETA_ANNOUNCE_MIN_MS)).toBe(false)
  })

  it('the map has a text alternative and nothing inside it is focusable', () => {
    render(<CustomerTrackingScreen booking={job()} />)
    const map = screen.getByRole('region', { name: 'Map' })
    expect(map.textContent).toMatch(/Marcus is about 13\.4 miles and 27 minutes from your pickup at 500 Elm St/)
    expect(map.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })
})
