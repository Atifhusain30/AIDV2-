const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

test('remote database has the AID marketplace schema', { timeout: 30000 }, async () => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    const result = await pool.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
    `, [['profiles', 'driver_profiles', 'driver_documents', 'vehicles', 'bookings', 'booking_events']]);
    const names = new Set(result.rows.map((row) => row.table_name));
    for (const expected of ['profiles', 'driver_profiles', 'driver_documents', 'vehicles', 'bookings', 'booking_events']) {
      assert.ok(names.has(expected), `missing table: ${expected}`);
    }
    const security = await pool.query(`
      select c.relrowsecurity,
             exists(select 1 from storage.buckets where id='driver-documents' and public=false and file_size_limit=10485760) as private_bucket
      from pg_class c where c.oid='public.driver_documents'::regclass
    `);
    assert.equal(security.rows[0].relrowsecurity, true, 'driver_documents RLS must be enabled');
    assert.equal(security.rows[0].private_bucket, true, 'private driver-documents bucket must exist');
    const dispatchPolicy = await pool.query(`
      select qual from pg_policies
      where schemaname='public' and tablename='bookings' and policyname='bookings_driver_select'
    `);
    assert.equal(dispatchPolicy.rowCount, 1, 'driver booking policy must exist');
    assert.match(dispatchPolicy.rows[0].qual, /driver_id\s*=\s*auth\.uid\(\)/i);
    assert.doesNotMatch(dispatchPolicy.rows[0].qual, /searching/i, 'unassigned booking rows must not be directly readable');
    const hardenedPolicies = await pool.query(`
      select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expression
      from pg_policies
      where schemaname='public' and tablename=any($1::text[])
    `, [['profiles', 'driver_profiles', 'driver_documents', 'vehicles', 'bookings', 'booking_events']]);
    assert.ok(hardenedPolicies.rowCount > 0);
    for (const policy of hardenedPolicies.rows) {
      assert.match(policy.expression, /is_active_account/i, `${policy.tablename}.${policy.policyname} must reject inactive accounts`);
    }
  } finally {
    await pool.end();
  }
});
