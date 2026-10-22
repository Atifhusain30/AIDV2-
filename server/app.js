const express = require('express');
const cors = require('cors');
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
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4 },
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

function createApp({ auth, repository, stripe, stripeWebhookSecret, documentStorage, accountAdmin, corsOrigin = 'http://127.0.0.1:5173', requestRadiusMiles = radiusFromEnv(), ratingWindowDays = RATING_WINDOW_DAYS, supportContact = supportContactFromEnv() }) {
  const app = express();
  const requestExpiryMinutes = repository.requestExpiryMinutes || DEFAULT_REQUEST_EXPIRY_MINUTES;
  // E4: end stale work for this caller before answering (the interval sweep in index.js does the rest).
  const expireStaleFor = (auth) => {
    const role = auth.profile.role;
    if (role === 'customer') return repository.expireStaleBookings({ customerId: auth.identity.id });
    if (role === 'driver') return repository.expireStaleBookings({ driverId: auth.identity.id });
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
  app.disable('x-powered-by');
  const allowedOrigins = new Set((Array.isArray(corsOrigin) ? corsOrigin : String(corsOrigin).split(',')).map((origin) => origin.trim()).filter(Boolean));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Stripe-Signature'],
  }));

  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !stripeWebhookSecret) return res.status(503).json({ error: 'Stripe webhook is not configured' });
    try {
      const event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), stripeWebhookSecret);
      if (event.type === 'payment_intent.succeeded') await repository.updatePaymentStatus(event.data.object.id, 'succeeded');
      if (event.type === 'payment_intent.payment_failed') await repository.updatePaymentStatus(event.data.object.id, 'failed');
      if (event.type === 'payment_intent.processing') await repository.updatePaymentStatus(event.data.object.id, 'processing');
      res.json({ received: true });
    } catch (_error) {
      res.status(400).json({ error: 'Invalid webhook signature' });
    }
  });

  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
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
  app.patch('/api/me', authenticate, async (req, res, next) => {
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
  app.delete('/api/me', authenticate, async (req, res, next) => {
    try {
      if (!accountAdmin) return res.status(503).json({ error: 'Account deletion is not configured' });
      await accountAdmin.deleteUser(req.auth.identity.id);
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get('/api/vehicles', authenticate, requireRole('customer'), async (req, res, next) => {
    try { res.json(await repository.listVehicles(req.auth.identity.id)); } catch (error) { next(error); }
  });
  app.post('/api/vehicles', authenticate, requireRole('customer'), async (req, res, next) => {
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
  app.patch('/api/vehicles/:vehicleId', authenticate, requireRole('customer'), async (req, res, next) => {
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
  app.delete('/api/vehicles/:vehicleId', authenticate, requireRole('customer'), async (req, res, next) => {
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

  app.post('/api/quotes', authenticate, requireRole('customer'), (req, res, next) => {
    try {
      const priced = priceRequest(req.body);
      if (priced.error) return res.status(priced.status).json({ error: priced.error });
      res.json({ serviceType: priced.service.id, ...priced.quote });
    } catch (error) { next(error); }
  });

  app.post('/api/bookings', authenticate, requireRole('customer'), async (req, res, next) => {
    try {
      const priced = priceRequest(req.body);
      if (priced.error) return res.status(priced.status).json({ error: priced.error });
      const { service, dropoff, quote } = priced;
      if (req.body.vehicleId && !await repository.getVehicle(req.auth.identity.id, req.body.vehicleId)) {
        return res.status(400).json({ error: 'Vehicle is not available for this customer' });
      }
      // E4: one active request per customer. Stale ones are ended first so they never block a new
      // request; the unique index catches two requests racing past this check.
      await expireStaleFor(req.auth);
      const existing = await repository.getActiveBooking(req.auth.identity.id, 'customer');
      if (existing) return activeRequestConflict(res, existing);
      let booking;
      try {
        booking = await repository.createBooking({
          customerId: req.auth.identity.id, vehicleId: req.body.vehicleId || null, service,
          location: cleanLocation(req.body.location),
          dropoffLocation: dropoff ? cleanLocation(dropoff) : null, estimatedPrice: quote.price,
          notes: typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : null,
        });
      } catch (error) {
        if (error?.code !== ACTIVE_REQUEST_CODE) throw error;
        return activeRequestConflict(res, await repository.getActiveBooking(req.auth.identity.id, 'customer'));
      }
      res.status(201).json(booking);
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
      res.json(await repository.getActiveBooking(req.auth.identity.id, req.auth.profile.role));
    } catch (error) { next(error); }
  });
  app.get('/api/bookings/:bookingId', authenticate, async (req, res, next) => {
    try {
      await expireStaleFor(req.auth);
      const booking = await repository.getBooking(req.params.bookingId, req.auth.identity.id, req.auth.profile.role);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      res.json(booking);
    } catch (error) { next(error); }
  });
  app.patch('/api/bookings/:bookingId/status', authenticate, async (req, res, next) => {
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
      // Compare-and-set on the exact status we validated, so a concurrent change is a 409, never a skipped step.
      const booking = await repository.updateBookingStatus(req.params.bookingId, req.auth.identity.id, role, nextStatus, [verdict.from], { reason: verdict.reason });
      if (!booking) {
        const latest = await repository.getBooking(req.params.bookingId, req.auth.identity.id, role);
        return res.status(409).json({ error: 'This job was just updated. Showing the latest status.', currentStatus: latest?.status, booking: latest });
      }
      res.json(booking);
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
  app.post('/api/support/reports', authenticate, async (req, res, next) => {
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
        return res.status(429).json({ error: `You've sent ${REPORTS_PER_HOUR} reports in the last hour. Please wait a little before sending another. If anyone is in danger, call 911.`, code: 'report_rate_limited' });
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
  app.post('/api/bookings/:bookingId/rating', authenticate, async (req, res, next) => {
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
  app.get('/api/drivers/requests', authenticate, requireVerifiedDriver, requireDriverVehicle, requireOnlineDriver, async (req, res, next) => {
    try {
      const driverId = req.auth.identity.id;
      const sent = req.query.lat !== undefined || req.query.lng !== undefined;
      if (sent) {
        const position = parsePosition(req.query.lat, req.query.lng);
        if (!position) return res.status(400).json({ error: 'Your location looks wrong. Check location access and try again.', code: 'invalid_location' });
        await repository.updateDriverPosition(driverId, position);
      }
      const from = await repository.getDriverPosition(driverId, LOCATION_MAX_AGE_MINUTES);
      if (!from) return res.json({ status: LOCATION_REQUIRED_CODE, radiusMiles: requestRadiusMiles, requests: [] });
      const capability = equipmentCapability(req.auth.profile.driverVehicle.equipmentType);
      const candidates = await repository.listAvailableBookings(capability, boundingBox(from, requestRadiusMiles));
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
      res.json({ isOnline: req.body.isOnline });
    } catch (error) { next(error); }
  });
  app.post('/api/bookings/:bookingId/accept', authenticate, requireVerifiedDriver, requireDriverVehicle, requireOnlineDriver, async (req, res, next) => {
    try {
      // A job this driver went silent on, or a request past its window, ends first (E4).
      await repository.expireStaleBookings({ driverId: req.auth.identity.id });
      await repository.expireStaleBookings({ bookingId: req.params.bookingId });
      // One job at a time (also enforced atomically in acceptBooking); this gives the clearer message.
      const current = await repository.getActiveBooking(req.auth.identity.id, 'driver');
      if (current) return res.status(409).json({ error: 'Finish or cancel your current job before accepting another', code: 'driver_busy' });
      const equipmentType = req.auth.profile.driverVehicle.equipmentType;
      const open = await repository.getAvailableBooking(req.params.bookingId);
      if (!open) {
        if (await repository.getBookingStatus(req.params.bookingId) === 'expired') return expiredRequest(res);
        return res.status(409).json({ error: 'Booking is no longer available' });
      }
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
        await repository.expireStaleBookings({ bookingId: req.params.bookingId });
        if (await repository.getBookingStatus(req.params.bookingId) === 'expired') return expiredRequest(res);
        if (await repository.getActiveBooking(req.auth.identity.id, 'driver')) {
          return res.status(409).json({ error: 'Finish or cancel your current job before accepting another', code: 'driver_busy' });
        }
        return res.status(409).json({ error: 'Booking is no longer available' });
      }
      res.json(booking);
    } catch (error) { next(error); }
  });
  app.patch('/api/bookings/:bookingId/driver-location', authenticate, requireVerifiedDriver, async (req, res, next) => {
    try {
      const location = req.body.location;
      if (!validCoordinates(location)) return res.status(400).json({ error: 'Valid coordinates are required' });
      const booking = await repository.updateDriverLocation(req.params.bookingId, req.auth.identity.id, { lat: location.lat, lng: location.lng });
      if (!booking) return res.status(404).json({ error: 'Active booking not found' });
      res.json(booking);
    } catch (error) { next(error); }
  });

  // The vehicle customers should look for when the driver arrives, plus the equipment it carries.
  app.patch('/api/drivers/me/vehicle', authenticate, requireRole('driver'), async (req, res, next) => {
    try {
      const result = cleanDriverVehicle(req.body);
      if (!result.ok) return res.status(400).json({ error: result.error, field: result.field });
      res.json(await repository.updateDriverVehicle(req.auth.identity.id, result.vehicle));
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
  app.post('/api/drivers/me/documents', authenticate, requireRole('driver'), documentUpload.single('file'), async (req, res, next) => {
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

  app.delete('/api/drivers/me/documents/:documentId', authenticate, requireRole('driver'), async (req, res, next) => {
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
  app.post('/api/drivers/me/verification/submit', authenticate, requireRole('driver'), async (req, res, next) => {
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

  app.post('/api/payments/create-intent', authenticate, requireRole('customer'), async (req, res, next) => {
    try {
      if (!stripe) return res.status(503).json({ error: 'Payments are not configured' });
      const booking = await repository.getBooking(req.body.bookingId, req.auth.identity.id, 'customer');
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (booking.payment?.status === 'succeeded') return res.status(409).json({ error: 'Booking is already paid' });
      if (booking.status !== 'completed') return res.status(409).json({ error: 'Booking must be completed before payment' });
      const amount = Math.round(booking.estimatedPrice * 100);
      const previousIntentId = booking.payment?.intentId;
      const retryablePayment = previousIntentId && ['failed', 'refunded'].includes(booking.payment.status);
      const idempotencyKey = retryablePayment
        ? `booking-${booking.id}-retry-${previousIntentId}`
        : `booking-${booking.id}`;
      const intent = await stripe.paymentIntents.create({
        amount, currency: 'usd', automatic_payment_methods: { enabled: true },
        metadata: { bookingId: booking.id, customerId: req.auth.identity.id },
      }, { idempotencyKey });
      await repository.setPaymentIntent(booking.id, req.auth.identity.id, intent.id);
      res.json({ id: intent.id, clientSecret: intent.client_secret, amount: intent.amount, currency: intent.currency, status: intent.status });
    } catch (error) { next(error); }
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Document upload exceeds the allowed limits' });
    console.error('[AID API]', error);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

module.exports = { createApp, SERVICE_CATALOG };
