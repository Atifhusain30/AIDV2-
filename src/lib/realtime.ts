/**
 * B11: live updates from the AID server (Server-Sent Events) with polling as the automatic fallback.
 *
 * The server pushes tiny "something changed" signals — never data: a job changed, a new chat message,
 * the driver's request list changed, ratings to give. On a signal the app re-fetches through the
 * normal API (the server checks access there, as always). While the stream is open the screens poll
 * only every SAFETY_POLL_MS as a safety net; when it drops they go back to their usual intervals
 * (pollInterval) until it reconnects (backoff 1 s → 30 s with jitter).
 *
 * Connecting: POST /api/realtime/ticket (signed in) → single-use 30-second ticket →
 * EventSource(/api/realtime/stream?ticket=…). A fresh ticket every time: the session token never
 * goes in a URL, and the browser's own EventSource retry (which would re-use a spent ticket) is
 * replaced by ours. The server rotates streams every 30 min (`reauth`) and sends `ping` every 25 s;
 * no message for WATCHDOG_MS means the connection is dead and we reconnect.
 */

export type RealtimeEventType = 'booking' | 'chat' | 'requests' | 'ratings'
export interface RealtimeEvent {
  type: RealtimeEventType | 'resync'
  bookingId?: string
  reason?: string
}
/** off: not wanted (signed out, nothing live, app in background, or the server has it switched off). */
export type RealtimeStatus = 'off' | 'connecting' | 'open' | 'reconnecting'

export const SAFETY_POLL_MS = 30_000
export const RECONNECT_NOTICE_MS = 5_000
export const WATCHDOG_MS = 60_000
export const BACKOFF_BASE_MS = 1_000
export const BACKOFF_MAX_MS = 30_000
const DISABLED_RETRY_MS = 5 * 60_000

/** How often a screen polls: its usual interval when live updates are down, the safety net when up. */
export function pollInterval(baseMs: number, connected: boolean): number {
  return connected ? Math.max(baseMs, SAFETY_POLL_MS) : baseMs
}

/** Exponential backoff with ±20% jitter so many phones don't reconnect in lockstep. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt))
  return Math.round(base * (0.8 + random() * 0.4))
}

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: { data?: string }) => void): void
  close(): void
  onerror: ((event: unknown) => void) | null
}

export type TicketResult =
  | { ok: true; url: string }
  | { ok: false; retryAfterMs?: number; disabled?: boolean }

export interface RealtimeDeps {
  requestTicket: () => Promise<TicketResult>
  createEventSource: (url: string) => EventSourceLike
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (handle: unknown) => void
  random?: () => number
}

const SIGNALS: RealtimeEventType[] = ['booking', 'chat', 'requests', 'ratings']

export class RealtimeClient {
  status: RealtimeStatus = 'off'
  private deps: Required<RealtimeDeps>
  private source: EventSourceLike | null = null
  private retryTimer: unknown = null
  private watchdog: unknown = null
  private attempt = 0
  private wanted = false
  private paused = false
  private generation = 0
  private wasOpen = false
  private events = new Set<(event: RealtimeEvent) => void>()
  private statuses = new Set<(status: RealtimeStatus) => void>()

  constructor(deps: RealtimeDeps) {
    this.deps = {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
      random: Math.random,
      ...deps,
    }
  }

  subscribe(listener: (event: RealtimeEvent) => void): () => void {
    this.events.add(listener)
    return () => { this.events.delete(listener) }
  }

  onStatus(listener: (status: RealtimeStatus) => void): () => void {
    this.statuses.add(listener)
    return () => { this.statuses.delete(listener) }
  }

  /** Something on screen needs live updates. */
  start(): void {
    if (this.wanted) return
    this.wanted = true
    this.attempt = 0
    if (!this.paused) void this.connect()
  }

  /** Nothing needs live updates any more (signed out, no active job, driver offline). */
  stop(): void {
    this.wanted = false
    this.teardown()
    this.setStatus('off')
  }

  /** App went to the background: close the stream (polling pauses too). */
  pause(): void {
    if (this.paused) return
    this.paused = true
    this.teardown()
    this.setStatus('off')
  }

  /** Back in the foreground: reconnect right away and re-fetch once. */
  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.attempt = 0
    if (this.wanted) void this.connect()
  }

  private setStatus(status: RealtimeStatus): void {
    if (status === this.status) return
    this.status = status
    for (const listener of [...this.statuses]) listener(status)
  }

  private emit(event: RealtimeEvent): void {
    for (const listener of [...this.events]) listener(event)
  }

  private teardown(): void {
    this.generation += 1
    if (this.source) { this.source.close(); this.source = null }
    if (this.retryTimer) { this.deps.clearTimeout(this.retryTimer); this.retryTimer = null }
    if (this.watchdog) { this.deps.clearTimeout(this.watchdog); this.watchdog = null }
  }

  private armWatchdog(generation: number): void {
    if (this.watchdog) this.deps.clearTimeout(this.watchdog)
    this.watchdog = this.deps.setTimeout(() => {
      if (generation === this.generation) this.reconnectLater()
    }, WATCHDOG_MS)
  }

  private reconnectLater(minDelayMs = 0): void {
    this.teardown()
    if (!this.wanted || this.paused) return
    this.setStatus('reconnecting')
    const delay = Math.max(minDelayMs, backoffDelay(this.attempt, this.deps.random))
    this.attempt += 1
    const generation = this.generation
    this.retryTimer = this.deps.setTimeout(() => {
      this.retryTimer = null
      if (generation === this.generation) void this.connect()
    }, delay)
  }

  private async connect(): Promise<void> {
    this.teardown()
    const generation = this.generation
    this.setStatus(this.wasOpen || this.attempt > 0 ? 'reconnecting' : 'connecting')
    let ticket: TicketResult
    try {
      ticket = await this.deps.requestTicket()
    } catch {
      ticket = { ok: false }
    }
    if (generation !== this.generation || !this.wanted || this.paused) return
    if (!ticket.ok) {
      if (ticket.disabled) {
        // The server has live updates switched off: stay on polling quietly, check again later.
        this.setStatus('off')
        this.retryTimer = this.deps.setTimeout(() => { if (generation === this.generation) void this.connect() }, DISABLED_RETRY_MS)
        return
      }
      this.reconnectLater(ticket.retryAfterMs || 0)
      return
    }
    let source: EventSourceLike
    try {
      source = this.deps.createEventSource(ticket.url)
    } catch {
      this.reconnectLater()
      return
    }
    this.source = source
    const current = () => generation === this.generation
    source.addEventListener('ready', () => {
      if (!current()) return
      this.attempt = 0
      this.wasOpen = true
      this.setStatus('open')
      this.armWatchdog(generation)
      // Anything that changed while we were disconnected: re-fetch once.
      this.emit({ type: 'resync' })
    })
    source.addEventListener('ping', () => { if (current()) this.armWatchdog(generation) })
    source.addEventListener('reauth', () => {
      // Server rotated the stream (every 30 min): straight back with a fresh ticket.
      if (current()) { this.attempt = 0; void this.connect() }
    })
    for (const type of SIGNALS) {
      source.addEventListener(type, (message) => {
        if (!current()) return
        this.armWatchdog(generation)
        let data: { bookingId?: unknown; reason?: unknown } = {}
        try { data = message.data ? JSON.parse(message.data) : {} } catch { data = {} }
        this.emit({
          type,
          ...(typeof data.bookingId === 'string' ? { bookingId: data.bookingId } : {}),
          ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
        })
      })
    }
    source.onerror = () => {
      // Our own retry with a new ticket (the browser's retry would re-use the spent one).
      if (current()) this.reconnectLater()
    }
  }
}

// ---- one shared client for the whole app ----
let shared: RealtimeClient | null = null
let factory: (() => RealtimeClient) | null = null
const statusListeners = new Set<() => void>()
const eventListeners = new Set<(event: RealtimeEvent) => void>()
let unbind: (() => void) | null = null

function bind(client: RealtimeClient | null): void {
  if (unbind) { unbind(); unbind = null }
  shared = client
  if (client) {
    const offStatus = client.onStatus(() => statusListeners.forEach((listener) => listener()))
    const offEvents = client.subscribe((event) => [...eventListeners].forEach((listener) => listener(event)))
    unbind = () => { offStatus(); offEvents() }
  }
  statusListeners.forEach((listener) => listener())
}

/** Installed once by useRealtimeConnection (it knows the API). */
export function setRealtimeFactory(make: () => RealtimeClient): void {
  factory = make
}

export function getRealtime(): RealtimeClient | null {
  if (!shared && factory) bind(factory())
  return shared
}

/** Tests: replace (or clear) the shared client. */
export function setRealtimeClient(client: RealtimeClient | null): void {
  bind(client)
}

export function realtimeStatus(): RealtimeStatus {
  return shared?.status ?? 'off'
}

export function subscribeRealtimeStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => { statusListeners.delete(listener) }
}

/** Listen to live-update signals from whichever shared client is current. */
export function subscribeRealtime(listener: (event: RealtimeEvent) => void): () => void {
  eventListeners.add(listener)
  return () => { eventListeners.delete(listener) }
}
