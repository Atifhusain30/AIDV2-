// Payment settings for tests (never read from the environment, so a developer's .env can't change results).
const { paymentsConfigFromEnv } = require('../../payments');

/** Stripe not configured, dev unpaid requests allowed — the setting most non-payment tests run with. */
const DEV_UNPAID = Object.freeze({ ...paymentsConfigFromEnv({ DEV_ALLOW_UNPAID_REQUESTS: 'true' }) });
/** Stripe configured (tests pass a mock client), default fee policy ($15 from en_route). */
const PAYMENTS_ON = Object.freeze({ ...paymentsConfigFromEnv({ STRIPE_SECRET_KEY: 'sk_test_mock' }) });
/** Stripe not configured, unpaid requests NOT allowed (the default). */
const NOT_CONFIGURED = Object.freeze({ ...paymentsConfigFromEnv({}) });

module.exports = { DEV_UNPAID, PAYMENTS_ON, NOT_CONFIGURED };
