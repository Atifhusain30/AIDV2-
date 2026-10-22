import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import {
  BACKOFF_MAX_MS, RECONNECT_NOTICE_MS, RealtimeClient, SAFETY_POLL_MS, WATCHDOG_MS, backoffDelay, pollInterval,
  setRealtimeClient, type EventSourceLike, type TicketResult,
} from './realtime'
import { useActiveBookingSync, BOOKING_POLL_MS } from './useActiveBookingSync'
import { useDriverJobSync, DRIVER_JOB_POLL_MS } from './useDriverJobSync'
import RealtimeNotice from '../components/ui/RealtimeNotice'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { useDriverStore } from '../store/useDriverStore'
import { apiService } from '../services/api'
import type { Booking } from '../types'

vi.mock('../services/api', () => ({ apiService: { getBooking: vi.fn(), createRealtimeTicket: vi.fn() } }))
vi.mock('../lib/notifications', () => ({ notifyBookingStatus: vi.fn(), initNotifications: vi.fn() }))

class FakeEventSource implements EventSourceLike {
  static all: FakeEventSource[] = []
  listeners: Record<string, Array<(event: { data?: string }) => void>> = {}
  onerror: ((event: unknown) => void) | null = null
  closed = false
  constructor(public url: string) { FakeEventSource.all.push(this) }
  addEventListener(type: string, listener: (event: { data?: string }) => void) { (this.listeners[type] ||= []).push(listener) }
  emit(type: string, data?: unknown) { (this.listeners[type] || []).forEach((listener) => listener({ data: data === undefined ? undefined : JSON.stringify(data) })) }
  fail() { this.onerror?.({}) }
  close() { this.closed = true }
}
const latest = () => FakeEventSource.all[FakeEventSource.all.length - 1]
const flush = () => act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve() })

let tickets: TicketResult[] = []
let ticketCalls = 0
function makeClient() {
  return new RealtimeClient({
    requestTicket: async () => { ticketCalls += 1; return tickets.shift() ?? { ok: true, url: `https://api.test/stream?ticket=t${ticketCalls}` } },
    createEventSource: (url) => new FakeEventSource(url),
    random: () => 0.5, // no jitter in tests
  })
}

const job = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-9', customerId: 'customer-1', status: 'en_route',
  service: { id: 'flat_tire', name: 'Flat tire', description: '', basePrice: 79, estimatedTime: 35 },
  location: { address: '500 Elm St', lat: 33.21, lng: -97.13 }, estimatedPrice: 79, createdAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  FakeEventSource.all = []
  tickets = []
  ticketCalls = 0
})
afterEach(() => { cleanup(); setRealtimeClient(null); vi.useRealTimers() })

describe('poll pacing and backoff', () => {
  it('polls at the usual pace when disconnected and slows to the safety net when connected', () => {
    expect(pollInterval(4000, false)).toBe(4000)
    expect(pollInterval(4000, true)).toBe(SAFETY_POLL_MS)
    expect(pollInterval(3000, true)).toBe(30_000)
  })
  it('backs off exponentially up to 30 s, with jitter', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map((n) => backoffDelay(n, () => 0.5))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
    expect(backoffDelay(0, () => 0)).toBe(800)
    expect(backoffDelay(0, () => 1)).toBe(1200)
    expect(backoffDelay(20, () => 1)).toBe(BACKOFF_MAX_MS * 1.2)
  })
})

describe('realtime client', () => {
  it('gets a fresh single-use ticket, opens the stream, and is open after ready', async () => {
    const client = makeClient()
    const statuses: string[] = []
    client.onStatus((status) => statuses.push(status))
    client.start()
    await flush()
    expect(latest().url).toBe('https://api.test/stream?ticket=t1')
    expect(client.status).toBe('connecting')
    latest().emit('ready', { heartbeatSeconds: 25 })
    expect(client.status).toBe('open')
    expect(statuses).toEqual(['connecting', 'open'])
  })

  it('passes signals on (ids only) and asks for a re-fetch after (re)connecting', async () => {
    const client = makeClient()
    const events: unknown[] = []
    client.subscribe((event) => events.push(event))
    client.start()
    await flush()
    latest().emit('ready', {})
    latest().emit('booking', { bookingId: 'b1', reason: 'accepted' })
    latest().emit('chat', { bookingId: 'b1' })
    latest().emit('requests', {})
    expect(events).toEqual([{ type: 'resync' }, { type: 'booking', bookingId: 'b1', reason: 'accepted' }, { type: 'chat', bookingId: 'b1' }, { type: 'requests' }])
  })

  it('on error closes the stream and reconnects with a NEW ticket after backoff (1 s, 2 s, 4 s…)', async () => {
    const client = makeClient()
    client.start()
    await flush()
    latest().emit('ready', {})
    const first = latest()
    first.fail()
    expect(first.closed).toBe(true)
    expect(client.status).toBe('reconnecting')
    await act(async () => { vi.advanceTimersByTime(999) })
    expect(ticketCalls).toBe(1)
    await act(async () => { vi.advanceTimersByTime(1) })
    await flush()
    expect(ticketCalls).toBe(2)
    expect(latest().url).toBe('https://api.test/stream?ticket=t2')
    latest().fail() // still down: next wait is 2 s
    await act(async () => { vi.advanceTimersByTime(1999) })
    expect(ticketCalls).toBe(2)
    await act(async () => { vi.advanceTimersByTime(1) })
    await flush()
    expect(ticketCalls).toBe(3)
    latest().emit('ready', {}) // back: backoff resets
    expect(client.status).toBe('open')
    latest().fail()
    await act(async () => { vi.advanceTimersByTime(1000) })
    await flush()
    expect(ticketCalls).toBe(4)
  })

  it('a refused ticket (server down / too many streams) retries later; switched off means quietly polling', async () => {
    tickets = [{ ok: false }, { ok: false, retryAfterMs: 30_000 }]
    const client = makeClient()
    client.start()
    await flush()
    expect(client.status).toBe('reconnecting')
    await act(async () => { vi.advanceTimersByTime(1000) })
    await flush()
    expect(ticketCalls).toBe(2)
    await act(async () => { vi.advanceTimersByTime(29_999) })
    expect(ticketCalls).toBe(2)
    await act(async () => { vi.advanceTimersByTime(1) })
    await flush()
    expect(ticketCalls).toBe(3)

    const off = makeClient()
    tickets = [{ ok: false, disabled: true }]
    off.start()
    await flush()
    expect(off.status).toBe('off')
  })

  it('reconnects when heartbeats stop (watchdog) and rotates immediately on reauth', async () => {
    const client = makeClient()
    client.start()
    await flush()
    latest().emit('ready', {})
    await act(async () => { vi.advanceTimersByTime(WATCHDOG_MS - 1) })
    latest().emit('ping', {}) // heartbeat resets the watchdog
    await act(async () => { vi.advanceTimersByTime(WATCHDOG_MS - 1) })
    expect(client.status).toBe('open')
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(client.status).toBe('reconnecting')
    await act(async () => { vi.advanceTimersByTime(1000) })
    await flush()
    latest().emit('ready', {})
    const before = ticketCalls
    latest().emit('reauth', {})
    await flush()
    expect(ticketCalls).toBe(before + 1)
  })

  it('closes in the background and reopens (with a re-fetch) in the foreground; stop ends it', async () => {
    const client = makeClient()
    client.start()
    await flush()
    latest().emit('ready', {})
    const stream = latest()
    client.pause()
    expect(stream.closed).toBe(true)
    expect(client.status).toBe('off')
    await act(async () => { vi.advanceTimersByTime(120_000) })
    expect(ticketCalls).toBe(1)
    client.resume()
    await flush()
    expect(ticketCalls).toBe(2)
    client.stop()
    expect(latest().closed).toBe(true)
    expect(client.status).toBe('off')
  })
})

function connectShared() {
  const client = makeClient()
  setRealtimeClient(client)
  client.start()
  return client
}

describe('customer active booking with live updates', () => {
  function Harness() { useActiveBookingSync(); return null }
  beforeEach(() => {
    useAuthStore.setState({ token: 'token-1' })
    useAppStore.setState({ activeBooking: job({ status: 'accepted' }), bookingHistory: [job({ status: 'accepted' })], endedBookingNotice: null, receiptBookingId: null })
    vi.mocked(apiService.getBooking).mockResolvedValue({ success: true, data: job({ status: 'en_route' }) })
  })

  it('re-fetches on a signal for this job, ignores other jobs, and slows polling to 30 s while connected', async () => {
    const client = connectShared()
    render(<Harness />)
    await flush()
    latest().emit('ready', {})
    await flush()
    const afterConnect = vi.mocked(apiService.getBooking).mock.calls.length
    latest().emit('booking', { bookingId: 'booking-9', reason: 'status' })
    await flush()
    expect(apiService.getBooking).toHaveBeenCalledTimes(afterConnect + 1)
    latest().emit('booking', { bookingId: 'someone-else', reason: 'status' })
    await flush()
    expect(apiService.getBooking).toHaveBeenCalledTimes(afterConnect + 1)
    // Connected: no 4 s polling.
    await act(async () => { vi.advanceTimersByTime(BOOKING_POLL_MS * 5) })
    await flush()
    expect(apiService.getBooking).toHaveBeenCalledTimes(afterConnect + 1)
    await act(async () => { vi.advanceTimersByTime(SAFETY_POLL_MS - BOOKING_POLL_MS * 5) })
    await flush()
    expect(apiService.getBooking).toHaveBeenCalledTimes(afterConnect + 2)
    expect(client.status).toBe('open')
  })

  it('falls back to 4 s polling as soon as the stream drops', async () => {
    connectShared()
    render(<Harness />)
    await flush()
    latest().emit('ready', {})
    await flush()
    latest().fail()
    await flush()
    const before = vi.mocked(apiService.getBooking).mock.calls.length
    tickets = [{ ok: false }, { ok: false }, { ok: false }, { ok: false }]
    await act(async () => { vi.advanceTimersByTime(BOOKING_POLL_MS) })
    await flush()
    await act(async () => { vi.advanceTimersByTime(BOOKING_POLL_MS) })
    await flush()
    expect(vi.mocked(apiService.getBooking).mock.calls.length).toBeGreaterThanOrEqual(before + 2)
  })

  it('a new chat message for this job refreshes the unread count', async () => {
    connectShared()
    render(<Harness />)
    await flush()
    latest().emit('ready', {})
    await flush()
    const before = vi.mocked(apiService.getBooking).mock.calls.length
    latest().emit('chat', { bookingId: 'booking-9' })
    await flush()
    expect(apiService.getBooking).toHaveBeenCalledTimes(before + 1)
  })
})

describe('driver job with live updates', () => {
  function Harness() { useDriverJobSync(); return null }
  it('syncs the job on a signal and polls at 5 s only while disconnected', async () => {
    const syncActiveJob = vi.fn(async () => {})
    useDriverStore.setState({ activeBooking: job({ id: 'job-1', status: 'en_route' }), syncActiveJob })
    connectShared()
    render(<Harness />)
    await flush()
    await act(async () => { vi.advanceTimersByTime(DRIVER_JOB_POLL_MS) })
    await flush()
    expect(syncActiveJob).toHaveBeenCalledTimes(1) // still connecting → normal polling
    latest().emit('ready', {})
    await flush()
    const connected = syncActiveJob.mock.calls.length
    await act(async () => { vi.advanceTimersByTime(DRIVER_JOB_POLL_MS * 3) })
    await flush()
    expect(syncActiveJob).toHaveBeenCalledTimes(connected)
    latest().emit('booking', { bookingId: 'job-1', reason: 'cancelled' })
    await flush()
    expect(syncActiveJob).toHaveBeenCalledTimes(connected + 1)
  })
})

describe('Reconnecting… notice', () => {
  it('appears only after a few seconds disconnected and hides once connected', async () => {
    connectShared()
    render(<RealtimeNotice />)
    await flush()
    expect(screen.queryByRole('status')).toBeNull()
    await act(async () => { vi.advanceTimersByTime(RECONNECT_NOTICE_MS - 1) })
    expect(screen.queryByRole('status')).toBeNull()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(screen.getByRole('status').textContent).toContain('Reconnecting…')
    await act(async () => { latest().emit('ready', {}) })
    expect(screen.queryByRole('status')).toBeNull()
    // A short blip never shows it.
    await act(async () => { latest().fail() })
    await act(async () => { vi.advanceTimersByTime(1000) })
    await flush()
    await act(async () => { latest().emit('ready', {}) })
    await act(async () => { vi.advanceTimersByTime(RECONNECT_NOTICE_MS * 2) })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stays hidden while live updates are simply off', async () => {
    setRealtimeClient(makeClient())
    render(<RealtimeNotice />)
    await act(async () => { vi.advanceTimersByTime(RECONNECT_NOTICE_MS * 3) })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
