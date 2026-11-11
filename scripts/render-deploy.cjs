#!/usr/bin/env node
/**
 * H1: create/update the AID API on Render and connect Stripe's webhook to it — no secrets on screen.
 *
 *   node scripts/render-deploy.cjs            # create the service if needed, sync settings, deploy, verify
 *   node scripts/render-deploy.cjs --status   # just show the service URL and the latest deploy
 *
 * The Render API key is read from the macOS Keychain (item "aid-render-api", saved by
 * "~/Desktop/Set AID Render Key.command"). Secret values come from server/.env and go straight
 * to Render's API; this script prints only key NAMES, never values.
 */
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const dotenv = require(path.join(ROOT, 'server/node_modules/dotenv'));
const fs = require('node:fs');

const SERVICE = {
  name: 'aid-api',
  repo: 'https://github.com/Atifhusain30/AIDV2-',
  branch: 'auth-foundation',
  rootDir: 'server',
  region: 'oregon', // same AWS region as the Supabase database (us-west-2)
  plan: 'starter',  // always on: the free plan sleeps and would stop the expiry/payment sweeps
};
// Must match render.yaml.
const FIXED_ENV = {
  NODE_VERSION: '22',
  HOST: '0.0.0.0',
  TRUST_PROXY: '1',
  HSTS_ENABLED: 'true',
  LOG_LEVEL: 'info',
  CORS_ORIGIN: 'capacitor://localhost,ionic://localhost,https://localhost,http://localhost',
};
const SECRET_KEYS = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'DATABASE_URL', 'DATABASE_CA', 'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'SUPPORT_EMAIL', 'SUPPORT_PHONE'];
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'DATABASE_URL', 'STRIPE_SECRET_KEY'];
const WEBHOOK_EVENTS = [
  'payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.processing',
  'payment_intent.amount_capturable_updated', 'payment_intent.canceled',
  'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed',
];

const say = (msg) => console.log(msg);
const fail = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function renderKey() {
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'aid-render-api', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fail('No Render API key saved yet. Double-click "Set AID Render Key" on your Desktop first.');
  }
}

async function render(method, route, body) {
  const response = await fetch(`https://api.render.com/v1${route}`, {
    method,
    headers: { authorization: `Bearer ${KEY}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!response.ok) {
    const message = (data && data.message) || text || response.statusText;
    if (response.status === 401) fail('Render rejected the API key. Make a new one (Account Settings → API Keys) and save it again.');
    const error = new Error(`Render ${method} ${route} → ${response.status}: ${message}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function stripe(method, route, form, secret) {
  const response = await fetch(`https://api.stripe.com/v1${route}`, {
    method,
    headers: { authorization: `Bearer ${secret}`, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Stripe ${route}: ${data.error && data.error.message}`);
  return data;
}

const KEY = renderKey();

async function findService() {
  const list = await render('GET', `/services?name=${SERVICE.name}&limit=20`);
  const match = list.map((row) => row.service).find((service) => service.name === SERVICE.name);
  return match || null;
}

async function latestDeploy(serviceId) {
  const [row] = await render('GET', `/services/${serviceId}/deploys?limit=1`);
  return row ? row.deploy : null;
}

async function main() {
  const local = dotenv.parse(fs.readFileSync(path.join(ROOT, 'server/.env')));
  const missing = REQUIRED.filter((key) => !local[key]);
  if (missing.length) fail(`server/.env is missing: ${missing.join(', ')}`);
  if (/^sk_live_/.test(local.STRIPE_SECRET_KEY)) say('⚠ server/.env has a LIVE Stripe key — this server will charge real cards.');

  let service = await findService();
  if (process.argv.includes('--status')) {
    if (!service) return say('No aid-api service on Render yet.');
    const deploy = await latestDeploy(service.id);
    say(`Service: ${service.serviceDetails.url}\nLatest deploy: ${deploy ? `${deploy.status} (${deploy.finishedAt || deploy.createdAt})` : 'none'}`);
    return;
  }

  const env = { ...FIXED_ENV };
  for (const key of SECRET_KEYS) if (local[key]) env[key] = local[key];

  if (!service) {
    const owners = await render('GET', '/owners?limit=20');
    if (!owners.length) fail('This Render account has no workspace.');
    const ownerId = owners[0].owner.id;
    say(`Creating the "${SERVICE.name}" service on Render (${SERVICE.region}, ${SERVICE.plan} plan)…`);
    try {
      const created = await render('POST', '/services', {
        type: 'web_service', name: SERVICE.name, ownerId, repo: SERVICE.repo, branch: SERVICE.branch, rootDir: SERVICE.rootDir,
        autoDeploy: 'yes',
        envVars: Object.entries(env).map(([key, value]) => ({ key, value })),
        serviceDetails: {
          runtime: 'node', region: SERVICE.region, plan: SERVICE.plan, numInstances: 1, healthCheckPath: '/health',
          envSpecificDetails: { buildCommand: 'npm ci --omit=dev', startCommand: 'node index.js' },
        },
      });
      service = created.service || created;
    } catch (error) {
      if (/repo|github|access|permission/i.test(error.message)) {
        fail(`Render can't see the GitHub repository yet. In Render: Account Settings → Git → GitHub → Configure, and allow "AIDV2-".\n(${error.message})`);
      }
      if (/payment|billing|card/i.test(error.message)) fail(`Render needs a payment card for the Starter plan ($7/month). Add one under Billing, then run again.\n(${error.message})`);
      throw error;
    }
  } else {
    say(`Found the "${SERVICE.name}" service.`);
  }

  const url = service.serviceDetails.url;
  if (!url) fail('Render did not report the service URL.');
  env.PUBLIC_API_URL = url;

  // Stripe webhook → this server. A signing secret can only be read when the endpoint is created, so an
  // existing endpoint for this URL is replaced unless Render already holds its secret.
  const webhookUrl = `${url}/api/webhooks/stripe`;
  const currentVars = (await render('GET', `/services/${service.id}/env-vars?limit=100`)).map((row) => row.envVar);
  const existingSecret = currentVars.find((v) => v.key === 'STRIPE_WEBHOOK_SECRET' && v.value);
  const endpoints = (await stripe('GET', '/webhook_endpoints?limit=100', null, local.STRIPE_SECRET_KEY)).data.filter((e) => e.url === webhookUrl);
  if (existingSecret && endpoints.length === 1) {
    env.STRIPE_WEBHOOK_SECRET = existingSecret.value;
    await stripe('POST', `/webhook_endpoints/${endpoints[0].id}`, Object.fromEntries(WEBHOOK_EVENTS.map((e, i) => [`enabled_events[${i}]`, e])), local.STRIPE_SECRET_KEY);
    say('Stripe webhook already connected (events refreshed).');
  } else {
    for (const endpoint of endpoints) await stripe('DELETE', `/webhook_endpoints/${endpoint.id}`, null, local.STRIPE_SECRET_KEY);
    const form = { url: webhookUrl, description: 'AID API (Render)' };
    WEBHOOK_EVENTS.forEach((event, i) => { form[`enabled_events[${i}]`] = event; });
    const endpoint = await stripe('POST', '/webhook_endpoints', form, local.STRIPE_SECRET_KEY);
    env.STRIPE_WEBHOOK_SECRET = endpoint.secret;
    say(`Stripe webhook connected (${endpoint.livemode ? 'LIVE' : 'test'} mode).`);
  }

  // Replace the whole set so Render matches render.yaml + server/.env exactly.
  await render('PUT', `/services/${service.id}/env-vars`, Object.entries(env).map(([key, value]) => ({ key, value })));
  say(`Settings synced: ${Object.keys(env).sort().join(', ')}`);

  const before = await latestDeploy(service.id);
  await render('POST', `/services/${service.id}/deploys`, { clearCache: 'do_not_clear' });
  say('Deploying (usually 2–4 minutes)…');
  let deploy = null;
  for (let i = 0; i < 90; i += 1) {
    await sleep(10000);
    deploy = await latestDeploy(service.id);
    if (!deploy || (before && deploy.id === before.id && !['created', 'build_in_progress', 'update_in_progress'].includes(before.status))) continue;
    if (['live'].includes(deploy.status)) break;
    if (/failed|canceled|deactivated/.test(deploy.status)) fail(`Deploy ${deploy.status}. Open Render → aid-api → Events/Logs to see why.`);
    process.stdout.write('.');
  }
  if (!deploy || deploy.status !== 'live') fail('Deploy did not finish in 15 minutes. Check Render → aid-api → Events.');

  const health = await fetch(`${url}/health`).then((r) => r.json()).catch(() => null);
  if (!health || health.status !== 'ok') fail(`Deployed, but ${url}/health did not answer ok.`);
  say(`\n✓ AID API is online: ${url}`);
  say(`  Health check: ok · Stripe webhook: ${webhookUrl}`);
}

main().catch((error) => fail(error.message));
