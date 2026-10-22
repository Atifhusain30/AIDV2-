// A stateful Stripe double with stripe-node's real method names and argument order:
//   customers.create(params, options)
//   paymentIntents.create(params, options) / retrieve(id) / capture(id, params, options) / cancel(id, params, options)
//   refunds.create(params, options)
//   webhooks.constructEvent(payload, header, secret)  ← the REAL stripe-node implementation (HMAC check)
// Like Stripe, a repeated idempotency key returns the first result without doing anything again.
// Test helpers (not Stripe API): authorize(id), requireAction(id), decline(id, message), failNext(method, error).
const Stripe = require('stripe');

const real = new Stripe('sk_test_signature_only_never_used_for_network');

function stripeError(code, message) {
  return Object.assign(new Error(message), { type: 'StripeInvalidRequestError', code });
}

function createStripeMock() {
  const calls = [];
  const intents = new Map();
  const idempotent = new Map();
  const failures = new Map();
  let seq = 0;
  const next = (prefix) => `${prefix}_mock_${++seq}`;

  function record(method, args, options, run) {
    calls.push({ method, args, options });
    const failure = failures.get(method);
    if (failure) { failures.delete(method); return Promise.reject(failure); }
    const key = options && options.idempotencyKey;
    if (key && idempotent.has(`${method}:${key}`)) return Promise.resolve(structuredClone(idempotent.get(`${method}:${key}`)));
    try {
      const result = run();
      if (key) idempotent.set(`${method}:${key}`, structuredClone(result));
      return Promise.resolve(structuredClone(result));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  const intent = (id) => {
    const found = intents.get(id);
    if (!found) throw stripeError('resource_missing', `No such payment_intent: '${id}'`);
    return found;
  };

  const mock = {
    calls,
    intents,
    callsTo: (method) => calls.filter((call) => call.method === method),
    customers: {
      create(params, options) {
        return record('customers.create', [params], options, () => ({ id: next('cus'), object: 'customer', email: params.email || null, metadata: params.metadata || {} }));
      },
    },
    paymentIntents: {
      create(params, options) {
        return record('paymentIntents.create', [params], options, () => {
          if (!Number.isInteger(params.amount) || params.amount < 50) throw stripeError('amount_too_small', 'Amount must be at least $0.50 usd');
          const id = next('pi');
          const created = {
            id, object: 'payment_intent', amount: params.amount, currency: params.currency, customer: params.customer || null,
            capture_method: params.capture_method || 'automatic', status: 'requires_payment_method', client_secret: `${id}_secret_mock`,
            amount_capturable: 0, amount_received: 0, metadata: params.metadata || {}, last_payment_error: null,
          };
          intents.set(id, created);
          return created;
        });
      },
      retrieve(id) {
        return record('paymentIntents.retrieve', [id], undefined, () => intent(id));
      },
      capture(id, params = {}, options) {
        return record('paymentIntents.capture', [id, params], options, () => {
          const current = intent(id);
          if (current.status !== 'requires_capture') throw stripeError('payment_intent_unexpected_state', `This PaymentIntent could not be captured because it has a status of ${current.status}.`);
          const amount = params.amount_to_capture == null ? current.amount_capturable : params.amount_to_capture;
          if (amount > current.amount_capturable) throw stripeError('amount_too_large', 'amount_to_capture is greater than the amount capturable');
          Object.assign(current, { status: 'succeeded', amount_received: amount, amount_capturable: 0 });
          return current;
        });
      },
      cancel(id, params = {}, options) {
        return record('paymentIntents.cancel', [id, params], options, () => {
          const current = intent(id);
          if (['succeeded', 'canceled'].includes(current.status)) {
            throw stripeError('payment_intent_unexpected_state', `You cannot cancel this PaymentIntent because it has a status of ${current.status}.`);
          }
          Object.assign(current, { status: 'canceled', amount_capturable: 0, cancellation_reason: params.cancellation_reason || null });
          return current;
        });
      },
    },
    refunds: {
      create(params, options) {
        return record('refunds.create', [params], options, () => {
          const current = intent(params.payment_intent);
          const amount = params.amount == null ? current.amount_received : params.amount;
          return { id: next('re'), object: 'refund', amount, status: 'succeeded', payment_intent: current.id, reason: params.reason || null };
        });
      },
    },
    webhooks: real.webhooks,

    // ---- test helpers (what the customer's bank/app would do) ----
    authorize(id) { Object.assign(intent(id), { status: 'requires_capture', amount_capturable: intent(id).amount, last_payment_error: null }); return structuredClone(intent(id)); },
    requireAction(id) { Object.assign(intent(id), { status: 'requires_action', next_action: { type: 'use_stripe_sdk' } }); },
    decline(id, message = 'Your card was declined.') { Object.assign(intent(id), { status: 'requires_payment_method', last_payment_error: { code: 'card_declined', message } }); },
    failNext(method, error = Object.assign(new Error('Network error talking to Stripe'), { type: 'StripeConnectionError' })) { failures.set(method, error); },
  };
  return mock;
}

/** A signed webhook request body + header, made with stripe-node's own test signer. */
function signedEvent(event, secret) {
  const payload = JSON.stringify(event);
  return { payload, header: real.webhooks.generateTestHeaderString({ payload, secret }) };
}

module.exports = { createStripeMock, signedEvent };
