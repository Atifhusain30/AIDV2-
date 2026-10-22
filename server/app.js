const express = require('express');
const multer = require('multer');
const {
  REQUIRED_DOCUMENT_TYPES, EXPIRING_DOCUMENT_TYPES, DRIVER_DECISIONS, DRIVER_STATUS_FILTERS,
  todayIso, parseIsoDate, cleanNotes, verificationReadiness, credentialsCurrent,
} = require('./verification');
const { quoteService, PricingError, TOWING } = require('./pricing');
const { checkRequest, checkTransition, DEFAULT_REQUEST_EXPIRY_MINUTES } = require('./lifecycle');
const {
  MESSAGE_MAX, REPORTS_PER_HOUR, STATUS_FILTERS, ALL_CATEGORIES, categoriesFor, cleanReport, checkAdminUpdate, supportContactFromEnv,
} = require('./support');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const {
  cleanDriverVehicle, driverVehicleComplete, VEHICLE_REQUIRED_MESSAGE, SERVICE_EQUIPMENT, EQUIPMENT_MISMATCH_CODE,
  equipmentCapability, canPerformService,
} = require('./driverVehicle');
const {
  radiusFromEnv, parsePosition, boundingBox, distanceTo, nearestWithin,
  LOCATION_MAX_AGE_MINUTES, LOCATION_REQUIRED_CODE, OUT_OF_RANGE_CODE,
} = require('./nearby');

const {
  RATING_WINDOW_DAYS, COMMENT_MAX, RATING_TAGS, RATING_CODES, cleanRating, checkCanRate, ratingDeadline,
} = require('./ratings');
const {
  MESSAGE_MAX: CHAT_MESSAGE_MAX, MESSAGES_PER_MINUTE, READ_ONLY_HOURS, CHAT_CODES,
  chatState, sendRefusal, cleanMessage, parseCursor, otherParty, readOnlyUntil, blockGuidance,
} = require('./chat');
const { createLimiters, rateLimitsFromEnv, sendRateLimited } = require('./rateLimit');
const {
  securityHeaders, corsGuard, requestContext, notFound, errorHandler, silentLogger, DEFAULT_CORS_ORIGINS,
} = require('./security');
const { createRealtimeHub, notifyEnded } = require('./realtime');
const { MFA_REQUIRED_CODE, MFA_REQUIRED_MESSAGE, adminNeedsMfa, mfaExempt } = require('./mfa');
const {
  CODES: PAYMENT_CODES, paymentsConfigFromEnv, createPayments, cancellationFeeFor, cleanRefundRequest, toCents,
} = require('./payments');

// E4 answer codes the apps act on.
const ACTIVE_REQUEST_CODE = 'active_request_exists';
const REQUEST_EXPIRED_CODE = 'request_expired';

const DOCUMENT_TYPES = new Set(REQUIRED_DOCUMENT_TYPES);
const publicDocument = ({ storagePath: _storagePath, ...document }) => document;
const DOCUMENT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'application/pdf']);
function validDocumentFile(file) {
  if (!file || !DOCUMENT_MIME_TYPES.has(file.mimetype)) return false;
  const bytes = file.buffer;
  if (file.mimetype === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (file.mimetype === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === 'image/heic') {
    const brand = bytes.length >= 12 ? bytes.subarray(4, 12).toString('ascii') : '';
    return brand.startsWith('ftyp') && /heic|heix|hevc|hevx|mif1|msf1/.test(brand);
  }
  return false;
}
// E2/E3: one file, at most documentMaxBytes (default 10 MB), only JPG/PNG/HEIC/PDF by declared type,
// then checked again by magic bytes in validDocumentFile before anything is stored.
const documentUploader = (maxBytes) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 1, fields: 4, fieldSize: 1024, parts: 6 },
  fileFilter: (_req, file, callback) => callback(null, DOCUMENT_MIME_TYPES.has(file.mimetype)),
});

const SERVICE_CATALOG = Object.freeze({
  // Market-based flat prices (approved 2026-10-21). Towing basePrice is the hook-up fee; see pricing.js.
  battery_jump: { id: 'battery_jump', name: "Won't start", description: 'Battery jump-start and diagnosis', basePrice: 69, estimatedTime: 30 },
  flat_tire: { id: 'flat_tire', name: 'Flat tire', description: 'Spare tire installed or tire inflated', basePrice: 79, estimatedTime: 35 },
  towing: { id: 'towing', name: 'Towing', description: 'Includes the first 5 miles', basePrice: TOWING.hookup, estimatedTime: 60, requiresDropoff: true, pricing: TOWING },
  lockout: { id: 'lockout', name: 'Locked out', description: 'Vehicle lockout assistance', basePrice: 79, estimatedTime: 30 },
  fuel_delivery: { id: 'fuel_delivery', name: 'Fuel delivery', description: 'Up to 2 gallons included', basePrice: 79, estimatedTime: 35 },
  ev_charging: { id: 'ev_charging', name: 'EV charging', description: 'Mobile emergency EV charge', basePrice: 129, estimatedTime: 45 },
  oil_change: { id: 'oil_change', name: 'Oil change', description: 'Mobile full-synthetic oil change', basePrice: 99, estimatedTime: 45 },
  // Scheduled appointment services — not offered at launch (on-demand roadside only).
  detailing: { id: 'detailing', name: 'Detailing', description: 'Mobile vehicle detailing', basePrice: 150, estimatedTime: 120, available: false },
  window_tinting: { id: 'window_tinting', name: 'Window tinting', description: 'Professional mobile tinting', basePrice: 250, estimatedTime: 180, available: false },
});
// equipmentTypes: which driver equipment can perform the service (see SERVICE_EQUIPMENT).
const publicService = (service) => ({ available: true, requiresDropoff: false, ...service, equipmentTypes: SERVICE_EQUIPMENT[service.id] || [] });
const cleanLocation = (location) => ({ address: location.address.trim().slice(0, 300), lat: location.lat, lng: location.lng });


function validCoordinates(location) {
  return Boolean(location) && Number.isFinite(location.lat) && location.lat >= -90 && location.lat <= 90 &&
    Number.isFinite(location.lng) && location.lng >= -180 && location.lng <= 180;
}

function validLocation(location) {
  return validCoordinates(location) && typeof location.address === 'string' && location.address.trim().length > 0;
}

function validVehicle(input) {
  return input && typeof input.make === 'string' && input.make.trim() && typeof input.model === 'string' && input.model.trim() &&
    Number.isInteger(input.year) && input.year >= 1900 && input.year <= 2100;
}

function createApp({ auth, repository, stripe, stripeWebhookSecret, documentStorage, accountAdmin, corsOrigin = DEFAULT_CORS_ORIGINS, requestRadiusMiles = radiusFromEnv(), ratingWindowDays = RATING_WINDOW_DAYS, supportContact = supportContactFromEnv(), chatMessagesPerMinute = MESSAGES_PER_MINUTE, clock = () => Date.now(),
  logger = silentLogger, rateLimits = rateLimitsFromEnv(), rateLimitStore, trustProxy = false, hsts = { enabled: false },
  jsonBodyLimit = '100kb', documentMaxBytes = 10 * 1024 * 1024, realtime, realtimeEnabled = true, paymentsConfig = paymentsConfigFromEnv() }) {
  const app = express();
  // C2/C3: card holds, capture, release, fees, refunds, disputes (payments.js). Without a Stripe client
  // payments are 'not_configured' and requests are refused unless DEV_ALLOW_UNPAID_REQUESTS=true.
  const payments = createPayments({ stripe, repository, config: paymentsConfig, logger });
  app.locals.payments = payments;
  const allowUnpaidRequests = !payments.configured && paymentsConfig.allowUnpaidRequests;
  // B11: realtime hub (realtime.js). One per app unless index.js passes a shared one (the expiry sweep uses it too).
  const hub = realtime || createRealtimeHub({ clock, radiusMiles: requestRadiusMiles, logger });
  app.locals.realtime = hub;
  // A realtime signal must never break or slow down the write that caused it.
  const notify = (fn) => {
    try { fn(); } catch (error) { logger.warn({ msg: 'realtime notify failed', error: error && error.message }); }
  };
  // E4 expiry (lazy, per caller) + B11: whoever is affected hears that their job ended.
  const expireStale = async (scope) => {
    const result = await repository.expireStaleBookings(scope);
    if (result && ((result.expired && result.expired.length) || (result.released && result.released.length))) {
      notifyEnded(hub, repository, result).catch((error) => logger.warn({ msg: 'realtime expiry notify failed', error: error && error.message }));
      // C2: expired requests and released jobs never cost the customer anything — release their holds.
      await payments.settleMany([...(result.expired || []), ...(result.released || [])]);
    }
    return result;
  };
  // C2: a request's card hold is confirmed — it now goes to nearby drivers, and the customer's app hears it.
  const announceAuthorized = async (bookingId) => {
    const [target] = typeof repository.getRealtimeTargets === 'function' ? await repository.getRealtimeTargets([bookingId]) : [];
    if (target) notify(() => { hub.bookingChanged(target, 'status'); hub.requestsChanged(target); });
  };
  const limit = createLimiters({ limits: rateLimits, store: rateLimitStore, clock });
  const documentUpload = documentUploader(documentMaxBytes);
  const requestExpiryMinutes = repository.requestExpiryMinutes || DEFAULT_REQUEST_EXPIRY_MINUTES;
  // E4: end stale work for this caller before answering (the interval sweep in index.js does the rest).
  const expireStaleFor = (auth) => {
    const role = auth.profile.role;
    if (role === 'customer') return expireStale({ customerId: auth.identity.id });
    if (role === 'driver') return expireStale({ driverId: auth.identity.id });
    return null;
  };
  const activeRequestConflict = (res, booking) => res.status(409).json({
    error: 'You already have an active request. Follow it, or cancel it before requesting again.',
    code: ACTIVE_REQUEST_CODE, booking,
  });
  const expiredRequest = (res) => res.status(409).json({
    error: `This request expired — no driver accepted it within ${requestExpiryMinutes} minutes, so it's no longer available.`,
    code: REQUEST_EXPIRED_CODE,
  });
  // E8: no framework banner; client IPs from X-Forwarded-For only when TRUST_PROXY says so.
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(requestContext({ logger }));
  app.use(securityHeaders({ hsts }));
  app.use(corsGuard(corsOrigin));
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
  // E3: per-IP ceiling on everything below (health checks above are never limited).
  app.use(limit.global);

  // C3: Stripe webhooks. The raw body is verified against STRIPE_WEBHOOK_SECRET before anything is read;
  // each event id is processed once (stripe_events); a processing failure forgets the id and answers 500
  // so Stripe retries. Events for PaymentIntents that aren't AID bookings are acknowledged and ignored.
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '512kb' }), async (req, res) => {
    if (!stripe || !stripeWebhookSecret) return res.status(503).json({ error: 'Stripe webhook is not configured', code: PAYMENT_CODES.notConfigured });
    let event;
    try {
      if (!Buffer.isBuffer(req.body)) throw new Error('Webhook body must be raw JSON');
      event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature') || '', stripeWebhookSecret);
    } catch (_error) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') return res.status(400).json({ error: 'Invalid webhook event' });
    if (!await repository.recordStripeEvent(event.id, event.type)) return res.json({ received: true, duplicate: true });
    try {
      const result = await payments.handleEvent(event);
      if (result && result.bookingId) {
        if (result.promoted) await announceAuthorized(result.bookingId);
        // Authorized after the request already ended (e.g. the customer cancelled meanwhile): release it.
        else if (event.type === 'payment_intent.amount_capturable_updated') await payments.settle(result.bookingId);
        if (!result.promoted && result.changed !== false) {
          const [target] = typeof repository.getRealtimeTargets === 'function' ? await repository.getRealtimeTargets([result.bookingId]) : [];
          if (target) notify(() => hub.bookingChanged(target, 'status'));
        }
      }
      res.json({ received: true });
    } catch (error) {
      logger.error({ msg: 'stripe webhook processing failed', type: event.type, error: error && error.message });
      await repository.forgetStripeEvent(event.id).catch(() => {});
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  app.use(express.json({ limit: jsonBodyLimit }));
  app.get('/api/services', (_req, res) => res.json(Object.values(SERVICE_CATALOG).map(publicService)));

  async function authenticate(req, res, next) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
      const identity = await auth.getUser(token);
      if (!identity) return res.status(401).json({ error: 'Invalid or expired session' });
      const profile = await repository.getProfile(identity.id);
      if (!profile || profile.status !== 'active') return res.status(403).json({ error: 'Account is not active' });
      // E5: an admin session without the authenticator-app step (aal1) can only read its own profile.
      if (adminNeedsMfa(profile, identity) && !mfaExempt(req.method, `${req.baseUrl || ''}${req.path}`)) {
        return res.status(403).json({ error: MFA_REQUIRED_MESSAGE, code: MFA_REQUIRED_CODE });
      }
      req.auth = { identity, profile, token };
      next();
    } catch (_error) {
      res.status(401).json({ error: 'Invalid or expired session' });
    }
  }

  const requireRole = (role) => (req, res, next) => {
    if (req.auth.profile.role !== role) return res.status(403).json({ error: `${role} account required` });
    next();
  };
  function requireVerifiedDriver(req, res, next) {
    if (req.auth.profile.role !== 'driver' || req.auth.profile.verificationStatus !== 'verified') {
      return res.status(403).json({ error: 'Verified driver account required' });
    }
    if (!credentialsCurrent(req.auth.profile)) {
      return res.status(403).json({ error: 'Your license, insurance, or registration has expired. Upload a current document to keep driving.' });
    }
    next();
  }
  // Customers need the vehicle, plate and equipment to find the driver; required to go online or take work.
  function requireDriverVehicle(req, res, next) {
    if (!driverVehicleComplete(req.auth.profile.driverVehicle)) return res.status(403).json({ error: VEHICLE_REQUIRED_MESSAGE, code: 'vehicle_required' });
    next();
  }
  function requireOnlineDriver(req, res, next) {
    if (!req.auth.profile.isOnline) return res.status(403).json({ error: 'Driver must be online to receive requests' });
    next();
  }

  app.get('/api/me', authenticate, (req, res) => res.json({ ...req.auth.profile, email: req.auth.identity.email || '' }));
  app.patch('/api/me', authenticate, limit.accountChange, async (req, res, next) => {
    try {
      const current = req.auth.profile;
      const patch = {
        firstName: typeof req.body.firstName === 'string' ? req.body.firstName.trim().slice(0, 100) : current.firstName,
        lastName: typeof req.body.lastName === 'string' ? req.body.lastName.trim().slice(0, 100) : current.lastName,
        phone: typeof req.body.phone === 'string' ? req.body.phone.trim().slice(0, 40) : current.phone,
      };
      res.json(await repository.updateProfile(req.auth.identity.id, patch));
    } catch (error) { next(error); }
  });
  app.delete('/api/me', authenticate, limit.accountChange, async (req, res, next) => {
    try {
      if (!accountAdmin) return res.status(503).json({ error: 'Account deletion is not configured' });
      await accountAdmin.deleteUser(req.auth.identity.id);
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get('/api/vehicles', authenticate, requireRole('customer'), async (req, res, next) => {
    try { res.json(await repository.listVehicles(req.auth.identity.id)); } catch (error) { next(error); }
  });
  app.post('/api/vehicles', authenticate, requireRole('customer'), limit.accountChange, async (req, res, next) => {
    try {
      if (!validVehicle(req.body)) return res.status(400).json({ error: 'Valid make, model, and year are required' });
      const vehicle = await repository.createVehicle(req.auth.identity.id, {
        make: req.body.make.trim().slice(0, 80), model: req.body.model.trim().slice(0, 80), year: req.body.year,
        color: typeof req.body.color === 'string' ? req.body.color.trim().slice(0, 40) : '',
        licensePlate: typeof (req.body.licensePlate || req.body.plate) === 'string' ? (req.body.licensePlate || req.body.plate).trim().slice(0, 20) : '',
        isElectric: Boolean(req.body.isElectric),
      });
      res.status(201).json(vehicle);
    } catch (error) { next(error); }
  });
  app.patch('/api/vehicles/:vehicleId', authenticate, requireRole('customer'), limit.accountChange, async (req, res, next) => {
    try {
      if (!validVehicle(req.body)) return res.status(400).json({ error: 'Valid make, model, and year are required' });
      const vehicle = await repository.updateVehicle(req.auth.identity.id, req.params.vehicleId, {
        make: req.body.make.trim().slice(0, 80), model: req.body.model.trim().slice(0, 80), year: req.body.year,
        color: String(req.body.color || '').trim().slice(0, 40), licensePlate: String(req.body.licensePlate || req.body.plate || '').trim().slice(0, 20),
        isElectric: Boolean(req.body.isElectric),
      });
      if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
      res.json(vehicle);
    } catch (error) { next(error); }
  });
  app.delete('/api/vehicles/:vehicleId', authenticate, requireRole('customer'), limit.accountChange, async (req, res, next) => {
    try {
      if (!await repository.deleteVehicle(req.auth.identity.id, req.params.vehicleId)) return res.status(404).json({ error: 'Vehicle not found' });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  // Shared by quotes and bookings so the quoted price is exactly the booked price.
  function priceRequest(body) {
    const service = SERVICE_CATALOG[body.serviceType];
    if (!service) return { status: 400, error: 'Unsupported service type' };
    if (service.available === false) return { status: 409, error: `${service.name} is not available yet` };
    if (!validLocation(body.location)) return { status: 400, error: 'A valid service location is required' };
    if (body.dropoffLocation && !validLocation(body.dropoffLocation)) return { status: 400, error: 'Drop-off location is invalid' };
    const dropoff = service.requiresDropoff && body.dropoffLocation ? body.dropoffLocation : null;
    try {
      return { service, dropoff, quote: quoteService(service, body.location, dropoff) };
    } catch (error) {
      if (error instanceof PricingError) return { status: 400, error: error.message };
      throw error;
    }
  }

  app.post('/api/quotes', authenticate, requireRole('customer'), limit.quote, (req, res, next) => {
    try {
      const priced = priceRequest(req.body);
      if (priced.error) return res.status(priced.status).json({ error: priced.error });
      res.json({ serviceType: priced.service.id, ...priced.quote });
    } catch (error) { next(error); }
  });

  // C2: what the apps need to know about payments (no secrets): configured or not, the hold model and
  // the cancellation fee policy shown before a request.
  app.get('/api/payments/config', (_req, res) => res.json(payments.publicConfig()));

  app.post('/api/bookings', authenticate, requireRole('customer'), limit.bookingCreate, async (req, res, next) => {
    try {
      // C2: no card payments configured → no requests (an honest refusal), unless a developer
      // explicitly allowed unpaid dev requests (DEV_ALLOW_UNPAID_REQUESTS=true, never in production).
      if (!payments.configured && !allowUnpaidRequests) {
        return res.status(503).json({ error: "Card payments aren't set up yet, so requests can't be sent. Please try again later.", code: PAYMENT_CODES.notConfigured });
      }
      const priced = priceRequest(req.body);
      if (priced.error) return res.status(priced.status).json({ error: priced.error });
      const { service, dropoff, quote } = priced;
      if (req.body.vehicleId && !await repository.getVehicle(req.auth.identity.id, req.body.vehicleId)) {
        return res.status(400).json({ error: 'Vehicle is not available for this customer' });
      }
      // E4: one active request per customer. Stale ones are ended first so they never block a new
      // request; the unique index catches two requests racing past this check.
      await expireStaleFor(req.auth);
      if (payments.configured) {
        // C2: an earlier request whose card was never confirmed is replaced (its hold released), not a blocker.
        const abandoned = await repository.cancelUnpaidPending({ customerId: req.auth.identity.id });
        if (abandoned.length) await payments.settleMany(abandoned);
      }
      const existing = await repository.getActiveBooking(req.auth.identity.id, 'customer');
      if (existing) return activeRequestConflict(res, existing);
      let booking;
      try {
        booking = await repository.createBooking({
          customerId: req.auth.identity.id, vehicleId: req.body.vehicleId || null, service,
          location: cleanLocation(req.body.location),
          dropoffLocation: dropoff ? cleanLocation(dropoff) : null, estimatedPrice: quote.price,
          notes: typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : null,
          status: payments.configured ? 'pending' : 'searching',
          paymentStatus: payments.configured ? 'pending' : 'not_required',
        });
      } catch (error) {
        if (error?.code !== ACTIVE_REQUEST_CODE) throw error;
        return activeRequestConflict(res, await repository.getActiveBooking(req.auth.identity.id, 'customer'));
      }
      if (!payments.configured) {
        notify(() => { hub.requestsChanged(booking); hub.bookingChanged(booking, 'created'); });
        return res.status(201).json(booking);
      }
      // C2: the hold for the server's quote, on the customer's own Stripe Customer. Drivers see the
      // request only once the card is confirmed (POST …/payment/confirm or the webhook).
      let setup;
      try {
        setup = await payments.authorizeBooking(booking, req.auth.profile, req.auth.identity.email);
      } catch (error) {
        logger.error({ msg: 'card hold could not be created', bookingId: booking.id, error: error && error.message });
        await repository.cancelUnpaidPending({ bookingId: booking.id });
        return res.status(502).json({ error: "We couldn't start the card check. Nothing was charged — try again.", code: 'payment_setup_failed' });
      }
      notify(() => hub.bookingChanged(booking, 'created'));
      const fresh = await repository.getBooking(booking.id, req.auth.identity.id, 'customer');
      res.status(201).json({
        ...(fresh || booking),
        paymentSetup: { clientSecret: setup.clientSecret, amountCents: setup.amountCents, currency: 'usd', status: setup.status },
      });
    } catch (error) { next(error); }
  });
  // C2: the app confirmed the card (with 3-D Secure when the bank asked). The server asks Stripe itself;
  // only a hold for this booking's own server amount releases the request to drivers.
  app.post('/api/bookings/:bookingId/payment/confirm', authenticate, requireRole('customer'), limit.statusChange, async (req, res, next) => {
    try {
      if (!payments.configured) return res.status(503).json({ error: "Card payments aren't set up yet.", code: PAYMENT_CODES.notConfigured });
      const booking = await repository.getBooking(req.params.bookingId, req.auth.identity.id, 'customer');
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      const result = await payments.confirmAuthorization(booking);
      if (result.status === 200) {
        if (result.body.promoted) await announceAuthorized(booking.id);
        else await payments.settle(booking.id); // hold landed after the request ended: release it (no-op otherwise)
      }
      const latest = await repository.getBooking(booking.id, req.auth.identity.id, 'customer');
      res.status(result.status).json({ ...result.body, booking: latest });
    } catch (error) { next(error); }
  });
  app.get('/api/bookings', authenticate, async (req, res, next) => {
    try {
      await expireStaleFor(req.auth);
      res.json(await repository.listBookings(req.auth.identity.id, req.auth.profile.role));
    } catch (error) { next(error); }
  });
  app.get('/api/bookings/active', authenticate, async (req, res, next) => {
    try {
      await expireStaleFor(req.auth);
      const booking = await repository.getActiveBooking(req.auth.identity.id, req.auth.profile.role);
      res.json(booking ? await withChat(booking, req.auth) : booking);
    } catch (error) { next(error); }
  });
  app.get('/api/bookings/:bookingId', authenticate, async (req, res, next) => {
    try {
      await expireStaleFor(req.auth);
      const booking = await repository.getBooking(req.params.bookingId, req.auth.identity.id, req.auth.profile.role);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      res.json(await withChat(booking, req.auth));
    } catch (error) { next(error); }
  });

  // ---- B12: chat between a job's customer and driver, and blocking (rules in chat.js) ----
  const isParty = (role) => role === 'customer' || role === 'driver';
  /** Chat state for this participant, from their own booking view and the block/unread summary. */
  async function chatFor(booking, auth) {
    const role = auth.profile.role;
    const otherId = otherParty(booking, role);
    if (!isParty(role) || !otherId) return { state: 'unavailable', unread: 0, blockedByMe: false, readOnlyUntil: null };
    const summary = await repository.getChatSummary(booking.id, auth.identity.id, otherId);
    const state = chatState(booking, summary.block, clock());
    return {
      state,
      unread: state === 'closed' ? 0 : summary.unread,
      blockedByMe: summary.block.byMe,
      readOnlyUntil: readOnlyUntil(booking, READ_ONLY_HOURS),
    };
  }
  // The booking a participant polls carries the chat state and unread count, so the badge needs no extra request.
  const withChat = async (booking, auth) => (isParty(auth.profile.role) ? { ...booking, chat: await chatFor(booking, auth) } : booking);
  // Load the caller's own job for a chat route; anyone else (or a bad id) gets 404 and learns nothing.
  async function participantBooking(req, res) {
    if (!isParty(req.auth.profile.role)) { res.status(403).json({ error: 'Only the customer or the driver of a job can use its chat' }); return null; }
    const booking = UUID.test(req.params.bookingId) ? await repository.getBooking(req.params.bookingId, req.auth.identity.id, req.auth.profile.role) : null;
    if (!booking) { res.status(404).json({ error: 'Booking not found' }); return null; }
    return booking;
  }
  const chatClosed = (res, state) => res.status(state === 'closed' ? 410 : 409).json({ ...sendRefusal(state), state });

  // Messages after ?after=<seq> (or the newest page). Polled every few seconds while the chat is open.
  app.get('/api/bookings/:bookingId/messages', authenticate, async (req, res, next) => {
    try {
      const cursor = parseCursor(req.query.after);
      if (!cursor.ok) return res.status(400).json({ error: 'Invalid cursor' });
      const booking = await participantBooking(req, res);
      if (!booking) return;
      const chat = await chatFor(booking, req.auth);
      if (chat.state === 'closed' || chat.state === 'unavailable') return chatClosed(res, chat.state);
      const messages = await repository.listJobMessages(booking.id, req.auth.identity.id, cursor.after);
      res.json({
        ...chat, bookingStatus: booking.status, messages,
        cursor: messages.length ? messages[messages.length - 1].seq : cursor.after,
        maxLength: CHAT_MESSAGE_MAX,
      });
    } catch (error) { next(error); }
  });
  app.post('/api/bookings/:bookingId/messages', authenticate, limit.chatSend, async (req, res, next) => {
    try {
      const cleaned = cleanMessage(req.body);
      if (!isParty(req.auth.profile.role)) return res.status(403).json({ error: 'Only the customer or the driver of a job can use its chat' });
      if (!cleaned.ok) return res.status(400).json({ error: cleaned.error, field: cleaned.field });
      const booking = await participantBooking(req, res);
      if (!booking) return;
      const chat = await chatFor(booking, req.auth);
      if (chat.state !== 'open') return chatClosed(res, chat.state);
      if (await repository.countRecentJobMessages(req.auth.identity.id, 60) >= chatMessagesPerMinute) {
        // Durable per-person rule (counted in the database); 60 s is the longest wait.
        return sendRateLimited(res, 60, { error: "You're sending messages too quickly. Wait a moment and try again.", code: CHAT_CODES.rateLimited });
      }
      const saved = await repository.createJobMessage({
        bookingId: booking.id, senderId: req.auth.identity.id, senderRole: req.auth.profile.role, body: cleaned.body, clientId: cleaned.clientId,
      });
      if (!saved) {
        // The job ended or someone blocked between the check and the insert: answer with the state now.
        const latest = await repository.getBooking(booking.id, req.auth.identity.id, req.auth.profile.role);
        const now = latest ? await chatFor(latest, req.auth) : { state: 'unavailable' };
        return chatClosed(res, now.state === 'open' ? 'unavailable' : now.state);
      }
      if (!saved.duplicate) notify(() => hub.chatChanged(booking));
      res.status(saved.duplicate ? 200 : 201).json(saved.message);
    } catch (error) { next(error); }
  });
  // Mark the other person's messages as read (up to ?upTo / body.upTo, or all).
  app.post('/api/bookings/:bookingId/messages/read', authenticate, async (req, res, next) => {
    try {
      const cursor = parseCursor(req.body?.upTo);
      if (!cursor.ok) return res.status(400).json({ error: 'Invalid cursor' });
      const booking = await participantBooking(req, res);
      if (!booking) return;
      const chat = await chatFor(booking, req.auth);
      if (chat.state === 'closed' || chat.state === 'unavailable') return chatClosed(res, chat.state);
      const marked = await repository.markJobMessagesRead(booking.id, req.auth.identity.id, cursor.after);
      if (marked) notify(() => hub.chatChanged(booking));
      res.json({ marked });
    } catch (error) { next(error); }
  });
  // Block the other person on one of your jobs: closes the chat and keeps you apart in dispatch from
  // now on. Does not cancel the job — the answer says what to do instead while it's still going.
  app.post('/api/bookings/:bookingId/block', authenticate, limit.block, async (req, res, next) => {
    try {
      const booking = await participantBooking(req, res);
      if (!booking) return;
      const role = req.auth.profile.role;
      const otherId = otherParty(booking, role);
      if (!otherId) return res.status(409).json({ error: 'There is no one to block on this job yet.', code: CHAT_CODES.noOneToBlock });
      const result = await repository.blockUser({ blockerId: req.auth.identity.id, blockerRole: role, blockedId: otherId, bookingId: booking.id, bookingStatus: booking.status });
      if (result.created) {
        // Both chats close; the driver's request list drops this customer's requests from now on.
        const driverId = role === 'driver' ? req.auth.identity.id : otherId;
        notify(() => { hub.bookingChanged(booking, 'block'); hub.chatChanged(booking); hub.requestsChanged(null, { alsoTo: [driverId] }); });
      }
      res.status(result.created ? 201 : 200).json({
        blocked: true, alreadyBlocked: !result.created, guidance: blockGuidance(role, booking.status), chat: await chatFor(booking, req.auth),
      });
    } catch (error) { next(error); }
  });
  app.patch('/api/bookings/:bookingId/status', authenticate, limit.statusChange, async (req, res, next) => {
    try {
      if (req.auth.profile.role === 'driver' && req.auth.profile.verificationStatus !== 'verified') {
        return res.status(403).json({ error: 'Verified driver account required' });
      }
      const role = req.auth.profile.role;
      const nextStatus = req.body.status;
      const reason = typeof req.body.reason === 'string' ? req.body.reason : null;
      // Reject moves this party can never make before loading anything.
      const request = checkRequest({ role, next: nextStatus, reason });
      if (!request.ok) return res.status(request.status).json({ error: request.error });
      await expireStaleFor(req.auth); // an overdue request answers "expired", not a stale status
      const current = await repository.getBooking(req.params.bookingId, req.auth.identity.id, role);
      const verdict = checkTransition({ role, booking: current, next: nextStatus, reason });
      if (!verdict.ok) {
        return res.status(verdict.status).json(verdict.status === 409
          ? { error: verdict.error, currentStatus: verdict.currentStatus, booking: current }
          : { error: verdict.error });
      }
      // C3: a customer who cancels once the driver is on the way pays the cancellation fee (never more
      // than the hold); every other cancel is free. Decided on the exact status the compare-and-set checks.
      const cancellationFeeCents = nextStatus === 'cancelled' && payments.configured ? cancellationFeeFor({
        role, fromStatus: verdict.from, authorizedCents: toCents(current.payment?.amountAuthorized || 0),
        feeCents: paymentsConfig.cancellationFeeCents, feeFromStatuses: paymentsConfig.feeFromStatuses,
      }) : 0;
      // Compare-and-set on the exact status we validated, so a concurrent change is a 409, never a skipped step.
      let booking = await repository.updateBookingStatus(req.params.bookingId, req.auth.identity.id, role, nextStatus, [verdict.from], { reason: verdict.reason, cancellationFeeCents });
      if (!booking) {
        const latest = await repository.getBooking(req.params.bookingId, req.auth.identity.id, role);
        return res.status(409).json({ error: 'This job was just updated. Showing the latest status.', currentStatus: latest?.status, booking: latest });
      }
      // C2: the job ended — capture the quote (completed), the fee, or release the hold. A Stripe failure
      // never undoes the status change; the settlement sweep retries it.
      if ((nextStatus === 'completed' || nextStatus === 'cancelled') && payments.configured) {
        await payments.settle(booking.id);
        booking = (await repository.getBooking(booking.id, req.auth.identity.id, role)) || booking;
      }
      notify(() => {
        hub.bookingChanged(booking, nextStatus === 'cancelled' ? 'cancelled' : 'status');
        // A cancelled open request disappears from nearby drivers' lists.
        if (verdict.from === 'searching' || verdict.from === 'pending') hub.requestsChanged(current);
        // B15: both people now have a job to rate.
        if (nextStatus === 'completed') hub.ratingsChanged([booking.customerId, booking.driverId]);
      });
      res.json(booking);
    } catch (error) { next(error); }
  });

  // ---- B11: realtime channel (rules in realtime.js) ----
  // Step 1: a signed-in customer or driver swaps their session for a 30-second, single-use stream ticket.
  app.post('/api/realtime/ticket', authenticate, limit.realtimeTicket, (req, res) => {
    if (!realtimeEnabled) return res.status(503).json({ error: 'Live updates are off; the app keeps checking on its own.', code: 'realtime_disabled' });
    const { profile, identity } = req.auth;
    if (!isParty(profile.role)) return res.status(403).json({ error: 'Live updates are for customers and drivers' });
    if (!hub.canConnect(identity.id)) {
      return sendRateLimited(res, 30, { error: 'Too many live connections for this account. Close another AID window and try again.', code: 'too_many_streams' });
    }
    const driver = profile.role === 'driver' ? {
      // Only a driver who may work hears about new requests (the request list repeats these checks).
      isOnline: Boolean(profile.isOnline) && profile.verificationStatus === 'verified' && credentialsCurrent(profile),
      equipmentType: profile.driverVehicle?.equipmentType || null,
    } : null;
    res.json({ ...hub.issueTicket({ userId: identity.id, role: profile.role, driver }), streamPath: '/api/realtime/stream' });
  });
  // Step 2: open the event stream with the ticket (EventSource can't send an Authorization header).
  const redeemStreamTicket = (req, res, next) => {
    const session = hub.redeemTicket(typeof req.query.ticket === 'string' ? req.query.ticket : '');
    if (!session) return res.status(401).json({ error: 'This live-update ticket is invalid or expired. Ask for a new one.', code: 'invalid_ticket' });
    req.auth = { identity: { id: session.userId }, profile: { role: session.role } };
    req.realtimeSession = session;
    next();
  };
  app.get('/api/realtime/stream', redeemStreamTicket, limit.realtimeStream, async (req, res, next) => {
    try {
      const session = req.realtimeSession;
      const tooMany = () => sendRateLimited(res, 30, { error: 'Too many live connections for this account.', code: 'too_many_streams' });
      if (!hub.canConnect(session.userId)) return tooMany();
      const position = session.role === 'driver'
        ? await repository.getDriverPosition(session.userId, LOCATION_MAX_AGE_MINUTES).catch(() => null)
        : null;
      if (!hub.attach(session, req, res, { position })) return tooMany();
    } catch (error) { next(error); }
  });

  // ---- B18: help & support reports (rules in support.js) ----
  // Public: the support contact from server config (null when not set — the apps then hide it) and the
  // report categories for each role.
  app.get('/api/support/config', (_req, res) => res.json({
    contact: supportContact,
    categories: { customer: categoriesFor('customer'), driver: categoriesFor('driver') },
    messageMaxLength: MESSAGE_MAX,
    reportsPerHour: REPORTS_PER_HOUR,
  }));
  // A customer or driver reports a problem — general, or about one of their own jobs (any status:
  // during the job from "Report an issue", or afterwards from Help & Support).
  app.post('/api/support/reports', authenticate, limit.reports, async (req, res, next) => {
    try {
      const role = req.auth.profile.role;
      const userId = req.auth.identity.id;
      const cleaned = cleanReport(req.body, role);
      if (!cleaned.ok) return res.status(cleaned.status).json({ error: cleaned.error, ...(cleaned.field ? { field: cleaned.field } : {}) });
      const { category, message, bookingId } = cleaned.report;
      let bookingStatus = null;
      if (bookingId) {
        // Participant check: only the job's own customer or driver can attach it (others get 404, learning nothing).
        const booking = UUID.test(bookingId) ? await repository.getBooking(bookingId, userId, role) : null;
        if (!booking) return res.status(404).json({ error: 'That job could not be found on your account', field: 'bookingId' });
        bookingStatus = booking.status;
      }
      if (await repository.countRecentSupportReports(userId, 60) >= REPORTS_PER_HOUR) {
        // Durable per-person rule (counted in the database); an hour is the longest wait.
        return sendRateLimited(res, 3600, { error: `You've sent ${REPORTS_PER_HOUR} reports in the last hour. Please wait a little before sending another. If anyone is in danger, call 911.`, code: 'report_rate_limited' });
      }
      const report = await repository.createSupportReport({ reporterId: userId, role, bookingId, bookingStatus, category, message });
      res.status(201).json(report);
    } catch (error) { next(error); }
  });
  app.get('/api/support/reports', authenticate, async (req, res, next) => {
    try {
      if (req.auth.profile.role !== 'customer' && req.auth.profile.role !== 'driver') return res.json([]);
      res.json(await repository.listMySupportReports(req.auth.identity.id));
    } catch (error) { next(error); }
  });

  // ---- B15: ratings both directions (rules in ratings.js) ----
  // The customer rates the driver and the driver rates the customer, once each, after completion.
  app.post('/api/bookings/:bookingId/rating', authenticate, limit.ratings, async (req, res, next) => {
    try {
      const role = req.auth.profile.role;
      const userId = req.auth.identity.id;
      if (role !== 'customer' && role !== 'driver') return res.status(403).json({ error: 'Only the customer or the driver of a job can rate it' });
      const cleaned = cleanRating(req.body, role);
      if (!cleaned.ok) return res.status(400).json({ error: cleaned.error, field: cleaned.field });
      const booking = await repository.getBooking(req.params.bookingId, userId, role);
      const verdict = checkCanRate({ role, userId, booking, windowDays: ratingWindowDays });
      if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.error, ...(verdict.code ? { code: verdict.code } : {}) });
      const alreadyRated = () => res.status(409).json({ error: "You've already rated this job", code: RATING_CODES.alreadyRated });
      if (await repository.hasRated(booking.id, userId)) return alreadyRated();
      let saved;
      try {
        saved = await repository.createRating({ bookingId: booking.id, raterId: userId, raterRole: role, rateeId: verdict.rateeId, ...cleaned.rating }, ratingWindowDays);
      } catch (error) {
        if (error?.code === RATING_CODES.alreadyRated) return alreadyRated(); // two submits raced; the unique constraint decided
        throw error;
      }
      // The booking changed between the checks and the insert (e.g. the window just closed).
      if (!saved) return res.status(409).json({ error: 'This job can no longer be rated', code: RATING_CODES.windowClosed });
      notify(() => hub.ratingsChanged([userId]));
      res.status(201).json(saved);
    } catch (error) { next(error); }
  });
  // Completed jobs the signed-in person can still rate, with the tag choices for their direction.
  app.get('/api/ratings/pending', authenticate, async (req, res, next) => {
    try {
      const role = req.auth.profile.role;
      if (role !== 'customer' && role !== 'driver') return res.json([]);
      const pending = await repository.listPendingRatings(req.auth.identity.id, role, ratingWindowDays);
      res.json(pending.map((item) => ({
        ...item,
        rateeRole: role === 'customer' ? 'driver' : 'customer',
        rateBy: ratingDeadline(item.completedAt, ratingWindowDays),
        tags: RATING_TAGS[role],
        commentMaxLength: COMMENT_MAX,
      })));
    } catch (error) { next(error); }
  });

  // B8: only requests this driver's equipment can perform (e.g. no tows for a light-duty vehicle),
  // within `requestRadiusMiles` of where the driver is now, nearest first, at most MAX_REQUESTS.
  // The app sends its current position as ?lat=&lng= (stored as the driver's last position);
  // otherwise the last position from the past LOCATION_MAX_AGE_MINUTES is used. With no position,
  // the answer says so (status 'location_required') rather than listing requests from anywhere.
  app.get('/api/drivers/requests', authenticate, limit.location, requireVerifiedDriver, requireDriverVehicle, requireOnlineDriver, async (req, res, next) => {
    try {
      const driverId = req.auth.identity.id;
      const sent = req.query.lat !== undefined || req.query.lng !== undefined;
      if (sent) {
        const position = parsePosition(req.query.lat, req.query.lng);
        if (!position) return res.status(400).json({ error: 'Your location looks wrong. Check location access and try again.', code: 'invalid_location' });
        await repository.updateDriverPosition(driverId, position);
      }
      const from = await repository.getDriverPosition(driverId, LOCATION_MAX_AGE_MINUTES);
      // B11: the realtime hub matches new requests against this position (kept in memory only).
      hub.updateDriver(driverId, { position: from || null, isOnline: true });
      if (!from) return res.json({ status: LOCATION_REQUIRED_CODE, radiusMiles: requestRadiusMiles, requests: [] });
      const capability = equipmentCapability(req.auth.profile.driverVehicle.equipmentType);
      // B12: requests from a customer either side has blocked are never listed to this driver.
      const candidates = await repository.listAvailableBookings(capability, boundingBox(from, requestRadiusMiles), driverId);
      res.json({ status: 'ok', radiusMiles: requestRadiusMiles, requests: nearestWithin(candidates, from, requestRadiusMiles) });
    } catch (error) { next(error); }
  });
  // Going offline is always allowed (e.g. after credentials lapse or with no vehicle on file);
  // going online requires verification, current credentials and complete vehicle details.
  const requireEligibleToGoOnline = (req, res, next) => (req.body.isOnline === false ? next()
    : requireVerifiedDriver(req, res, () => requireDriverVehicle(req, res, next)));
  app.patch('/api/drivers/me/online', authenticate, requireRole('driver'), requireEligibleToGoOnline, async (req, res, next) => {
    try {
      if (typeof req.body.isOnline !== 'boolean') return res.status(400).json({ error: 'isOnline must be a boolean' });
      await repository.updateDriverOnlineStatus(req.auth.identity.id, req.body.isOnline);
      hub.updateDriver(req.auth.identity.id, { isOnline: req.body.isOnline });
      res.json({ isOnline: req.body.isOnline });
    } catch (error) { next(error); }
  });
  app.post('/api/bookings/:bookingId/accept', authenticate, limit.accept, requireVerifiedDriver, requireDriverVehicle, requireOnlineDriver, async (req, res, next) => {
    try {
      // A job this driver went silent on, or a request past its window, ends first (E4).
      await expireStale({ driverId: req.auth.identity.id });
      await expireStale({ bookingId: req.params.bookingId });
      // One job at a time (also enforced atomically in acceptBooking); this gives the clearer message.
      const current = await repository.getActiveBooking(req.auth.identity.id, 'driver');
      if (current) return res.status(409).json({ error: 'Finish or cancel your current job before accepting another', code: 'driver_busy' });
      const equipmentType = req.auth.profile.driverVehicle.equipmentType;
      const open = await repository.getAvailableBooking(req.params.bookingId);
      if (!open) {
        if (await repository.getBookingStatus(req.params.bookingId) === 'expired') return expiredRequest(res);
        return res.status(409).json({ error: 'Booking is no longer available' });
      }
      // B12: a driver and a customer who blocked each other (either way) are never paired. Same answer
      // as a taken request, so neither learns about the other's block; acceptBooking re-checks it atomically.
      const block = await repository.getBlockBetween(req.auth.identity.id, open.customerId);
      if (block.byMe || block.byThem) return res.status(409).json({ error: 'Booking is no longer available' });
      const fit = canPerformService(equipmentType, open);
      if (!fit.ok) return res.status(403).json({ error: fit.error, code: EQUIPMENT_MISMATCH_CODE });
      // Same radius as the request list, checked against the driver's last fresh position. Advisory
      // (a position can't race the way a booking can); double booking is prevented in acceptBooking.
      const from = await repository.getDriverPosition(req.auth.identity.id, LOCATION_MAX_AGE_MINUTES);
      if (!from) return res.status(409).json({ error: 'Turn on location so AID can confirm you are near this job, then try again.', code: LOCATION_REQUIRED_CODE });
      if (distanceTo(from, open.pickup) > requestRadiusMiles) {
        return res.status(403).json({ error: `This job is more than ${requestRadiusMiles} miles from you.`, code: OUT_OF_RANGE_CODE });
      }
      const booking = await repository.acceptBooking(req.params.bookingId, req.auth.identity.id, equipmentCapability(equipmentType));
      if (!booking) {
        // Something changed between the checks above and the atomic accept: the request ran out of
        // time or was taken, or this driver's other accept landed first (one job at a time).
        await expireStale({ bookingId: req.params.bookingId });
        if (await repository.getBookingStatus(req.params.bookingId) === 'expired') return expiredRequest(res);
        if (await repository.getActiveBooking(req.auth.identity.id, 'driver')) {
          return res.status(409).json({ error: 'Finish or cancel your current job before accepting another', code: 'driver_busy' });
        }
        return res.status(409).json({ error: 'Booking is no longer available' });
      }
      notify(() => { hub.bookingChanged(booking, 'accepted'); hub.requestsChanged({ ...open, driverId: booking.driverId }); });
      res.json(booking);
    } catch (error) { next(error); }
  });
  app.patch('/api/bookings/:bookingId/driver-location', authenticate, limit.location, requireVerifiedDriver, async (req, res, next) => {
    try {
      const location = req.body.location;
      if (!validCoordinates(location)) return res.status(400).json({ error: 'Valid coordinates are required' });
      const booking = await repository.updateDriverLocation(req.params.bookingId, req.auth.identity.id, { lat: location.lat, lng: location.lng });
      if (!booking) return res.status(404).json({ error: 'Active booking not found' });
      notify(() => hub.bookingChanged(booking, 'location', { except: req.auth.identity.id }));
      res.json(booking);
    } catch (error) { next(error); }
  });

  // The vehicle customers should look for when the driver arrives, plus the equipment it carries.
  app.patch('/api/drivers/me/vehicle', authenticate, requireRole('driver'), limit.accountChange, async (req, res, next) => {
    try {
      const result = cleanDriverVehicle(req.body);
      if (!result.ok) return res.status(400).json({ error: result.error, field: result.field });
      const saved = await repository.updateDriverVehicle(req.auth.identity.id, result.vehicle);
      hub.updateDriver(req.auth.identity.id, { equipmentType: result.vehicle.equipmentType });
      res.json(saved);
    } catch (error) { next(error); }
  });

  app.get('/api/drivers/me/documents', authenticate, requireRole('driver'), async (req, res, next) => {
    try {
      if (!documentStorage) return res.status(503).json({ error: 'Document storage is not configured' });
      const documents = await repository.listDriverDocuments(req.auth.identity.id);
      const withUrls = await Promise.all(documents.map(async (document) => ({
        ...document,
        fileUrl: await documentStorage.signedUrl(document.storagePath),
      })));
      res.json(withUrls);
    } catch (error) { next(error); }
  });
  app.post('/api/drivers/me/documents', authenticate, requireRole('driver'), limit.documentUpload, documentUpload.single('file'), async (req, res, next) => {
    try {
      if (!documentStorage) return res.status(503).json({ error: 'Document storage is not configured' });
      if (!DOCUMENT_TYPES.has(req.body.type)) return res.status(400).json({ error: 'Unsupported document type' });
      if (!validDocumentFile(req.file)) return res.status(400).json({ error: 'The uploaded file content is not a valid JPG, PNG, HEIC, or PDF' });
      let expiresOn = null;
      if (req.body.expiresOn || EXPIRING_DOCUMENT_TYPES.has(req.body.type)) {
        expiresOn = parseIsoDate(req.body.expiresOn);
        if (!expiresOn || expiresOn <= todayIso()) return res.status(400).json({ error: 'A future expiration date (YYYY-MM-DD) is required for this document' });
      }
      const storagePath = await documentStorage.upload(req.auth.identity.id, req.file, req.body.type);
      try {
        const fileUrl = await documentStorage.signedUrl(storagePath);
        const document = await repository.createDriverDocument(req.auth.identity.id, {
          type: req.body.type,
          storagePath,
          fileName: req.file.originalname.slice(0, 255),
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          expiresOn,
        });
        return res.status(201).json({ ...document, fileUrl });
      } catch (error) {
        await documentStorage.remove(storagePath).catch(() => {});
        throw error;
      }
    } catch (error) { next(error); }
  });

  app.delete('/api/drivers/me/documents/:documentId', authenticate, requireRole('driver'), limit.accountChange, async (req, res, next) => {
    try {
      if (!documentStorage) return res.status(503).json({ error: 'Document storage is not configured' });
      const document = await repository.getDriverDocument(req.auth.identity.id, req.params.documentId);
      if (!document) return res.status(404).json({ error: 'Document not found' });
      if (document.status === 'approved') return res.status(409).json({ error: 'Approved documents cannot be deleted. Upload a replacement instead.' });
      await documentStorage.remove(document.storagePath);
      await repository.deleteDriverDocument(req.auth.identity.id, req.params.documentId);
      res.status(204).end();
    } catch (error) { next(error); }
  });

  // ---- Driver verification (individual providers) ----
  app.get('/api/drivers/me/verification', authenticate, requireRole('driver'), async (req, res, next) => {
    try {
      const [verification, documents] = await Promise.all([
        repository.getDriverVerification(req.auth.identity.id),
        repository.listDriverDocuments(req.auth.identity.id),
      ]);
      res.json({
        ...verification,
        requiredDocuments: REQUIRED_DOCUMENT_TYPES,
        readiness: verificationReadiness(documents),
        documents: documents.map(publicDocument),
      });
    } catch (error) { next(error); }
  });
  app.post('/api/drivers/me/verification/submit', authenticate, requireRole('driver'), limit.accountChange, async (req, res, next) => {
    try {
      const readiness = verificationReadiness(await repository.listDriverDocuments(req.auth.identity.id));
      if (!readiness.canSubmit) return res.status(409).json({ error: 'Upload every required, unexpired document before submitting', ...readiness });
      const verification = await repository.submitDriverVerification(req.auth.identity.id);
      if (!verification) return res.status(409).json({ error: 'Your application is already under review or decided' });
      res.json(verification);
    } catch (error) { next(error); }
  });

  // ---- Admin review ----
  const requireAdmin = requireRole('admin');
  app.get('/api/admin/drivers', authenticate, requireAdmin, async (req, res, next) => {
    try {
      const filter = req.query.status ? String(req.query.status) : 'needs_review';
      if (filter !== 'all' && !DRIVER_STATUS_FILTERS.has(filter)) return res.status(400).json({ error: 'Unsupported status filter' });
      res.json(await repository.listDriversForReview(filter));
    } catch (error) { next(error); }
  });
  app.get('/api/admin/drivers/:driverId', authenticate, requireAdmin, async (req, res, next) => {
    try {
      const detail = await repository.getDriverForReview(req.params.driverId);
      if (!detail) return res.status(404).json({ error: 'Driver not found' });
      const documents = await Promise.all(detail.documents.map(async (document) => ({
        ...publicDocument(document),
        fileUrl: documentStorage ? await documentStorage.signedUrl(document.storagePath) : null,
      })));
      res.json({ ...detail, documents, readiness: verificationReadiness(detail.documents) });
    } catch (error) { next(error); }
  });
  app.post('/api/admin/documents/:documentId/review', authenticate, requireAdmin, async (req, res, next) => {
    try {
      const decision = req.body.decision;
      if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'decision must be approve or reject' });
      const notes = cleanNotes(req.body.notes);
      if (decision === 'reject' && !notes) return res.status(400).json({ error: 'A reason is required when rejecting a document' });
      let expiresOn;
      if (req.body.expiresOn !== undefined) {
        expiresOn = parseIsoDate(req.body.expiresOn);
        if (!expiresOn) return res.status(400).json({ error: 'expiresOn must be a valid YYYY-MM-DD date' });
      }
      const document = await repository.getDocumentForReview(req.params.documentId);
      if (!document) return res.status(404).json({ error: 'Document not found' });
      const reviewed = await repository.reviewDriverDocument(document.id, req.auth.identity.id, {
        status: decision === 'approve' ? 'approved' : 'rejected', notes, expiresOn,
      });
      // Rejecting a document of a verified driver (e.g. insurance cancelled) ends their eligibility
      // immediately: they go offline and must fix the document and resubmit.
      if (decision === 'reject') {
        const detail = await repository.getDriverForReview(document.driverId);
        if (detail?.driver.verificationStatus === 'verified') {
          await repository.applyDriverDecision(document.driverId, req.auth.identity.id, {
            fromStatuses: ['verified'], toStatus: 'rejected', event: 'rejected',
            notes: `${notes} (document approval revoked)`,
          });
        }
      }
      // An approved replacement (e.g. renewed insurance) extends an already-verified driver's eligibility.
      if (decision === 'approve') {
        const detail = await repository.getDriverForReview(document.driverId);
        const readiness = verificationReadiness(detail.documents);
        if (detail.driver.verificationStatus === 'verified' && readiness.canVerify) {
          await repository.setCredentialsValidUntil(document.driverId, readiness.credentialsValidUntil);
        }
      }
      res.json(publicDocument(reviewed));
    } catch (error) { next(error); }
  });
  app.post('/api/admin/drivers/:driverId/decision', authenticate, requireAdmin, async (req, res, next) => {
    try {
      const rule = DRIVER_DECISIONS[req.body.decision];
      if (!rule) return res.status(400).json({ error: 'decision must be verify, reject, suspend, or reinstate' });
      const notes = cleanNotes(req.body.notes);
      if (rule.requiresNotes && !notes) return res.status(400).json({ error: 'A reason is required for this decision' });
      const detail = await repository.getDriverForReview(req.params.driverId);
      if (!detail) return res.status(404).json({ error: 'Driver not found' });
      let credentialsValidUntil;
      if (rule.requiresApprovedDocuments) {
        const readiness = verificationReadiness(detail.documents);
        if (!readiness.canVerify) return res.status(409).json({ error: 'Every required document must be approved and unexpired', ...readiness });
        credentialsValidUntil = readiness.credentialsValidUntil;
      }
      const verification = await repository.applyDriverDecision(req.params.driverId, req.auth.identity.id, {
        fromStatuses: rule.from, toStatus: rule.to, event: rule.event, notes, credentialsValidUntil,
      });
      if (!verification) return res.status(409).json({ error: `A driver who is ${detail.driver.verificationStatus.replace('_', ' ')} cannot be moved to ${rule.to}` });
      res.json(verification);
    } catch (error) { next(error); }
  });

  // ---- B18: admin reports inbox ----
  app.get('/api/admin/reports', authenticate, requireAdmin, async (req, res, next) => {
    try {
      const filter = req.query.status ? String(req.query.status) : 'active';
      if (!Object.hasOwn(STATUS_FILTERS, filter)) return res.status(400).json({ error: 'Unsupported status filter' });
      const category = req.query.category ? String(req.query.category) : null;
      if (category && !ALL_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Unsupported category' });
      res.json(await repository.listSupportReportsForAdmin({ statuses: STATUS_FILTERS[filter], category }));
    } catch (error) { next(error); }
  });
  app.get('/api/admin/reports/:reportId', authenticate, requireAdmin, async (req, res, next) => {
    try {
      const report = UUID.test(req.params.reportId) ? await repository.getSupportReportForAdmin(req.params.reportId) : null;
      if (!report) return res.status(404).json({ error: 'Report not found' });
      res.json(report);
    } catch (error) { next(error); }
  });
  // B12: the chat of the job a report is about (admins only; also after the apps stop showing it).
  app.get('/api/admin/reports/:reportId/messages', authenticate, requireAdmin, async (req, res, next) => {
    try {
      if (!UUID.test(req.params.reportId) || !await repository.getSupportReportStatus(req.params.reportId)) return res.status(404).json({ error: 'Report not found' });
      const chat = await repository.getReportChatForAdmin(req.params.reportId);
      res.json(chat || { bookingId: null, messages: [], blocks: [] });
    } catch (error) { next(error); }
  });
  app.patch('/api/admin/reports/:reportId', authenticate, requireAdmin, async (req, res, next) => {
    try {
      const current = UUID.test(req.params.reportId) ? await repository.getSupportReportStatus(req.params.reportId) : null;
      if (!current) return res.status(404).json({ error: 'Report not found' });
      const verdict = checkAdminUpdate(req.body, current);
      if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.error, currentStatus: current });
      const updated = await repository.updateSupportReport(req.params.reportId, req.auth.identity.id, { fromStatus: current, status: verdict.status, note: verdict.note });
      if (!updated) return res.status(409).json({ error: 'This report was just updated by someone else. Reload to see the latest.' });
      res.json(updated);
    } catch (error) { next(error); }
  });

  // ---- C3: admin payments (holds, charges, fees, refunds, disputes). Admin routes require the
  // authenticator-app step (aal2, E5) — authenticate() refuses password-only admin sessions. ----
  const PAYMENT_FILTERS = new Set(['attention', 'disputes', 'refunds', 'all']);
  app.get('/api/admin/payments', authenticate, requireAdmin, async (req, res, next) => {
    try {
      const filter = req.query.filter ? String(req.query.filter) : 'attention';
      if (!PAYMENT_FILTERS.has(filter)) return res.status(400).json({ error: 'Unsupported payment filter' });
      res.json({ ...(await repository.listPaymentsForAdmin(filter)), config: payments.publicConfig() });
    } catch (error) { next(error); }
  });
  app.get('/api/admin/payments/:bookingId', authenticate, requireAdmin, async (req, res, next) => {
    try {
      const detail = UUID.test(req.params.bookingId) ? await repository.getPaymentForAdmin(req.params.bookingId) : null;
      if (!detail) return res.status(404).json({ error: 'No payment for this booking' });
      res.json(detail);
    } catch (error) { next(error); }
  });
  // Full or partial refund of what was charged, with a reason (kept on the booking's audit trail).
  app.post('/api/admin/payments/:bookingId/refund', authenticate, requireAdmin, limit.accountChange, async (req, res, next) => {
    try {
      if (!payments.configured) return res.status(503).json({ error: "Card payments aren't set up yet.", code: PAYMENT_CODES.notConfigured });
      if (!UUID.test(req.params.bookingId)) return res.status(404).json({ error: 'This booking has no card payment.' });
      const cleaned = cleanRefundRequest(req.body);
      if (!cleaned.ok) return res.status(400).json({ error: cleaned.error, field: cleaned.field });
      const result = await payments.refund({ bookingId: req.params.bookingId, adminId: req.auth.identity.id, ...cleaned.refund });
      res.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  app.use(notFound);
  app.use(errorHandler({ logger, multer, documentMaxBytes }));
  return app;
}

module.exports = { createApp, SERVICE_CATALOG };
