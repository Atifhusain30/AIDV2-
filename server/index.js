require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const Stripe = require('stripe');
const { randomUUID } = require('crypto');
const { createApp } = require('./app');
const { PostgresRepository } = require('./repository');
const { databaseSslConfig } = require('./config');

const required = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'DATABASE_URL'];
const missing = required.filter((name) => !process.env[name] || /replace|placeholder|your_/i.test(process.env[name]));
if (missing.length) {
  console.error(`Missing required server configuration: ${missing.join(', ')}`);
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
const repository = new PostgresRepository(pool);
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey && /^sk_(test|live)_/.test(stripeKey) ? new Stripe(stripeKey) : null;
const auth = {
  async getUser(accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    return error ? null : data.user;
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
  documentStorage,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  corsOrigin: process.env.CORS_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173,capacitor://localhost,http://localhost',
});
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => {
  console.log(`AID API listening on http://${host}:${port}`);
  console.log(`Postgres: connected pool configured | Stripe: ${stripe ? 'configured' : 'not configured'}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
