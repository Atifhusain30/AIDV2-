/**
 * C4: paying drivers through Stripe Connect.
 *
 *   • Each driver gets a Stripe payout account (Accounts v2, Express dashboard, "recipient": AID sends
 *     money, the driver receives it). Stripe collects their identity, tax (1099) and bank details on its
 *     own hosted pages — AID never stores bank numbers or SSNs.
 *   • When a job is charged, payments.js marks the driver's share (DRIVER_PAYOUT_PERCENT) as a pending
 *     payout. processPending() sends it as a Stripe transfer tied to that charge, once the driver's
 *     account can receive transfers. Until then it simply waits — drivers never lose earnings for
 *     finishing setup late. Idempotent per booking; retried by the background sweep.
 *   • Stripe then pays the driver's bank on its standard schedule.
 */

const STRIPE_V2_VERSION = '2026-10-28.endive';

/** Minimal Stripe API v2 client (stripe-node 14 predates v2). Errors carry Stripe's code and message. */
function createStripeV2(secretKey, { fetchImpl = fetch, version = STRIPE_V2_VERSION } = {}) {
  return async function stripeV2(path, { method = 'GET', body, idempotencyKey } = {}) {
    const headers = { Authorization: `Bearer ${secretKey}`, 'Stripe-Version': version, 'Content-Type': 'application/json' };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const response = await fetchImpl(`https://api.stripe.com${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error((json.error && json.error.message) || `Stripe v2 request failed (${response.status})`);
      error.type = 'StripeV2Error';
      error.code = json.error && json.error.code;
      error.statusCode = response.status;
      throw error;
    }
    return json;
  };
}

function transfersActive(account) {
  const capability = account && account.configuration && account.configuration.recipient
    && account.configuration.recipient.capabilities && account.configuration.recipient.capabilities.stripe_balance
    && account.configuration.recipient.capabilities.stripe_balance.stripe_transfers;
  return Boolean(capability && capability.status === 'active');
}

function createPayouts({ stripe, stripeV2, repository, publicUrl = 'http://127.0.0.1:3001', logger = { warn() {}, info() {} }, config }) {
  // Transfers need only the regular API; creating and checking driver accounts needs API v2.
  const enabled = Boolean(stripe);
  const canOnboard = Boolean(stripe && stripeV2);

  async function accountIdFor(identity, profile, { create }) {
    const existing = await repository.getDriverStripeAccount(identity.id);
    if (existing.accountId || !create) return existing.accountId || null;
    const name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    const account = await stripeV2('/v2/core/accounts', {
      method: 'POST', idempotencyKey: `aid-driver-account-${identity.id}`,
      body: {
        contact_email: identity.email || undefined,
        display_name: name || undefined,
        identity: { country: 'US', entity_type: 'individual' },
        dashboard: 'express',
        defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
        metadata: { aidUserId: identity.id },
      },
    });
    return repository.setDriverStripeAccount(identity.id, account.id);
  }

  /** Stripe's hosted page where the driver adds identity, tax and bank details. */
  async function onboardingLink(identity, profile) {
    const account = await accountIdFor(identity, profile, { create: true });
    const link = await stripeV2('/v2/core/account_links', {
      method: 'POST',
      body: {
        account,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            return_url: `${publicUrl}/payouts/done`,
            refresh_url: `${publicUrl}/payouts/refresh`,
          },
        },
      },
    });
    return { url: link.url };
  }

  /** Ask Stripe whether this driver can receive transfers yet, and remember the answer. */
  async function refreshStatus(driverId) {
    const { accountId, ready } = await repository.getDriverStripeAccount(driverId);
    if (!accountId) return { hasAccount: false, ready: false };
    if (!canOnboard) return { hasAccount: true, ready };
    try {
      const account = await stripeV2(`/v2/core/accounts/${accountId}?include=configuration.recipient&include=requirements`);
      const nowReady = transfersActive(account);
      if (nowReady !== ready) await repository.setPayoutsReady(driverId, nowReady);
      return { hasAccount: true, ready: nowReady };
    } catch (error) {
      logger.warn({ msg: 'payout account status check failed', error: error && error.message });
      return { hasAccount: true, ready };
    }
  }

  /** Send every waiting driver share whose driver can receive transfers. Never throws. */
  async function processPending() {
    if (!enabled) return [];
    let rows;
    try {
      rows = await repository.listPendingPayouts();
    } catch (error) {
      logger.warn({ msg: 'payout lookup failed', error: error && error.message });
      return [];
    }
    const sent = [];
    for (const row of rows) {
      if (!row.stripeAccountId || !row.payoutsReady || !row.amountCents) continue;
      try {
        const transfer = await stripe.transfers.create({
          amount: row.amountCents, currency: 'usd', destination: row.stripeAccountId,
          ...(row.chargeId ? { source_transaction: row.chargeId } : {}),
          transfer_group: `booking_${row.bookingId}`, description: 'AID job payout',
          metadata: { bookingId: row.bookingId, driverId: row.driverId },
        }, { idempotencyKey: `aid-payout-${row.bookingId}` });
        await repository.recordPayout(row.bookingId, { status: 'paid', transferId: transfer.id });
        sent.push({ bookingId: row.bookingId, amountCents: row.amountCents });
      } catch (error) {
        if (error && error.code === 'insufficient_capabilities_for_transfer') {
          await repository.setPayoutsReady(row.driverId, false).catch(() => {});
        }
        logger.warn({ msg: 'driver payout failed; will retry', bookingId: row.bookingId, error: error && error.message });
      }
    }
    return sent;
  }

  /** What the driver sees: setup state, the split, totals and recent jobs. */
  async function summary(driverId) {
    const status = enabled ? await refreshStatus(driverId) : { hasAccount: false, ready: false };
    const earnings = await repository.listDriverEarnings(driverId);
    return {
      enabled: canOnboard, hasAccount: status.hasAccount, ready: status.ready,
      payoutPercent: config ? config.driverPayoutPercent : null,
      ...earnings,
    };
  }

  return { enabled, canOnboard, onboardingLink, refreshStatus, processPending, summary };
}

module.exports = { createPayouts, createStripeV2, transfersActive, STRIPE_V2_VERSION };
