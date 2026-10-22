// B11: server-authoritative realtime channel (Server-Sent Events).
//
// Why SSE on our own API (not Supabase Realtime): every table has RLS with no client policies (E1) —
// the API is the only gatekeeper. postgres_changes would need client read policies, and Broadcast
// would need a second authorization model. Here the API decides who hears what, exactly like it
// decides who can read what, and events carry no data: they only say "something changed", after
// which the app re-fetches through the normal, already-authorized endpoints.
//
// Flow:
//   1. POST /api/realtime/ticket (Authorization: Bearer <Supabase JWT>, same check as every route)
//      → { ticket, expiresInSeconds }. Random 32 bytes, single use, valid TICKET_TTL (30 s).
//      EventSource can't send headers, so the JWT never goes in a URL; only this throwaway ticket does
//      (and request logs never include query strings — security.js).
//   2. GET /api/realtime/stream?ticket=… → text/event-stream. The ticket is consumed on first use.
//      Events: ready, ping (heartbeat), booking, chat, requests, ratings, reauth (stream rotated).
//   3. The stream closes after maxStreamMs (default 30 min) with `reauth`; the app gets a fresh
//      ticket, which re-checks the session and account status.
//
// Delivery rules (never PII or coordinates in a payload — only ids the recipient already knows):
//   booking  { bookingId, reason }  → the booking's customer and assigned driver only
//   chat     { bookingId }          → the booking's customer and assigned driver only
//   ratings  {}                     → the person whose pending-ratings list changed
//   requests {}                     → connected, online drivers whose equipment can do the job and
//                                     whose last known position is within the request radius of it
//                                     (the app then re-fetches its normal, filtered request list).
//
// Fan-out goes through a bus with a tiny interface so a second API instance can share it later:
//   bus.publish(message); bus.subscribe(handler) → unsubscribe
// MemoryBus is single-process. LIMITATION: with more than one API instance, swap in a shared bus
// (Postgres LISTEN/NOTIFY on a dedicated, non-pooled connection, or Redis pub/sub). Messages on the
// bus may carry a job's pickup point and service type so each instance can match its own connected
// drivers; that stays server-side and is never written to a stream.

const { randomBytes } = require('crypto');
const { canPerformService } = require('./driverVehicle');
const { distanceTo } = require('./nearby');

const DEFAULTS = Object.freeze({
  ticketTtlMs: 30_000,
  maxConnectionsPerUser: 3,
  maxStreamMs: 30 * 60_000,
  heartbeatMs: 25_000,
  maxTickets: 10_000,
});

function realtimeConfigFromEnv(env = process.env) {
  const int = (name, fallback, min, max) => {
    const value = Number(env[name]);
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  };
  return {
    enabled: env.REALTIME_ENABLED !== 'false',
    maxConnectionsPerUser: int('REALTIME_MAX_CONNECTIONS_PER_USER', DEFAULTS.maxConnectionsPerUser, 1, 20),
    maxStreamMs: int('REALTIME_MAX_STREAM_MINUTES', DEFAULTS.maxStreamMs / 60_000, 1, 240) * 60_000,
    heartbeatMs: int('REALTIME_HEARTBEAT_SECONDS', DEFAULTS.heartbeatMs / 1000, 5, 120) * 1000,
  };
}

class MemoryBus {
  constructor() { this.handlers = new Set(); }
  publish(message) { for (const handler of this.handlers) handler(message); }
  subscribe(handler) { this.handlers.add(handler); return () => this.handlers.delete(handler); }
}

const EVENT_TYPES = new Set(['booking', 'chat', 'requests', 'ratings']);
const BOOKING_REASONS = new Set(['created', 'accepted', 'status', 'cancelled', 'expired', 'released', 'location', 'block', 'rating']);

/** What the hub needs to know about a job to route a signal (internal only). */
function jobTarget(booking) {
  if (!booking || !booking.id) return null;
  const pickup = booking.pickup || booking.location;
  return {
    id: booking.id,
    customerId: booking.customerId || null,
    driverId: booking.driverId || null,
    serviceType: booking.serviceType || booking.service?.id || null,
    vehicleIsElectric: Boolean(booking.vehicleIsElectric),
    pickup: pickup && Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng) ? { lat: pickup.lat, lng: pickup.lng } : null,
  };
}

function createRealtimeHub({
  bus = new MemoryBus(), clock = () => Date.now(), logger = { info() {}, warn() {}, debug() {} },
  ticketTtlMs = DEFAULTS.ticketTtlMs, maxConnectionsPerUser = DEFAULTS.maxConnectionsPerUser,
  maxStreamMs = DEFAULTS.maxStreamMs, heartbeatMs = DEFAULTS.heartbeatMs, radiusMiles = 25,
  timers = { setInterval, clearInterval, setTimeout, clearTimeout },
} = {}) {
  const tickets = new Map(); // ticket -> { userId, role, expiresAt, driver }
  const connections = new Map(); // userId -> Set<connection>
  const drivers = new Map(); // driverId -> { isOnline, equipmentType, position }
  let nextId = 1;
  let delivered = 0;

  function pruneTickets() {
    const now = clock();
    for (const [key, value] of tickets) if (value.expiresAt <= now) tickets.delete(key);
  }

  /** Step 1: an authenticated caller gets a short-lived, single-use ticket. */
  function issueTicket({ userId, role, driver = null }) {
    if (tickets.size >= DEFAULTS.maxTickets) pruneTickets();
    const ticket = randomBytes(32).toString('base64url');
    tickets.set(ticket, { userId, role, driver, expiresAt: clock() + ticketTtlMs });
    return { ticket, expiresInSeconds: Math.round(ticketTtlMs / 1000) };
  }

  /** Step 2: consume a ticket (single use). null when unknown, used or expired. */
  function redeemTicket(ticket) {
    if (typeof ticket !== 'string' || ticket.length < 20 || ticket.length > 100) return null;
    const session = tickets.get(ticket);
    if (!session) return null;
    tickets.delete(ticket);
    if (session.expiresAt <= clock()) return null;
    return session;
  }

  const countFor = (userId) => connections.get(userId)?.size || 0;
  const canConnect = (userId) => countFor(userId) < maxConnectionsPerUser;

  function write(connection, type, data) {
    if (connection.closed) return false;
    try {
      connection.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch (_error) {
      connection.close();
      return false;
    }
  }

  /** Attach an open SSE response for a redeemed session. Returns the connection (or null if over cap). */
  function attach(session, req, res, { position = null } = {}) {
    if (!canConnect(session.userId)) return null;
    const connection = {
      id: nextId++, userId: session.userId, role: session.role, res, openedAt: clock(), closed: false,
      close: () => {},
    };
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    if (!connections.has(session.userId)) connections.set(session.userId, new Set());
    connections.get(session.userId).add(connection);
    if (session.role === 'driver' && session.driver) {
      const known = drivers.get(session.userId) || {};
      drivers.set(session.userId, { ...known, ...session.driver, position: position || known.position || null });
    }
    const heartbeat = timers.setInterval(() => write(connection, 'ping', {}), heartbeatMs);
    const rotate = timers.setTimeout(() => {
      write(connection, 'reauth', {});
      connection.close();
    }, maxStreamMs);
    if (typeof heartbeat?.unref === 'function') heartbeat.unref();
    if (typeof rotate?.unref === 'function') rotate.unref();
    connection.close = () => {
      if (connection.closed) return;
      connection.closed = true;
      timers.clearInterval(heartbeat);
      timers.clearTimeout(rotate);
      const set = connections.get(connection.userId);
      if (set) {
        set.delete(connection);
        if (!set.size) {
          connections.delete(connection.userId);
          drivers.delete(connection.userId);
        }
      }
      try { res.end(); } catch (_error) { /* already gone */ }
      logger.debug({ msg: 'realtime stream closed', userId: connection.userId, seconds: Math.round((clock() - connection.openedAt) / 1000) });
    };
    req.on('close', connection.close);
    res.on('error', connection.close);
    write(connection, 'ready', { heartbeatSeconds: Math.round(heartbeatMs / 1000), maxStreamSeconds: Math.round(maxStreamMs / 1000) });
    logger.debug({ msg: 'realtime stream opened', userId: session.userId, role: session.role });
    return connection;
  }

  function sendTo(userId, type, data) {
    const set = connections.get(userId);
    if (!set) return 0;
    let count = 0;
    for (const connection of [...set]) if (write(connection, type, data)) count += 1;
    delivered += count;
    return count;
  }

  function driverMatches(state, job) {
    if (!state || !state.isOnline || !state.position || !job.pickup) return false;
    if (!canPerformService(state.equipmentType, job).ok) return false;
    return distanceTo(state.position, job.pickup) <= radiusMiles;
  }

  // Each instance delivers to its own connections.
  bus.subscribe((message) => {
    if (!message || !EVENT_TYPES.has(message.type)) return;
    if (message.type === 'requests' && message.job) {
      for (const [driverId, state] of drivers) {
        if (driverId === message.job.customerId) continue;
        if (driverMatches(state, message.job)) sendTo(driverId, 'requests', {});
      }
    }
    for (const userId of new Set(message.to || [])) if (userId) sendTo(userId, message.type, message.data || {});
  });

  // ---- what the API calls after each successful write ----
  /** A job changed: tell its customer and assigned driver (optionally not the one who made the change). */
  function bookingChanged(booking, reason = 'status', { except = null } = {}) {
    const job = jobTarget(booking);
    if (!job) return;
    const to = [job.customerId, job.driverId].filter((id) => id && id !== except);
    bus.publish({ type: 'booking', to, data: { bookingId: job.id, reason: BOOKING_REASONS.has(reason) ? reason : 'status' } });
  }
  /** New chat activity on a job (message sent or read). */
  function chatChanged(booking) {
    const job = jobTarget(booking);
    if (!job) return;
    bus.publish({ type: 'chat', to: [job.customerId, job.driverId].filter(Boolean), data: { bookingId: job.id } });
  }
  /** An open request appeared or disappeared: nearby compatible drivers re-fetch their list. */
  function requestsChanged(booking, { alsoTo = [] } = {}) {
    const job = jobTarget(booking);
    if (job) bus.publish({ type: 'requests', job, to: alsoTo, data: {} });
    else if (alsoTo.length) bus.publish({ type: 'requests', to: alsoTo, data: {} });
  }
  function ratingsChanged(userIds) {
    bus.publish({ type: 'ratings', to: userIds.filter(Boolean), data: {} });
  }
  /** Keep the in-memory picture of a connected driver current (never sent anywhere). */
  function updateDriver(driverId, patch) {
    const state = drivers.get(driverId);
    if (state) drivers.set(driverId, { ...state, ...patch });
  }

  function stats() {
    let open = 0;
    for (const set of connections.values()) open += set.size;
    return { open, users: connections.size, pendingTickets: tickets.size, delivered };
  }
  function closeAll() {
    for (const set of [...connections.values()]) for (const connection of [...set]) connection.close();
    tickets.clear();
  }

  return {
    issueTicket, redeemTicket, canConnect, attach, bookingChanged, chatChanged, requestsChanged, ratingsChanged,
    updateDriver, stats, closeAll, countFor, config: { ticketTtlMs, maxConnectionsPerUser, maxStreamMs, heartbeatMs, radiusMiles },
  };
}

/**
 * E4 expiry (lazy or sweep) ended some jobs: tell their customer/driver, and nearby drivers that an
 * open request is gone. `result` is repository.expireStaleBookings()'s { expired, released } ids.
 */
async function notifyEnded(hub, repository, result) {
  if (!hub || !result) return;
  const expired = result.expired || [];
  const released = result.released || [];
  if (!expired.length && !released.length) return;
  if (typeof repository.getRealtimeTargets !== 'function') return;
  const targets = await repository.getRealtimeTargets([...expired, ...released]);
  for (const target of targets) {
    const wasExpired = expired.includes(target.id);
    hub.bookingChanged(target, wasExpired ? 'expired' : 'released');
    if (wasExpired) hub.requestsChanged(target);
  }
}

module.exports = { createRealtimeHub, realtimeConfigFromEnv, MemoryBus, jobTarget, notifyEnded, DEFAULTS: DEFAULTS };
