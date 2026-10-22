const express = require('express');
const cors = require('cors');
const multer = require('multer');
const {
  REQUIRED_DOCUMENT_TYPES, EXPIRING_DOCUMENT_TYPES, DRIVER_DECISIONS, DRIVER_STATUS_FILTERS,
  todayIso, parseIsoDate, cleanNotes, verificationReadiness, credentialsCurrent,
} = require('./verification');

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
  battery_jump: { id: 'battery_jump', name: "Won't start", description: 'Battery jump-start and diagnosis', basePrice: 65, estimatedTime: 30 },
  flat_tire: { id: 'flat_tire', name: 'Flat tire', description: 'On-site tire change or inflation', basePrice: 75, estimatedTime: 35 },
  towing: { id: 'towing', name: 'Towing', description: 'Local roadside towing', basePrice: 125, estimatedTime: 60 },
  lockout: { id: 'lockout', name: 'Locked out', description: 'Vehicle lockout assistance', basePrice: 70, estimatedTime: 30 },
  fuel_delivery: { id: 'fuel_delivery', name: 'Fuel delivery', description: 'Emergency fuel delivery', basePrice: 75, estimatedTime: 35 },
  ev_charging: { id: 'ev_charging', name: 'EV charging', description: 'Mobile emergency EV charge', basePrice: 95, estimatedTime: 45 },
  oil_change: { id: 'oil_change', name: 'Oil change', description: 'Mobile oil change', basePrice: 90, estimatedTime: 45 },
  detailing: { id: 'detailing', name: 'Detailing', description: 'Mobile vehicle detailing', basePrice: 150, estimatedTime: 120 },
  window_tinting: { id: 'window_tinting', name: 'Window tinting', description: 'Professional mobile tinting', basePrice: 250, estimatedTime: 180 },
});

const DRIVER_TRANSITIONS = Object.freeze({
  en_route: ['accepted'], arrived: ['en_route'], in_progress: ['arrived'], completed: ['in_progress'], cancelled: ['accepted', 'en_route'],
});
const CUSTOMER_TRANSITIONS = Object.freeze({ cancelled: ['pending', 'searching', 'accepted'] });

function validLocation(location) {
  return location && typeof location.address === 'string' && location.address.trim().length > 0 &&
    Number.isFinite(location.lat) && location.lat >= -90 && location.lat <= 90 &&
    Number.isFinite(location.lng) && location.lng >= -180 && location.lng <= 180;
}

function validVehicle(input) {
  return input && typeof input.make === 'string' && input.make.trim() && typeof input.model === 'string' && input.model.trim() &&
    Number.isInteger(input.year) && input.year >= 1900 && input.year <= 2100;
}

function createApp({ auth, repository, stripe, stripeWebhookSecret, documentStorage, accountAdmin, corsOrigin = 'http://127.0.0.1:5173' }) {
  const app = express();
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
  app.get('/api/services', (_req, res) => res.json(Object.values(SERVICE_CATALOG)));

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

  app.post('/api/bookings', authenticate, requireRole('customer'), async (req, res, next) => {
    try {
      const service = SERVICE_CATALOG[req.body.serviceType];
      if (!service) return res.status(400).json({ error: 'Unsupported service type' });
      if (!validLocation(req.body.location)) return res.status(400).json({ error: 'A valid service location is required' });
      if (req.body.dropoffLocation && !validLocation(req.body.dropoffLocation)) return res.status(400).json({ error: 'Drop-off location is invalid' });
      if (req.body.vehicleId && !await repository.getVehicle(req.auth.identity.id, req.body.vehicleId)) {
        return res.status(400).json({ error: 'Vehicle is not available for this customer' });
      }
      const booking = await repository.createBooking({
        customerId: req.auth.identity.id, vehicleId: req.body.vehicleId || null, service,
        location: { address: req.body.location.address.trim().slice(0, 300), lat: req.body.location.lat, lng: req.body.location.lng },
        dropoffLocation: req.body.dropoffLocation || null, estimatedPrice: service.basePrice,
        notes: typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : null,
      });
      res.status(201).json(booking);
    } catch (error) { next(error); }
  });
  app.get('/api/bookings', authenticate, async (req, res, next) => {
    try { res.json(await repository.listBookings(req.auth.identity.id, req.auth.profile.role)); } catch (error) { next(error); }
  });
  app.get('/api/bookings/active', authenticate, async (req, res, next) => {
    try { res.json(await repository.getActiveBooking(req.auth.identity.id, req.auth.profile.role)); } catch (error) { next(error); }
  });
  app.get('/api/bookings/:bookingId', authenticate, async (req, res, next) => {
    try {
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
      const transitions = req.auth.profile.role === 'driver' ? DRIVER_TRANSITIONS : CUSTOMER_TRANSITIONS;
      const allowedCurrent = transitions[req.body.status];
      if (!allowedCurrent) return res.status(400).json({ error: 'Status transition is not allowed' });
      const booking = await repository.updateBookingStatus(req.params.bookingId, req.auth.identity.id, req.auth.profile.role, req.body.status, allowedCurrent);
      if (!booking) return res.status(409).json({ error: 'Booking status has changed or access was denied' });
      res.json(booking);
    } catch (error) { next(error); }
  });

  app.get('/api/drivers/requests', authenticate, requireVerifiedDriver, requireOnlineDriver, async (_req, res, next) => {
    try { res.json(await repository.listAvailableBookings()); } catch (error) { next(error); }
  });
  // Going offline is always allowed (e.g. after credentials lapse); going online requires eligibility.
  const requireEligibleToGoOnline = (req, res, next) => (req.body.isOnline === false ? next() : requireVerifiedDriver(req, res, next));
  app.patch('/api/drivers/me/online', authenticate, requireRole('driver'), requireEligibleToGoOnline, async (req, res, next) => {
    try {
      if (typeof req.body.isOnline !== 'boolean') return res.status(400).json({ error: 'isOnline must be a boolean' });
      await repository.updateDriverOnlineStatus(req.auth.identity.id, req.body.isOnline);
      res.json({ isOnline: req.body.isOnline });
    } catch (error) { next(error); }
  });
  app.post('/api/bookings/:bookingId/accept', authenticate, requireVerifiedDriver, requireOnlineDriver, async (req, res, next) => {
    try {
      const booking = await repository.acceptBooking(req.params.bookingId, req.auth.identity.id);
      if (!booking) return res.status(409).json({ error: 'Booking is no longer available' });
      res.json(booking);
    } catch (error) { next(error); }
  });
  app.patch('/api/bookings/:bookingId/driver-location', authenticate, requireVerifiedDriver, async (req, res, next) => {
    try {
      const location = req.body.location;
      if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return res.status(400).json({ error: 'Valid coordinates are required' });
      const booking = await repository.updateDriverLocation(req.params.bookingId, req.auth.identity.id, location);
      if (!booking) return res.status(404).json({ error: 'Active booking not found' });
      res.json(booking);
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

module.exports = { createApp, SERVICE_CATALOG, DRIVER_TRANSITIONS, CUSTOMER_TRANSITIONS };
