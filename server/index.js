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
const stripe = stripeKey && /^sk_(test|live)_/.test(stripeKey) ? new Stripe(stripeKey) : null;
const auth = {
  async getUser(accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    return error ? null : data.user;
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

const app = createApp({
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
  logger.info({ msg: `Requests expire after ${expiryConfig.requestExpiryMinutes} min without a driver; silent jobs are released after ${expiryConfig.staleJobMinutes} min; sweep every ${expiryConfig.sweepSeconds} s` });
  logger.info({
    msg: 'security', corsOrigins: security.corsOrigin, trustProxy: security.trustProxy, hsts: security.hsts.enabled,
    rateLimits: rateLimits.enabled ? 'on (in-memory, single instance)' : 'OFF', jsonBodyLimit: security.jsonBodyLimit, documentMaxBytes: security.documentMaxBytes,
  });
});
const expirySweep = startExpirySweep({
  repository,
  intervalMs: expiryConfig.sweepSeconds * 1000,
  logger: { log: (line) => logger.info({ msg: line }), error: (...parts) => logger.error({ msg: parts.map(String).join(' ') }) },
});
void expirySweep.tick();

async function shutdown(signal) {
  logger.info({ msg: `${signal} received; shutting down.` });
  expirySweep.stop();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('unhandledRejection', (error) => logger.error({ msg: 'unhandled rejection', error: serializeError(error) }));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
