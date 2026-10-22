// E3: shared request rate limiter.
//
// Fixed-window counters keyed by "<limit name>:<who>", where who is the signed-in user (route limits,
// applied after authentication) or the client IP (the global ceiling, applied before it).
//
// Storage is behind a tiny interface so it can move to Redis without touching routes:
//   store.hit(key, windowMs) -> { count, resetAt }   (may return a Promise)
// MemoryStore keeps counters in this process only. LIMITATION: with more than one API instance each
// instance counts separately (a client can get N × the limit) and counters reset on restart. Run a
// single instance or swap in a shared store (Redis INCR + PEXPIRE) before scaling out.
//
// Two business rules keep their own durable, database-backed counts and are NOT replaced by this:
// support reports (10 per person per hour, server/support.js) and chat messages (30 per person per
// minute, server/chat.js). Those survive restarts and are correct across instances; the limits here
// sit in front of them as a cheap first line.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Sized from the apps' real polling (src/lib/*): booking poll 4 s, driver job poll 5 s, chat 3 s,
// driver location at most every 5 s (+30 s heartbeat), request list every 30 s. One phone polls at
// most ~50 requests a minute; both apps on one IP for an hour stay far below every limit
// (proven in test/chat.test.js).
const DEFAULT_LIMITS = Object.freeze({
  // Every request except /health, per client IP. Generous because many phones can share one carrier IP.
  global: { max: 600, windowMs: MINUTE, env: 'RATE_LIMIT_GLOBAL_PER_MINUTE' },
  // Per signed-in user:
  bookingCreate: { max: 20, windowMs: HOUR, env: 'RATE_LIMIT_BOOKING_CREATE_PER_HOUR' },
  quote: { max: 120, windowMs: HOUR, env: 'RATE_LIMIT_QUOTES_PER_HOUR' },
  accept: { max: 30, windowMs: 10 * MINUTE, env: 'RATE_LIMIT_ACCEPT_PER_10_MINUTES' },
  statusChange: { max: 60, windowMs: 10 * MINUTE, env: 'RATE_LIMIT_STATUS_CHANGES_PER_10_MINUTES' },
  // Driver location on a job (every 5 s = 12/min) plus the request list (every 30 s, carries position).
  location: { max: 60, windowMs: MINUTE, env: 'RATE_LIMIT_LOCATION_PER_MINUTE' },
  documentUpload: { max: 20, windowMs: HOUR, env: 'RATE_LIMIT_DOCUMENT_UPLOADS_PER_HOUR' },
  ratings: { max: 20, windowMs: HOUR, env: 'RATE_LIMIT_RATINGS_PER_HOUR' },
  reports: { max: 20, windowMs: HOUR, env: 'RATE_LIMIT_REPORTS_PER_HOUR' },
  chatSend: { max: 60, windowMs: MINUTE, env: 'RATE_LIMIT_CHAT_SENDS_PER_MINUTE' },
  block: { max: 10, windowMs: HOUR, env: 'RATE_LIMIT_BLOCKS_PER_HOUR' },
  accountChange: { max: 60, windowMs: HOUR, env: 'RATE_LIMIT_ACCOUNT_CHANGES_PER_HOUR' },
});

function rateLimitsFromEnv(env = process.env) {
  const limits = { enabled: env.RATE_LIMITS_ENABLED !== 'false' };
  for (const [name, { max, windowMs, env: key }] of Object.entries(DEFAULT_LIMITS)) {
    const configured = Number(env[key]);
    limits[name] = { max: Number.isInteger(configured) && configured > 0 ? configured : max, windowMs };
  }
  return limits;
}

class MemoryStore {
  constructor({ clock = () => Date.now(), sweepEvery = 1000 } = {}) {
    this.clock = clock;
    this.counters = new Map();
    this.hits = 0;
    this.sweepEvery = sweepEvery;
  }

  hit(key, windowMs) {
    const now = this.clock();
    this.hits += 1;
    if (this.hits % this.sweepEvery === 0) this.sweep();
    let entry = this.counters.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      this.counters.set(key, entry);
    }
    entry.count += 1;
    return { count: entry.count, resetAt: entry.resetAt };
  }

  sweep() {
    const now = this.clock();
    for (const [key, entry] of this.counters) if (entry.resetAt <= now) this.counters.delete(key);
  }

  size() { return this.counters.size; }
}

const userOrIpKey = (req) => (req.auth?.identity?.id ? `u:${req.auth.identity.id}` : `ip:${req.ip}`);
const ipKey = (req) => `ip:${req.ip}`;

// Shared 429 answer, also used by the database-backed chat/report rules.
function sendRateLimited(res, retryAfterSeconds, body = {}) {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  res.set('Retry-After', String(seconds));
  return res.status(429).json({
    error: `Too many requests. Please wait ${seconds} second${seconds === 1 ? '' : 's'} and try again.`,
    code: 'rate_limited',
    retryAfterSeconds: seconds,
    ...body,
  });
}

function createRateLimiter({ name, max, windowMs, store, clock = () => Date.now(), key = userOrIpKey, enabled = true }) {
  if (!enabled) return (_req, _res, next) => next();
  return async function rateLimit(req, res, next) {
    try {
      const { count, resetAt } = await store.hit(`${name}:${key(req)}`, windowMs);
      const resetSeconds = Math.max(0, Math.ceil((resetAt - clock()) / 1000));
      res.set('RateLimit-Limit', String(max));
      res.set('RateLimit-Remaining', String(Math.max(0, max - count)));
      res.set('RateLimit-Reset', String(resetSeconds));
      if (count > max) {
        res.locals.rateLimited = name;
        return sendRateLimited(res, resetSeconds);
      }
      next();
    } catch (error) { next(error); }
  };
}

// One store, one limiter per named rule.
function createLimiters({ limits = rateLimitsFromEnv(), store, clock = () => Date.now() } = {}) {
  const shared = store || new MemoryStore({ clock });
  const limiters = {};
  for (const name of Object.keys(DEFAULT_LIMITS)) {
    const { max, windowMs } = limits[name] || DEFAULT_LIMITS[name];
    limiters[name] = createRateLimiter({ name, max, windowMs, store: shared, clock, key: name === 'global' ? ipKey : userOrIpKey, enabled: limits.enabled !== false });
  }
  return limiters;
}

module.exports = { DEFAULT_LIMITS, MemoryStore, createRateLimiter, createLimiters, rateLimitsFromEnv, sendRateLimited };
