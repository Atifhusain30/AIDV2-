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
 * Cancellation fees and driver payouts are not here yet (C3/C4: need the owner's policy and pay split).
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

function createPayments({ stripe, repository, logger = { warn() {}, info() {} } }) {
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

  /**
   * Charge or release every hold whose job has ended (all of them when `bookingIds` is null).
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
      const capture = row.status === 'completed';
      try {
        const intent = capture
          ? await stripe.paymentIntents.capture(row.intentId, {}, { idempotencyKey: `aid-capture-${row.intentId}` })
          : await stripe.paymentIntents.cancel(row.intentId, {}, { idempotencyKey: `aid-release-${row.intentId}` });
        const status = paymentStatusOf(intent);
        await repository.updatePaymentStatus(row.intentId, status);
        settled.push({ bookingId: row.bookingId, status });
      } catch (error) {
        // Already settled elsewhere (dashboard, a retry) or the hold lapsed: record what Stripe says is true.
        try {
          const intent = await stripe.paymentIntents.retrieve(row.intentId);
          const status = paymentStatusOf(intent);
          if (status !== 'authorized') {
            await repository.updatePaymentStatus(row.intentId, status);
            settled.push({ bookingId: row.bookingId, status });
            continue;
          }
        } catch (_lookupError) { /* logged below */ }
        logger.warn({ msg: capture ? 'payment capture failed; will retry' : 'payment release failed; will retry', bookingId: row.bookingId, error: error && error.message });
      }
    }
    return settled;
  }

  return { enabled, startCardSetup, listCards, removeCard, hold, release, settle };
}

module.exports = { createPayments, PaymentError, paymentStatusOf, TERMINAL_FOR_PAYMENT };
