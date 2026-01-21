/**
 * AID Backend Server
 * Handles Stripe payments and API endpoints
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - CORS first
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ============================================
// STRIPE WEBHOOK - MUST be BEFORE express.json()
// ============================================

/**
 * Stripe Webhook handler
 * POST /api/webhooks/stripe
 * Uses raw body for signature verification
 */
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('[Webhook] No webhook secret configured');
    return res.status(400).json({ error: 'Webhook not configured' });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log(`[Webhook] Payment succeeded for ${paymentIntent.metadata.bookingId}`);
      // TODO: Update booking status to paid
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log(`[Webhook] Payment failed for ${failedPayment.metadata.bookingId}`);
      // TODO: Handle failed payment
      break;

    default:
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// JSON body parser - AFTER webhook route
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// PAYMENT ENDPOINTS
// ============================================

/**
 * Create a Payment Intent
 * POST /api/payments/create-intent
 * Body: { amount: number (cents), currency: string, bookingId: string, metadata?: object }
 */
app.post('/api/payments/create-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', bookingId, metadata = {} } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID required' });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Ensure integer
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        bookingId,
        ...metadata
      }
    });

    console.log(`[Payment] Created intent ${paymentIntent.id} for booking ${bookingId}`);

    res.json({
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status
    });
  } catch (error) {
    console.error('[Payment] Create intent failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get Payment Intent status
 * GET /api/payments/:paymentIntentId
 */
app.get('/api/payments/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    res.json({
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      metadata: paymentIntent.metadata
    });
  } catch (error) {
    console.error('[Payment] Get intent failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BOOKING ENDPOINTS (Mock for now)
// ============================================

// In-memory store for demo
const bookings = new Map();

/**
 * Create a booking
 * POST /api/bookings
 */
app.post('/api/bookings', (req, res) => {
  const { service, location, estimatedPrice, notes, customerId } = req.body;
  
  const booking = {
    id: `booking_${Date.now()}`,
    customerId: customerId || 'anonymous',
    service,
    location,
    estimatedPrice,
    notes,
    status: 'searching',
    createdAt: new Date().toISOString()
  };

  bookings.set(booking.id, booking);
  console.log(`[Booking] Created ${booking.id}`);

  res.json(booking);
});

/**
 * Get a booking
 * GET /api/bookings/:bookingId
 */
app.get('/api/bookings/:bookingId', (req, res) => {
  const booking = bookings.get(req.params.bookingId);
  
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  res.json(booking);
});

/**
 * Update booking status
 * PATCH /api/bookings/:bookingId/status
 */
app.patch('/api/bookings/:bookingId/status', (req, res) => {
  const booking = bookings.get(req.params.bookingId);
  
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  booking.status = req.body.status;
  booking.updatedAt = new Date().toISOString();

  if (req.body.status === 'completed') {
    booking.completedAt = new Date().toISOString();
  }

  bookings.set(booking.id, booking);
  console.log(`[Booking] Updated ${booking.id} status to ${booking.status}`);

  res.json(booking);
});

// ============================================
// DRIVER ENDPOINTS (Mock for now)
// ============================================

/**
 * Get pending service requests for drivers
 * GET /api/drivers/requests
 */
app.get('/api/drivers/requests', (req, res) => {
  const requests = Array.from(bookings.values())
    .filter(b => b.status === 'searching')
    .map(b => ({
      id: b.id,
      customerId: b.customerId,
      customerName: 'Customer', // Would come from user lookup
      customerPhone: '+1 (555) 123-4567',
      service: b.service,
      location: b.location,
      estimatedPrice: b.estimatedPrice,
      notes: b.notes,
      createdAt: b.createdAt,
      expiresAt: new Date(new Date(b.createdAt).getTime() + 5 * 60 * 1000).toISOString()
    }));

  res.json(requests);
});

/**
 * Accept a service request
 * POST /api/bookings/:bookingId/accept
 */
app.post('/api/bookings/:bookingId/accept', (req, res) => {
  const booking = bookings.get(req.params.bookingId);
  
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  booking.driverId = req.body.driverId;
  booking.status = 'accepted';
  booking.acceptedAt = new Date().toISOString();

  bookings.set(booking.id, booking);
  console.log(`[Booking] ${booking.id} accepted by driver ${booking.driverId}`);

  res.json(booking);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║          AID Backend Server                ║
╠════════════════════════════════════════════╣
║  Status: Running                           ║
║  Port: ${PORT}                                ║
║  Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Configured' : 'NOT CONFIGURED'}               ║
╚════════════════════════════════════════════╝

Endpoints:
  POST /api/payments/create-intent
  GET  /api/payments/:id
  POST /api/webhooks/stripe
  POST /api/bookings
  GET  /api/bookings/:id
  PATCH /api/bookings/:id/status
  GET  /api/drivers/requests
  POST /api/bookings/:id/accept
  `);
});
