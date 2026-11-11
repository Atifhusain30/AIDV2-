/**
 * C2: card payments the way ride-hail apps do it.
 *
 *   1. The customer saves a card once (Stripe SetupIntent, collected by Stripe's own form — card numbers
 *      never touch AID's servers). One Stripe Customer per AID account, id kept on profiles.
 *   2. Requesting help places a HOLD for the server-computed price on that card (PaymentIntent with
 *      capture_method 'manual'). No hold → no request: drivers never drive to an unpaid job.
 *   3. When the job ends the hold is settled: completed → captured (charged); cancelled/expired → released.
 *      settle() is idempotent and retried by the background sweep, so a Stripe hiccup never loses money
 *      or leaves a hold on a customer's card.
 *
 * C3: a customer who cancels after the free window (default 5 minutes after a driver accepts) pays the
 * cancellation fee (default $10, never more than the job): only that part of the hold is captured.
 * Refunds (admin) and disputes (webhook) are recorded on the booking; payouts.js sends the driver's share.
 * Amounts are configurable (paymentConfigFromEnv); drivers and customers are told the same numbers.
 */

class PaymentError extends Error {
  constructor(message, code, status = 402) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.status = status;
  }
}

const TERMINAL_FOR_PAYMENT = Object.freeze(['completed', 'cancelled', 'expired']);
// Statuses in which a customer's cancellation can carry the fee (a driver is assigned and on the way).
const FEE_STATUSES = Object.freeze(['accepted', 'en_route']);

const DEFAULT_PAYMENT_CONFIG = Object.freeze({ cancellationFeeCents: 1000, freeCancelMinutes: 5, driverPayoutPercent: 80 });
function numberFromEnv(value, fallback, min, max) {
  const number = Number(value);
  return value != null && value !== '' && Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}
/** CANCELLATION_FEE (dollars, 0–50), CANCELLATION_FREE_MINUTES (0–60), DRIVER_PAYOUT_PERCENT (50–95). */
function paymentConfigFromEnv(env = process.env) {
  return {
    cancellationFeeCents: Math.round(numberFromEnv(env.CANCELLATION_FEE, DEFAULT_PAYMENT_CONFIG.cancellationFeeCents / 100, 0, 50) * 100),
    freeCancelMinutes: numberFromEnv(env.CANCELLATION_FREE_MINUTES, DEFAULT_PAYMENT_CONFIG.freeCancelMinutes, 0, 60),
    driverPayoutPercent: numberFromEnv(env.DRIVER_PAYOUT_PERCENT, DEFAULT_PAYMENT_CONFIG.driverPayoutPercent, 50, 95),
  };
}

/** The fee (cents) a customer pays for cancelling `booking` at `nowMs`: 0 inside the free window. */
function cancellationFeeCents(booking, nowMs, config = DEFAULT_PAYMENT_CONFIG) {
  if (!booking || !FEE_STATUSES.includes(booking.status) || !booking.acceptedAt || !config.cancellationFeeCents) return 0;
  const acceptedMs = new Date(booking.acceptedAt).getTime();
  if (!Number.isFinite(acceptedMs) || nowMs - acceptedMs < config.freeCancelMinutes * 60000) return 0;
  return Math.min(config.cancellationFeeCents, Math.round(Number(booking.estimatedPrice || 0) * 100));
}

/** When the free window ends (ISO), or null when no fee can apply. */
function freeCancelUntil(booking, config = DEFAULT_PAYMENT_CONFIG) {
  if (!booking || !FEE_STATUSES.includes(booking.status) || !booking.acceptedAt || !config.cancellationFeeCents) return null;
  const acceptedMs = new Date(booking.acceptedAt).getTime();
  return Number.isFinite(acceptedMs) ? new Date(acceptedMs + config.freeCancelMinutes * 60000).toISOString() : null;
}

const driverShareCents = (capturedCents, config) => Math.floor((capturedCents * config.driverPayoutPercent) / 100);

/** Stripe PaymentIntent status → bookings.payment_status. */
function paymentStatusOf(intent) {
  switch (intent && intent.status) {
    case 'requires_capture': return 'authorized';
    case 'succeeded': return 'succeeded';
    case 'canceled': return 'canceled';
    case 'processing': return 'processing';
    case 'requires_payment_method': return 'failed';
    default: return 'pending';
  }
}

const PAYMENT_METHOD_ID = /^pm_[A-Za-z0-9_]{1,200}$/;
const REQUEST_KEY = /^[A-Za-z0-9-]{8,64}$/;

/** A plain-language reason a card could not be held. Non-card errors are re-thrown (500, logged). */
function declineError(error) {
  if (error && error.type === 'StripeCardError') {
    if (error.code === 'authentication_required') {
      return new PaymentError('Your bank needs to confirm this card. Remove it, add it again, then request help.', 'card_authentication_required');
    }
    if (error.code === 'expired_card') return new PaymentError('This card has expired. Add another card to request help.', 'card_expired');
    if (error.decline_code === 'insufficient_funds') return new PaymentError('Your card was declined for insufficient funds. Try another card.', 'card_declined');
    return new PaymentError('Your card was declined. Try another card.', 'card_declined');
  }
  return error;
}

function cardOf(paymentMethod) {
  const card = paymentMethod.card || {};
  return {
    id: paymentMethod.id,
    brand: card.brand || 'card',
    last4: card.last4 || '',
    expMonth: card.exp_month || null,
    expYear: card.exp_year || null,
  };
}

function createPayments({ stripe, repository, logger = { warn() {}, info() {} }, config = DEFAULT_PAYMENT_CONFIG }) {
  const enabled = Boolean(stripe);

  async function customerIdFor(identity, profile, { create }) {
    const existing = await repository.getStripeCustomerId(identity.id);
    if (existing || !create) return existing || null;
    const name = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : '';
    const customer = await stripe.customers.create({
      email: identity.email || undefined,
      name: name || undefined,
      metadata: { aidUserId: identity.id },
    }, { idempotencyKey: `aid-customer-${identity.id}` });
    // Two racing first-card setups: whichever id was stored first wins.
    return repository.setStripeCustomerId(identity.id, customer.id);
  }

  /** The card, only when it belongs to this customer (an id from someone else's account is "not found"). */
  async function ownedCard(identity, paymentMethodId) {
    if (typeof paymentMethodId !== 'string' || !PAYMENT_METHOD_ID.test(paymentMethodId)) return null;
    const customer = await customerIdFor(identity, null, { create: false });
    if (!customer) return null;
    let paymentMethod;
    try {
      paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch (error) {
      if (error && error.type === 'StripeInvalidRequestError') return null;
      throw error;
    }
    return paymentMethod && paymentMethod.customer === customer ? { customer, paymentMethod } : null;
  }

  async function startCardSetup(identity, profile) {
    const customer = await customerIdFor(identity, profile, { create: true });
    const setupIntent = await stripe.setupIntents.create({
      customer, usage: 'off_session', payment_method_types: ['card'], metadata: { aidUserId: identity.id },
    });
    return { clientSecret: setupIntent.client_secret };
  }

  async function listCards(identity) {
    const customer = await customerIdFor(identity, null, { create: false });
    if (!customer) return [];
    const list = await stripe.paymentMethods.list({ customer, type: 'card', limit: 10 });
    return list.data.map(cardOf);
  }

  async function removeCard(identity, paymentMethodId) {
    const owned = await ownedCard(identity, paymentMethodId);
    if (!owned) return false;
    await stripe.paymentMethods.detach(paymentMethodId);
    return true;
  }

  async function release(intentId) {
    try {
      await stripe.paymentIntents.cancel(intentId, {}, { idempotencyKey: `aid-release-${intentId}` });
    } catch (error) {
      logger.warn({ msg: 'payment hold release failed (the sweep retries settled bookings)', intentId, error: error && error.message });
    }
  }

  /**
   * Hold `amountCents` on the customer's saved card. `requestKey` (one per Request tap, from the app)
   * makes a retried tap reuse the same hold instead of placing a second one.
   */
  async function hold({ identity, paymentMethodId, amountCents, requestKey, description, metadata }) {
    const owned = await ownedCard(identity, paymentMethodId);
    if (!owned) throw new PaymentError('Add a card to request help.', 'payment_method_required');
    const key = typeof requestKey === 'string' && REQUEST_KEY.test(requestKey) ? requestKey : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let intent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: amountCents, currency: 'usd', customer: owned.customer, payment_method: paymentMethodId,
        payment_method_types: ['card'], capture_method: 'manual', confirm: true, off_session: true,
        // Stripe emails the receipt when the charge is captured (live mode).
        ...(identity.email ? { receipt_email: identity.email } : {}),
        description, metadata: { ...metadata, customerId: identity.id },
      }, { idempotencyKey: `aid-hold-${identity.id}-${key}` });
    } catch (error) {
      throw declineError(error);
    }
    if (intent.status !== 'requires_capture') {
      await release(intent.id);
      throw new PaymentError('Your card could not be authorized. Try again or use another card.', 'card_not_authorized');
    }
    const card = cardOf(owned.paymentMethod);
    return { intentId: intent.id, status: 'authorized', brand: card.brand, last4: card.last4 };
  }

  /** Save a captured charge: amount, charge id and (when a driver did the work) their share to pay out. */
  async function recordCaptured(row, intent) {
    const capturedCents = intent.amount_received ?? intent.amount ?? 0;
    const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id || null;
    await repository.recordCapture(row.intentId, {
      capturedCents, chargeId, payoutCents: row.driverId && capturedCents > 0 ? driverShareCents(capturedCents, config) : 0,
    });
  }

  /**
   * Charge or release every hold whose job has ended (all of them when `bookingIds` is null):
   * completed → capture all; cancelled with a fee → capture just the fee; otherwise release.
   * Never throws: failures are logged and the next sweep tries again.
   */
  async function settle(bookingIds = null) {
    if (!enabled) return [];
    let rows;
    try {
      rows = await repository.listUnsettledPayments(bookingIds && bookingIds.length ? bookingIds : null);
    } catch (error) {
      logger.warn({ msg: 'payment settlement lookup failed', error: error && error.message });
      return [];
    }
    const settled = [];
    for (const row of rows) {
      const fee = row.status === 'cancelled' ? Number(row.cancellationFeeCents || 0) : 0;
      const capture = row.status === 'completed' || fee > 0;
      try {
        const intent = capture
          ? await stripe.paymentIntents.capture(row.intentId, fee > 0 ? { amount_to_capture: fee } : {}, { idempotencyKey: `aid-capture-${row.intentId}` })
          : await stripe.paymentIntents.cancel(row.intentId, {}, { idempotencyKey: `aid-release-${row.intentId}` });
        const status = paymentStatusOf(intent);
        if (status === 'succeeded') await recordCaptured(row, intent);
        else await repository.updatePaymentStatus(row.intentId, status);
        settled.push({ bookingId: row.bookingId, status });
      } catch (error) {
        // Already settled elsewhere (dashboard, a retry) or the hold lapsed: record what Stripe says is true.
        try {
          const intent = await stripe.paymentIntents.retrieve(row.intentId);
          const status = paymentStatusOf(intent);
          if (status !== 'authorized') {
            if (status === 'succeeded') await recordCaptured(row, intent);
            else await repository.updatePaymentStatus(row.intentId, status);
            settled.push({ bookingId: row.bookingId, status });
            continue;
          }
        } catch (_lookupError) { /* logged below */ }
        logger.warn({ msg: capture ? 'payment capture failed; will retry' : 'payment release failed; will retry', bookingId: row.bookingId, error: error && error.message });
      }
    }
    return settled;
  }

  /**
   * C3: refund part or all of a charged job (admin). The driver's share shrinks in proportion:
   * a payout still waiting is reduced; one already sent is partly reversed from the driver's account.
   */
  async function refund(bookingId, amountCents = null) {
    const charge = await repository.getChargeDetails(bookingId);
    if (!charge || !charge.intentId || !['succeeded', 'disputed'].includes(charge.paymentStatus) || !charge.capturedCents) {
      throw new PaymentError('This job has no charge to refund.', 'nothing_to_refund', 409);
    }
    const refundable = charge.capturedCents - charge.refundedCents;
    const amount = amountCents == null ? refundable : Math.round(amountCents);
    if (!Number.isInteger(amount) || amount <= 0 || amount > refundable) {
      throw new PaymentError(`Refund between $0.01 and $${(refundable / 100).toFixed(2)}.`, 'invalid_refund_amount', 400);
    }
    const created = await stripe.refunds.create({
      payment_intent: charge.intentId, amount, reason: 'requested_by_customer', metadata: { bookingId },
    }, { idempotencyKey: `aid-refund-${bookingId}-${charge.refundedCents}-${amount}` });
    const full = charge.refundedCents + amount >= charge.capturedCents;
    // The driver gives back the same fraction of their share.
    const payoutBack = charge.payoutAmountCents ? Math.min(charge.payoutAmountCents, Math.round((charge.payoutAmountCents * amount) / charge.capturedCents)) : 0;
    let reversed = 0;
    if (payoutBack > 0 && charge.payoutStatus === 'paid' && charge.payoutTransferId) {
      try {
        await stripe.transfers.createReversal(charge.payoutTransferId, { amount: payoutBack, metadata: { bookingId } },
          { idempotencyKey: `aid-reversal-${bookingId}-${charge.refundedCents}-${amount}` });
        reversed = payoutBack;
      } catch (error) {
        logger.warn({ msg: 'payout reversal failed; review in Stripe', bookingId, error: error && error.message });
      }
    }
    const updated = await repository.recordRefund(bookingId, {
      amountCents: amount, full,
      payoutReductionCents: charge.payoutStatus === 'pending' ? payoutBack : reversed,
    });
    return { refundId: created.id, amountCents: amount, full, payoutReversedCents: reversed, booking: updated };
  }

  /** Account deletion: remove the Stripe customer and its saved cards (best effort). */
  async function forgetCustomer(identity) {
    if (!enabled) return;
    try {
      const customer = await repository.getStripeCustomerId(identity.id);
      if (customer) await stripe.customers.del(customer);
    } catch (error) {
      logger.warn({ msg: 'Stripe customer deletion failed', error: error && error.message });
    }
  }

  const policy = () => ({
    cancellationFee: config.cancellationFeeCents / 100, freeCancelMinutes: config.freeCancelMinutes,
  });

  return {
    enabled, config, policy, startCardSetup, listCards, removeCard, hold, release, settle, refund, forgetCustomer,
    cancellationFeeCents: (booking, nowMs) => cancellationFeeCents(booking, nowMs, config),
    freeCancelUntil: (booking) => freeCancelUntil(booking, config),
  };
}

module.exports = {
  createPayments, PaymentError, paymentStatusOf, paymentConfigFromEnv, cancellationFeeCents, freeCancelUntil, driverShareCents,
  DEFAULT_PAYMENT_CONFIG, TERMINAL_FOR_PAYMENT,
};
