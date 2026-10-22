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
    const review = await pool.query(`
      select
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='driver_profiles'
           and column_name = any(array['credentials_valid_until','review_notes','submitted_at','reviewed_at','reviewed_by'])) as profile_columns,
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='driver_documents'
           and column_name = any(array['expires_on','reviewed_by','reviewed_at'])) as document_columns,
        (select relrowsecurity from pg_class where oid = 'public.driver_verification_events'::regclass) as events_rls,
        has_table_privilege('authenticated', 'public.driver_verification_events', 'select') as events_readable,
        pg_get_constraintdef((select oid from pg_constraint where conname = 'driver_profiles_verification_status_check')) as status_check
    `);
    assert.equal(review.rows[0].profile_columns, 5, 'driver review columns must exist');
    assert.equal(review.rows[0].document_columns, 3, 'document expiration/review columns must exist');
    assert.equal(review.rows[0].events_rls, true, 'verification audit log must have RLS enabled');
    assert.equal(review.rows[0].events_readable, false, 'clients must not read the verification audit log directly');
    assert.match(review.rows[0].status_check, /suspended/);
    const grants = await pool.query(`
      select
        (select count(*)::int from information_schema.role_table_grants
           where table_schema='public' and grantee='anon') as anon_grants,
        (select count(*)::int from information_schema.role_table_grants
           where table_schema='public' and grantee='authenticated' and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')) as dangerous_grants,
        (select array_agg(column_name::text order by column_name) from information_schema.column_privileges
           where table_schema='public' and table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE') as profile_update_columns,
        exists(select 1 from pg_trigger where tgname='profiles_guard_privileged_columns') as guard_trigger
    `);
    assert.equal(grants.rows[0].anon_grants, 0, 'anonymous clients must have no table privileges');
    assert.equal(grants.rows[0].dangerous_grants, 0, 'signed-in clients must not hold TRUNCATE/TRIGGER/REFERENCES');
    assert.deepEqual(grants.rows[0].profile_update_columns, ['first_name', 'last_name', 'phone'], 'clients may only edit display fields');
    assert.equal(grants.rows[0].guard_trigger, true, 'privileged profile columns must be trigger-guarded');
    // E4: 'expired' status, expired_at, and one active booking per customer enforced by the database.
    const e4 = await pool.query(`
      select pg_get_constraintdef((select oid from pg_constraint where conname = 'bookings_status_check')) as status_check,
        exists(select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='expired_at') as expired_at,
        (select indexdef from pg_indexes where schemaname='public' and indexname='bookings_one_active_per_customer') as one_active,
        (select indexdef from pg_indexes where schemaname='public' and indexname='bookings_one_active_job_per_driver') as one_job
    `);
    assert.match(e4.rows[0].one_job || '', /UNIQUE INDEX .* \(driver_id\) WHERE .*'accepted'.*'in_progress'/, 'one job per driver must be a unique index');
    assert.match(e4.rows[0].status_check, /'expired'/);
    assert.equal(e4.rows[0].expired_at, true);
    assert.match(e4.rows[0].one_active || '', /UNIQUE INDEX .* \(customer_id\) WHERE .*'searching'.*'in_progress'/, 'one active booking per customer must be a unique index');
    // B15: ratings are API-only — RLS on, no client privileges; one per booking per rater; never yourself.
    const b15 = await pool.query(`
      select (select relrowsecurity from pg_class where oid = 'public.ratings'::regclass) as rls,
        has_table_privilege('authenticated', 'public.ratings', 'select') or has_table_privilege('authenticated', 'public.ratings', 'insert')
          or has_table_privilege('anon', 'public.ratings', 'select') as client_access,
        pg_get_constraintdef((select oid from pg_constraint where conname = 'ratings_one_per_rater')) as unique_rater,
        pg_get_constraintdef((select oid from pg_constraint where conname = 'ratings_not_self')) as not_self,
        pg_get_constraintdef((select oid from pg_constraint where conname = 'ratings_stars_check')) as stars,
        pg_get_constraintdef((select oid from pg_constraint where conname = 'ratings_comment_check')) as comment
    `);
    assert.equal(b15.rows[0].rls, true, 'ratings RLS must be enabled');
    assert.equal(b15.rows[0].client_access, false, 'clients must not read or write ratings directly');
    assert.match(b15.rows[0].unique_rater, /UNIQUE \(booking_id, rater_id\)/);
    assert.match(b15.rows[0].not_self, /rater_id <> ratee_id/);
    assert.match(b15.rows[0].stars, /stars >= 1.*stars <= 5/);
    assert.match(b15.rows[0].comment, /500/);
    // B18: support reports are API-only too; category list per role, message ≤ 2000, resolved ⇔ resolved_at.
    const b18 = await pool.query(`
      select (select relrowsecurity from pg_class where oid = 'public.support_reports'::regclass) as rls,
        (select relrowsecurity from pg_class where oid = 'public.support_report_events'::regclass) as events_rls,
        has_table_privilege('authenticated', 'public.support_reports', 'select') or has_table_privilege('authenticated', 'public.support_reports', 'insert')
          or has_table_privilege('anon', 'public.support_reports', 'select') or has_table_privilege('authenticated', 'public.support_report_events', 'select') as client_access,
        (select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('support_reports', 'support_report_events')) as policies,
        pg_get_constraintdef((select oid from pg_constraint where conname = 'support_reports_category_for_role')) as categories,
        pg_get_constraintdef((select oid from pg_constraint where conname = 'support_reports_message_check')) as message,
        pg_get_constraintdef((select oid from pg_constraint where conname = 'support_reports_status_check')) as status
    `);
    assert.equal(b18.rows[0].rls, true, 'support_reports RLS must be enabled');
    assert.equal(b18.rows[0].events_rls, true, 'support_report_events RLS must be enabled');
    assert.equal(b18.rows[0].client_access, false, 'clients must not read or write support reports directly');
    assert.equal(b18.rows[0].policies, 0, 'no client policies: the API is the only reader/writer');
    const { CATEGORIES } = require('../support');
    for (const category of [...Object.keys(CATEGORIES.customer), ...Object.keys(CATEGORIES.driver)]) assert.match(b18.rows[0].categories, new RegExp(`'${category}'`));
    assert.match(b18.rows[0].message, /2000/);
    assert.match(b18.rows[0].status, /'open'.*'in_review'.*'resolved'/);
    // B12: job chat and blocks are API-only too; body 1–1000 characters; no self-blocks.
    const b12 = await pool.query(`
      select (select relrowsecurity from pg_class where oid = 'public.job_messages'::regclass) as messages_rls,
        (select relrowsecurity from pg_class where oid = 'public.user_blocks'::regclass) as blocks_rls,
        has_table_privilege('authenticated', 'public.job_messages', 'select') or has_table_privilege('authenticated', 'public.job_messages', 'insert')
          or has_table_privilege('authenticated', 'public.job_messages', 'update') or has_table_privilege('anon', 'public.job_messages', 'select')
          or has_table_privilege('authenticated', 'public.user_blocks', 'select') or has_table_privilege('authenticated', 'public.user_blocks', 'insert')
          or has_table_privilege('authenticated', 'public.user_blocks', 'delete') as client_access,
        (select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('job_messages', 'user_blocks')) as policies,
        pg_get_constraintdef((select oid from pg_constraint where conname = 'job_messages_body_check')) as body,
        pg_get_constraintdef((select oid from pg_constraint where conname = 'user_blocks_not_self')) as not_self,
        (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'job_messages_booking_seq_idx') as cursor_index
    `);
    assert.equal(b12.rows[0].messages_rls, true, 'job_messages RLS must be enabled');
    assert.equal(b12.rows[0].blocks_rls, true, 'user_blocks RLS must be enabled');
    assert.equal(b12.rows[0].client_access, false, 'clients must not read or write chat messages or blocks directly');
    assert.equal(b12.rows[0].policies, 0);
    assert.match(b12.rows[0].body, /1000/);
    assert.match(b12.rows[0].not_self, /blocker_id <> blocked_id/);
    assert.match(b12.rows[0].cursor_index || '', /\(booking_id, seq\)/);
    assert.ok(hardenedPolicies.rowCount > 0);
    for (const policy of hardenedPolicies.rows) {
      assert.match(policy.expression, /is_active_account/i, `${policy.tablename}.${policy.policyname} must reject inactive accounts`);
    }
  } finally {
    await pool.end();
  }
});
