require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const Stripe = require('stripe');
const { randomUUID } = require('crypto');
const { createApp } = require('./app');
const { PostgresRepository } = require('./repository');
const { databaseSslConfig } = require('./config');
const { expiryConfigFromEnv } = require('./lifecycle');
const { startExpirySweep } = require('./expiry');
const { createLogger, securityConfigFromEnv } = require('./security');
const { rateLimitsFromEnv } = require('./rateLimit');
const { serializeError } = require('./redact');
const { createRealtimeHub, realtimeConfigFromEnv, notifyEnded } = require('./realtime');
const { radiusFromEnv } = require('./nearby');
const { accessTokenClaims } = require('./mfa');

// E8: one JSON line per event on stdout, already redacted (see redact.js). LOG_LEVEL: debug|info|warn|error|silent.
const logger = createLogger({ level: process.env.LOG_LEVEL || 'info' });
const security = securityConfigFromEnv(process.env);
const rateLimits = rateLimitsFromEnv(process.env);

const required = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'DATABASE_URL'];
const missing = required.filter((name) => !process.env[name] || /replace|placeholder|your_/i.test(process.env[name]));
if (missing.length) {
  logger.error({ msg: `Missing required server configuration: ${missing.join(', ')}` });
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: databaseSslConfig(process.env),
  max: Number(process.env.DATABASE_POOL_SIZE || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
// E4: how long an unaccepted request stays open, when a silent driver's job is released, sweep cadence.
const expiryConfig = expiryConfigFromEnv(process.env);
const repository = new PostgresRepository(pool, expiryConfig);
const stripeKey = process.env.STRIPE_SECRET_KEY;
// Network retries are safe: every Stripe write carries an idempotency key (payments.js).
const stripe = stripeKey && /^sk_(test|live)_/.test(stripeKey) ? new Stripe(stripeKey, { maxNetworkRetries: 2, timeout: 20000 }) : null;
const auth = {
  async getUser(accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) return null;
    // E5: Supabase accepted this token above, so its aal claim ('aal1' | 'aal2') can be trusted.
    return { ...data.user, aal: accessTokenClaims(accessToken).aal || 'aal1' };
  },
};
const accountAdmin = {
  async deleteUser(userId) {
    // Clear rows that would block the auth.users -> profiles cascade before deleting the identity.
    const { storagePaths } = await repository.prepareAccountDeletion(userId);
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
    if (storagePaths.length) {
      const { error: storageError } = await supabase.storage.from('driver-documents').remove(storagePaths);
      if (storageError) logger.error({ msg: 'account deleted but driver document cleanup failed', userId, error: serializeError(storageError) });
    }
  },
};
const documentStorage = {
  async upload(driverId, file, documentType) {
    const extension = (file.originalname.split('.').pop() || 'file').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'file';
    const path = `${driverId}/${documentType}/${randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('driver-documents').upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (error) throw error;
    return path;
  },
  async signedUrl(path) {
    const { data, error } = await supabase.storage.from('driver-documents').createSignedUrl(path, 900);
    if (error) throw error;
    return data.signedUrl;
  },
  async remove(path) {
    const { error } = await supabase.storage.from('driver-documents').remove([path]);
    if (error) throw error;
  },
};

// B11: one realtime hub shared by the API routes and the expiry sweep (in-memory, single instance).
const realtimeConfig = realtimeConfigFromEnv(process.env);
const realtime = createRealtimeHub({ ...realtimeConfig, radiusMiles: radiusFromEnv(process.env), logger });
const app = createApp({
  realtime,
  realtimeEnabled: realtimeConfig.enabled,
  auth,
  repository,
  stripe,
  accountAdmin,
  documentStorage,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  corsOrigin: security.corsOrigin,
  trustProxy: security.trustProxy,
  hsts: security.hsts,
  jsonBodyLimit: security.jsonBodyLimit,
  documentMaxBytes: security.documentMaxBytes,
  rateLimits,
  logger,
});
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => {
  logger.info({ msg: `AID API listening on http://${host}:${port}` });
  logger.info({ msg: `Postgres pool configured | Stripe: ${stripe ? 'configured' : 'not configured'}` });
  const pay = app.locals.payments.publicConfig();
  logger.info({
    msg: 'payments', status: pay.status, mode: pay.mode, unpaidDevRequests: pay.unpaidRequestsAllowed,
    cancellationFeeCents: pay.cancellationFee.cents, feeFrom: pay.cancellationFee.appliesFrom, webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
  });
  logger.info({ msg: `Requests expire after ${expiryConfig.requestExpiryMinutes} min without a driver; silent jobs are released after ${expiryConfig.staleJobMinutes} min; sweep every ${expiryConfig.sweepSeconds} s` });
  logger.info({
    msg: 'security', corsOrigins: security.corsOrigin, trustProxy: security.trustProxy, hsts: security.hsts.enabled,
    rateLimits: rateLimits.enabled ? 'on (in-memory, single instance)' : 'OFF', jsonBodyLimit: security.jsonBodyLimit, documentMaxBytes: security.documentMaxBytes,
  });
  logger.info({
    msg: 'realtime', enabled: realtimeConfig.enabled, transport: 'SSE, in-memory bus (single instance)',
    maxConnectionsPerUser: realtimeConfig.maxConnectionsPerUser, maxStreamMinutes: realtimeConfig.maxStreamMs / 60000, heartbeatSeconds: realtimeConfig.heartbeatMs / 1000,
  });
});
const payments = app.locals.payments;
const expirySweep = startExpirySweep({
  repository,
  onExpired: (result) => notifyEnded(realtime, repository, result),
  // C2: release holds of expired/released jobs, end requests whose card was never confirmed, retry open settlements.
  onTick: async (result) => {
    if (!payments.configured) return;
    await payments.settleMany([...(result.expired || []), ...(result.released || [])]);
    const { ended } = await payments.tick();
    if (ended.length) await notifyEnded(realtime, repository, { expired: [], released: ended });
  },
  intervalMs: expiryConfig.sweepSeconds * 1000,
  logger: { log: (line) => logger.info({ msg: line }), error: (...parts) => logger.error({ msg: parts.map(String).join(' ') }) },
});
void expirySweep.tick();

async function shutdown(signal) {
  logger.info({ msg: `${signal} received; shutting down.` });
  expirySweep.stop();
  realtime.closeAll(); // open event streams would otherwise keep server.close() waiting
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('unhandledRejection', (error) => logger.error({ msg: 'unhandled rejection', error: serializeError(error) }));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
