// E8: security headers, CORS allowlist, request ids + structured request logs, and the error
// handler. Everything here is configuration-driven (see securityConfigFromEnv / env.sample).
const { randomUUID } = require('crypto');
const cors = require('cors');
const { redact, redactString, serializeError } = require('./redact');

// Native apps: iOS WebView (capacitor://localhost; ionic:// for older builds), Android WebView
// (https://localhost with androidScheme 'https'; http://localhost otherwise). Local dev: admin site
// (Vite, 5173) and the customer/driver app in a browser (Vite, 3000). Production adds the admin domain.
const DEFAULT_CORS_ORIGINS = Object.freeze([
  'capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost',
  'http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://localhost:3000',
]);

function parseOrigins(value) {
  return (Array.isArray(value) ? value : String(value || '').split(',')).map((origin) => origin.trim()).filter(Boolean);
}
function corsOriginsFromEnv(env = process.env) {
  const configured = parseOrigins(env.CORS_ORIGIN);
  return configured.length ? configured : [...DEFAULT_CORS_ORIGINS];
}

// Off unless the API runs behind a proxy/load balancer you control. "true" means exactly one hop
// (never Express's trust-everything, which would let any client spoof X-Forwarded-For).
function trustProxyFromEnv(env = process.env) {
  const raw = String(env.TRUST_PROXY ?? '').trim();
  if (!raw || raw === 'false' || raw === '0') return false;
  if (raw === 'true') return 1;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw; // e.g. "loopback, 10.0.0.0/8"
}

const MB = 1024 * 1024;
function securityConfigFromEnv(env = process.env) {
  const maxAge = Number(env.HSTS_MAX_AGE_SECONDS);
  const documentMb = Number(env.DOCUMENT_MAX_MB);
  return {
    corsOrigin: corsOriginsFromEnv(env),
    trustProxy: trustProxyFromEnv(env),
    // Only turn on when every client reaches the API over HTTPS (browsers then refuse plain HTTP).
    hsts: { enabled: env.HSTS_ENABLED === 'true', maxAgeSeconds: Number.isInteger(maxAge) && maxAge > 0 ? maxAge : 31536000 },
    jsonBodyLimit: /^\d+(kb|mb)$/i.test(env.JSON_BODY_LIMIT || '') ? env.JSON_BODY_LIMIT : '100kb',
    documentMaxBytes: Number.isFinite(documentMb) && documentMb > 0 && documentMb <= 25 ? Math.round(documentMb * MB) : 10 * MB,
  };
}

// The API only serves JSON: nothing may be framed, sniffed, scripted or cached.
function securityHeaders({ hsts = { enabled: false } } = {}) {
  return (_req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-DNS-Prefetch-Control': 'off',
      'X-Permitted-Cross-Domain-Policies': 'none',
      'Origin-Agent-Cluster': '?1',
      'Cache-Control': 'no-store',
    });
    if (hsts.enabled) res.set('Strict-Transport-Security', `max-age=${hsts.maxAgeSeconds}; includeSubDomains`);
    next();
  };
}

// Requests from a browser origin not on the list are refused outright (403), not just left without
// CORS headers. Requests with no Origin (native HTTP clients, curl, Stripe webhooks) pass.
function corsGuard(corsOrigin) {
  const allowed = new Set(parseOrigins(corsOrigin));
  const corsMiddleware = cors({
    origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Stripe-Signature', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 600,
  });
  return (req, res, next) => {
    const origin = req.get('origin');
    if (origin && !allowed.has(origin)) {
      res.locals.corsRejected = true;
      return res.status(403).json({ error: 'This origin is not allowed to use the AID API.', code: 'origin_not_allowed', requestId: res.locals.requestId });
    }
    return corsMiddleware(req, res, next);
  };
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
function createLogger({ level = 'info', write = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const emit = (name) => (entry) => {
    if (LEVELS[name] < threshold) return;
    write(JSON.stringify({ time: new Date().toISOString(), level: name, ...redact(entry) }));
  };
  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') };
}
const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;
// IPv4 → /24, IPv6 → /48: enough to spot abuse from one network without logging the exact address.
function ipPrefix(ip = '') {
  const v4 = /(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}::/48`;
  return null;
}

// Assigns X-Request-Id (a sane incoming one is kept) and logs one line per request when it finishes.
// Logged: method, route pattern (no ids), path without query string, status, duration, request id,
// user id + role, IP prefix. Never logged: headers, query strings, request or response bodies.
function requestContext({ logger }) {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    const started = process.hrtime.bigint();
    res.locals.requestId = requestId;
    req.requestId = requestId;
    res.set('X-Request-Id', requestId);
    res.on('finish', () => {
      if (req.path === '/health' && res.statusCode < 400) return;
      const status = res.statusCode;
      const entry = {
        msg: 'request',
        requestId,
        method: req.method,
        route: req.route ? `${req.baseUrl || ''}${req.route.path}` : null,
        path: redactString(String(req.path || '').slice(0, 200)),
        status,
        durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
        userId: req.auth?.identity?.id || null,
        role: req.auth?.profile?.role || null,
        ipPrefix: ipPrefix(req.ip),
      };
      if (res.locals.rateLimited) entry.rateLimited = res.locals.rateLimited;
      if (res.locals.corsRejected) entry.corsRejected = true;
      (status >= 500 ? logger.error : status >= 400 ? logger.warn : logger.info)(entry);
    });
    next();
  };
}

function formatBytes(bytes) {
  return bytes >= MB ? `${Math.round((bytes / MB) * 10) / 10} MB` : `${Math.round(bytes / 1024)} KB`;
}

function notFound(_req, res) {
  res.status(404).json({ error: 'Not found', requestId: res.locals.requestId });
}

// Clients get a short, fixed message plus the request id; the full error (redacted) goes to the log.
function errorHandler({ logger, multer, documentMaxBytes }) {
  // eslint-disable-next-line no-unused-vars
  return (error, req, res, _next) => {
    const requestId = res.locals.requestId;
    if (res.headersSent) {
      logger.error({ msg: 'error after response started', requestId, error: serializeError(error) });
      return res.end();
    }
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large', requestId });
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body', requestId });
    if (multer && error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `The file is too large. The maximum is ${formatBytes(documentMaxBytes)}.`, code: 'file_too_large', requestId });
      }
      return res.status(400).json({ error: 'Document upload exceeds the allowed limits', requestId });
    }
    const status = Number(error?.status || error?.statusCode);
    if (status >= 400 && status < 500 && error?.expose) return res.status(status).json({ error: 'Invalid request', requestId });
    logger.error({ msg: 'unhandled error', requestId, method: req.method, route: req.route ? `${req.baseUrl || ''}${req.route.path}` : null, userId: req.auth?.identity?.id || null, error: serializeError(error) });
    return res.status(500).json({ error: 'Something went wrong on our side. Please try again.', requestId });
  };
}

module.exports = {
  DEFAULT_CORS_ORIGINS, corsOriginsFromEnv, trustProxyFromEnv, securityConfigFromEnv,
  securityHeaders, corsGuard, createLogger, silentLogger, requestContext, notFound, errorHandler, ipPrefix, formatBytes,
};
