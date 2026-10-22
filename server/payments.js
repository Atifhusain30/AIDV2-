/**
 * C2/C3 payments core: a card hold when a request is made, a charge when the job is done, the hold
 * released when it isn't, a cancellation fee, refunds and disputes. Stripe is called only from here
 * (server side); the apps never send an amount.
 *
 *   request ──POST /api/bookings──▶ booking 'pending' + PaymentIntent (capture_method=manual, amount = server quote,
 *                                    on the customer's Stripe Customer)       payment: awaiting_authorization
 *   card confirmed in the app (3-D Secure if the bank asks) ──▶ Stripe status requires_capture
 *        └─ POST /api/bookings/:id/payment/confirm or webhook amount_capturable_updated
 *           ──▶ payment authorized, booking pending → searching (only now do drivers see it)
 *   completed ─────────────────────────────▶ capture min(quote, hold)                payment: captured
 *   customer cancels while the driver is on the way (en_route)
 *                     ─────────────────────▶ capture the cancellation fee, rest released   payment: fee_captured
 *   any other end (customer cancel before en_route, driver cancel, expiry, system release)
 *                     ─────────────────────▶ cancel the PaymentIntent (hold released)        payment: released
 *   admin refund (aal2) ───────────────────▶ refunds.create                          payment: (partially_)refunded
 *   dispute webhooks ──────────────────────▶ dispute_* + needs_attention='dispute' (admin Payments list)
 *
 * Every Stripe write carries an idempotency key built from the booking id and the action, so a retry
 * (network error, the settlement sweep, a double tap) never charges or refunds twice.
 * If a capture/release fails, the booking still ends; the payment stays open and the settlement sweep
 * (index.js, with the expiry sweep) retries it. After SETTLEMENT_ATTENTION_AFTER failures the booking is
 * flagged for the admin.
 *
 * Owner-adjustable placeholders (env): CANCELLATION_FEE_CENTS (default 1500 = $15), CANCELLATION_FEE_FROM
 * (statuses a customer cancel pays the fee from; default en_route). See LAUNCH_CHECKLIST A9/C3.
 */

const CURRENCY = 'usd';
const DEFAULT_CANCELLATION_FEE_CENTS = 1500;
const DEFAULT_FEE_FROM_STATUSES = Object.freeze(['en_route']);
// The customer can only cancel from these (lifecycle.js); the fee can only apply to the ones after acceptance.
const FEE_ELIGIBLE_STATUSES = Object.freeze(['accepted', 'en_route']);
const SETTLEMENT_ATTENTION_AFTER = 3;
// A request whose card isn't confirmed within this many minutes is ended (before the E4 expiry would
// call it "no driver found", which would be untrue — no driver ever saw it).
const DEFAULT_PAYMENT_CONFIRM_MINUTES = 10;

const CODES = Object.freeze({
  notConfigured: 'payments_not_configured',
  requiresAction: 'payment_requires_action',
  failed: 'payment_failed',
  processing: 'payment_processing',
  notAwaiting: 'payment_not_awaiting',
});

// Payment statuses that still hold money open on Stripe's side.
const OPEN_STATUSES = Object.freeze(['awaiting_authorization', 'authorized', 'failed']);
// After one of these nothing may move the payment back to an earlier state (webhooks arrive out of order).
const SETTLED_STATUSES = Object.freeze(['captured', 'fee_captured', 'released', 'partially_refunded', 'refunded']);
const REFUND_REASONS = Object.freeze(['requested_by_customer', 'duplicate', 'fraudulent']);
const REFUND_NOTE_MAX = 500;

function intFromEnv(value, fallback, min, max) {
  const number = Number(value);
  return value != null && value !== '' && Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

/** Payment settings from the environment (see server/.env.example). */
function paymentsConfigFromEnv(env = process.env) {
  const key = env.STRIPE_SECRET_KEY || '';
  const mode = /^sk_live_/.test(key) ? 'live' : /^sk_test_/.test(key) ? 'test' : null;
  const feeFrom = String(env.CANCELLATION_FEE_FROM || '').split(',').map((item) => item.trim()).filter((item) => FEE_ELIGIBLE_STATUSES.includes(item));
  return {
    mode,
    cancellationFeeCents: intFromEnv(env.CANCELLATION_FEE_CENTS, DEFAULT_CANCELLATION_FEE_CENTS, 0, 10000),
    feeFromStatuses: feeFrom.length ? feeFrom : [...DEFAULT_FEE_FROM_STATUSES],
    paymentConfirmMinutes: intFromEnv(env.PAYMENT_CONFIRM_MINUTES, DEFAULT_PAYMENT_CONFIRM_MINUTES, 1, 14),
    // Dev only: requests go to drivers without a card when Stripe isn't configured. Never in production,
    // and ignored as soon as a Stripe key is configured.
    allowUnpaidRequests: env.DEV_ALLOW_UNPAID_REQUESTS === 'true' && env.NODE_ENV !== 'production',
  };
}

const toCents = (dollars) => Math.round(Number(dollars) * 100);

/**
 * What a customer cancel costs: the fee (never more than the hold) when the driver was already on the
 * way, otherwise nothing. Driver and system cancels never cost the customer anything.
 */
function cancellationFeeFor({ role, fromStatus, authorizedCents, feeCents, feeFromStatuses = DEFAULT_FEE_FROM_STATUSES }) {
  if (role !== 'customer' || !feeFromStatuses.includes(fromStatus) || !(feeCents > 0) || !(authorizedCents > 0)) return 0;
  return Math.min(feeCents, authorizedCents);
}

/**
 * What to do with an open payment once its booking has ended (pure; the sweep and the routes share it).
 *   { action: 'capture', amountCents }  completed: the quote (or final price), never above the hold
 *   { action: 'capture_fee', amountCents }  cancelled with a fee recorded at cancel time
 *   { action: 'release' }               everything else
 *   null                                booking still active, or nothing open
 */
function settlementFor(payment) {
  if (!payment || !payment.intentId || !OPEN_STATUSES.includes(payment.status)) return null;
  const ended = ['completed', 'cancelled', 'expired'].includes(payment.bookingStatus);
  if (!ended) return null;
  const authorized = payment.status === 'authorized' ? payment.amountAuthorizedCents : 0;
  if (payment.bookingStatus === 'completed' && authorized > 0) {
    const due = payment.finalCents > 0 ? payment.finalCents : payment.quotedCents;
    return { action: 'capture', amountCents: Math.min(due, authorized) };
  }
  if (payment.bookingStatus === 'cancelled' && authorized > 0 && payment.cancellationFeeCents > 0) {
    return { action: 'capture_fee', amountCents: Math.min(payment.cancellationFeeCents, authorized) };
  }
  return { action: 'release' };
}

const shortError = (error) => String((error && (error.message || error.code)) || 'Unknown Stripe error').slice(0, 300);

/** Plain-language message for a declined/failed card (from the PaymentIntent's last_payment_error). */
function declineMessage(intent) {
  const message = intent && intent.last_payment_error && intent.last_payment_error.message;
  return message ? `Your card wasn't authorized: ${message}` : "Your card wasn't authorized. Try another card.";
}

/**
 * The payments service. `stripe` is a stripe-node client (or a test double with the same method names
 * and argument order); null means payments are not configured.
 */
function createPayments({ stripe, repository, config = paymentsConfigFromEnv(), logger }) {
  const log = logger || { warn() {}, error() {}, info() {} };
  const configured = Boolean(stripe);

  function publicConfig() {
    return {
      status: configured ? 'configured' : 'not_configured',
      mode: configured ? (config.mode || 'test') : null,
      unpaidRequestsAllowed: !configured && config.allowUnpaidRequests,
      currency: CURRENCY,
      captureMethod: 'manual',
      cancellationFee: { cents: config.cancellationFeeCents, appliesFrom: config.feeFromStatuses },
    };
  }

  /** The customer's Stripe Customer id, created once (idempotent per AID user). */
  async function ensureCustomer(profile, email) {
    const existing = await repository.getStripeCustomerId(profile.id);
    if (existing) return existing;
    const customer = await stripe.customers.create({
      email: email || undefined,
      name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || undefined,
      metadata: { aidUserId: profile.id },
    }, { idempotencyKey: `customer-${profile.id}` });
    return repository.saveStripeCustomer(profile.id, customer.id);
  }

  /** Place a hold for a new booking. Returns what the app needs to confirm the card. */
  async function authorizeBooking(booking, profile, email) {
    const customerId = await ensureCustomer(profile, email);
    const amount = toCents(booking.estimatedPrice);
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: CURRENCY,
      customer: customerId,
      capture_method: 'manual',
      automatic_payment_methods: { enabled: true },
      description: `AID ${booking.service && booking.service.name ? booking.service.name : 'roadside service'}`,
      metadata: { bookingId: booking.id, customerId: profile.id },
    }, { idempotencyKey: `booking-${booking.id}-authorize` });
    await repository.createBookingPayment({
      bookingId: booking.id, intentId: intent.id, stripeCustomerId: customerId, quotedCents: amount, currency: CURRENCY,
    });
    return { intentId: intent.id, clientSecret: intent.client_secret, status: intent.status, amountCents: amount };
  }

  /**
   * Apply a PaymentIntent Stripe says is authorized (status requires_capture): checks it is ours and
   * for the server's amount, then records the hold and releases the request to drivers.
   * Returns { ok, promoted, booking?, reason? }.
   */
  async function applyAuthorized(intent, source) {
    const payment = await repository.getPaymentByIntent(intent.id);
    if (!payment) return { ok: false, reason: 'unknown_intent' };
    if (intent.metadata && intent.metadata.bookingId && intent.metadata.bookingId !== payment.bookingId) return { ok: false, reason: 'booking_mismatch' };
    if (intent.amount !== payment.quotedCents || intent.currency !== payment.currency) return { ok: false, reason: 'amount_mismatch' };
    const capturable = Number(intent.amount_capturable) || intent.amount;
    const result = await repository.markPaymentAuthorized(intent.id, capturable, { source });
    return { ok: true, ...result };
  }

  /** The app says the card was confirmed: ask Stripe (never trust the app) and act on what it says. */
  async function confirmAuthorization(booking) {
    const payment = await repository.getBookingPayment(booking.id);
    if (!payment) return { status: 409, body: { error: 'This request has no card hold to confirm.', code: CODES.notAwaiting } };
    if (payment.status === 'authorized') return { status: 200, body: { status: 'authorized', alreadyAuthorized: true } };
    if (!['awaiting_authorization', 'failed'].includes(payment.status) || booking.status !== 'pending') {
      return { status: 409, body: { error: 'This request is no longer waiting for a card.', code: CODES.notAwaiting } };
    }
    const intent = await stripe.paymentIntents.retrieve(payment.intentId);
    if (intent.status === 'requires_capture') {
      const applied = await applyAuthorized(intent, 'client_confirm');
      if (!applied.ok) {
        log.error({ msg: 'payment authorization did not match the booking', bookingId: booking.id, reason: applied.reason });
        return { status: 409, body: { error: "This payment doesn't match the request. Start a new request.", code: CODES.failed } };
      }
      return { status: 200, body: { status: 'authorized', promoted: applied.promoted } };
    }
    if (intent.status === 'requires_action') {
      return { status: 409, body: { error: 'Your bank needs you to confirm this payment.', code: CODES.requiresAction } };
    }
    if (intent.status === 'processing') {
      return { status: 202, body: { error: 'Your card is still being checked. This takes a few seconds.', code: CODES.processing } };
    }
    if (intent.status === 'requires_payment_method') {
      await repository.markPaymentFailed(intent.id, declineMessage(intent));
      return { status: 402, body: { error: declineMessage(intent), code: CODES.failed } };
    }
    return { status: 409, body: { error: 'This payment can no longer be used. Start a new request.', code: CODES.notAwaiting } };
  }

  /**
   * Capture or release the hold of an ended booking (see settlementFor). Safe to call repeatedly:
   * idempotency keys + Stripe's own state make a repeat a no-op. Never throws.
   */
  async function settle(bookingId) {
    if (!configured) return null;
    let payment;
    try {
      payment = await repository.getBookingPayment(bookingId);
      const plan = settlementFor(payment);
      if (!plan) return null;
      let intent;
      if (plan.action === 'release') {
        intent = await stripe.paymentIntents.cancel(payment.intentId, {
          cancellation_reason: payment.bookingStatus === 'cancelled' && payment.cancelledBy === 'customer' ? 'requested_by_customer' : 'abandoned',
        }, { idempotencyKey: `booking-${bookingId}-release` });
      } else {
        intent = await stripe.paymentIntents.capture(payment.intentId, { amount_to_capture: plan.amountCents },
          { idempotencyKey: `booking-${bookingId}-${plan.action === 'capture_fee' ? 'fee' : 'capture'}-${plan.amountCents}` });
      }
      return await syncIntent(intent, { action: plan.action });
    } catch (error) {
      // Already captured/cancelled elsewhere (dashboard, an earlier attempt): read Stripe's truth instead.
      if (payment && payment.intentId && error && error.code === 'payment_intent_unexpected_state') {
        try { return await syncIntent(await stripe.paymentIntents.retrieve(payment.intentId), { action: 'reconcile' }); } catch (_ignored) { /* fall through */ }
      }
      log.error({ msg: 'payment settlement failed', bookingId, error: shortError(error) });
      try { await repository.recordSettlementError(bookingId, shortError(error), SETTLEMENT_ATTENTION_AFTER); } catch (_ignored) { /* logged above */ }
      return null;
    }
  }

  async function settleMany(bookingIds) {
    for (const id of bookingIds || []) await settle(id);
  }

  /** Settlement sweep: retry every ended booking whose payment is still open. */
  async function settleOutstanding(limit = 50) {
    if (!configured) return [];
    const ids = await repository.listUnsettledPayments(limit);
    await settleMany(ids);
    return ids;
  }

  /**
   * Background tick (with the E4 sweep): end requests whose card was never confirmed within
   * paymentConfirmMinutes (their hold is released), then retry any open settlement.
   * Returns { ended } so the caller can tell the customers' apps.
   */
  async function tick() {
    if (!configured) return { ended: [], settled: [] };
    const ended = await repository.cancelUnpaidPending({ olderThanMinutes: config.paymentConfirmMinutes || DEFAULT_PAYMENT_CONFIRM_MINUTES });
    await settleMany(ended);
    const settled = await settleOutstanding();
    return { ended, settled };
  }

  /** Record what Stripe says about a PaymentIntent (captured / cancelled / authorized / failed). */
  async function syncIntent(intent, meta = {}) {
    if (intent.status === 'succeeded') return repository.markPaymentCaptured(intent.id, Number(intent.amount_received) || 0, meta);
    if (intent.status === 'canceled') return repository.markPaymentReleased(intent.id, meta);
    if (intent.status === 'requires_capture') return applyAuthorized(intent, meta.source || 'sync');
    if (intent.status === 'requires_payment_method' && intent.last_payment_error) return repository.markPaymentFailed(intent.id, declineMessage(intent));
    return null;
  }

  /**
   * One verified webhook event. Returns { bookingId?, promoted? } for realtime notification.
   * Unknown PaymentIntents (not AID's) are ignored.
   */
  async function handleEvent(event) {
    const object = event.data && event.data.object ? event.data.object : {};
    switch (event.type) {
      case 'payment_intent.amount_capturable_updated': {
        if (object.status !== 'requires_capture') return {};
        const applied = await applyAuthorized(object, 'webhook');
        if (!applied.ok && applied.reason !== 'unknown_intent') log.error({ msg: 'webhook authorization did not match the booking', intent: object.id, reason: applied.reason });
        return applied.ok ? { bookingId: applied.bookingId, promoted: applied.promoted } : {};
      }
      case 'payment_intent.succeeded':
      case 'payment_intent.canceled':
        return (await syncIntent(object, { source: 'webhook', eventId: event.id })) || {};
      case 'payment_intent.payment_failed':
        return (await repository.markPaymentFailed(object.id, declineMessage(object))) || {};
      case 'charge.refunded':
        if (!object.payment_intent) return {};
        return (await repository.applyChargeRefunded(String(object.payment_intent), Number(object.amount_refunded) || 0,
          (object.refunds && Array.isArray(object.refunds.data) ? object.refunds.data : []).map((refund) => ({
            id: refund.id, amountCents: refund.amount, status: refund.status, stripeReason: refund.reason || null,
          })))) || {};
      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed':
        if (!object.payment_intent) return {};
        return (await repository.applyDispute(String(object.payment_intent), {
          disputeId: object.id, status: object.status, amountCents: Number(object.amount) || 0, reason: object.reason || null,
          open: event.type !== 'charge.dispute.closed',
        })) || {};
      default:
        return {};
    }
  }

  /** Admin refund (full or partial) of a captured payment. Returns { status, body }. */
  async function refund({ bookingId, adminId, amountCents, reason, stripeReason }) {
    const payment = await repository.getBookingPayment(bookingId);
    if (!payment) return { status: 404, body: { error: 'This booking has no card payment.' } };
    const refundable = payment.amountCapturedCents - payment.refundedCents;
    if (!['captured', 'fee_captured', 'partially_refunded'].includes(payment.status) || refundable <= 0) {
      return { status: 409, body: { error: 'Nothing on this booking can be refunded (no charge, or already refunded).' } };
    }
    const amount = amountCents == null ? refundable : amountCents;
    if (amount > refundable) return { status: 400, body: { error: `At most ${(refundable / 100).toFixed(2)} can be refunded.`, field: 'amountCents' } };
    const created = await stripe.refunds.create({
      payment_intent: payment.intentId,
      amount,
      ...(stripeReason ? { reason: stripeReason } : {}),
      metadata: { bookingId, adminId },
    }, { idempotencyKey: `booking-${bookingId}-refund-${payment.refundedCents}-${amount}` });
    const updated = await repository.recordRefund(bookingId, {
      refundId: created.id, amountCents: created.amount, status: created.status, reason, stripeReason: stripeReason || null, adminId,
    });
    return { status: 201, body: { refund: { id: created.id, amountCents: created.amount, status: created.status }, payment: updated } };
  }

  return {
    configured, config, publicConfig, ensureCustomer, authorizeBooking, confirmAuthorization, applyAuthorized,
    settle, settleMany, settleOutstanding, syncIntent, handleEvent, refund, tick,
  };
}

/** Validate an admin refund request body. */
function cleanRefundRequest(body = {}) {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 3) return { ok: false, error: 'Write why this refund is being given (at least 3 characters).', field: 'reason' };
  if (reason.length > REFUND_NOTE_MAX) return { ok: false, error: `Keep the reason under ${REFUND_NOTE_MAX} characters.`, field: 'reason' };
  let amountCents = null;
  if (body.amountCents != null && body.amountCents !== '') {
    amountCents = Number(body.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) return { ok: false, error: 'Refund amount must be a whole number of cents above 0.', field: 'amountCents' };
  }
  const stripeReason = body.stripeReason == null || body.stripeReason === '' ? null : String(body.stripeReason);
  if (stripeReason && !REFUND_REASONS.includes(stripeReason)) return { ok: false, error: 'Unsupported refund category.', field: 'stripeReason' };
  return { ok: true, refund: { amountCents, reason, stripeReason } };
}

module.exports = {
  CURRENCY, DEFAULT_CANCELLATION_FEE_CENTS, DEFAULT_FEE_FROM_STATUSES, DEFAULT_PAYMENT_CONFIRM_MINUTES, CODES, OPEN_STATUSES, SETTLED_STATUSES,
  REFUND_REASONS, SETTLEMENT_ATTENTION_AFTER,
  paymentsConfigFromEnv, cancellationFeeFor, settlementFor, createPayments, cleanRefundRequest, toCents,
};
