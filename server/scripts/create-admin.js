#!/usr/bin/env node
// Create an AID admin (reviewer) account. Run from the server folder:
//   node scripts/create-admin.js
// The password is typed hidden and never printed. Admin accounts cannot be
// created through the public sign-up flow.
const path = require('node:path');
const readline = require('node:readline');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const { databaseSslConfig } = require('../config');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (text) => { if (text.includes(question)) rl.output.write(text); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main() {
  for (const key of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'DATABASE_URL']) {
    if (!process.env[key]) throw new Error(`server/.env is missing ${key}`);
  }
  const email = (await ask('Admin email: ')).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That email address is not valid.');
  const firstName = await ask('First name: ');
  const lastName = await ask('Last name: ');
  const password = await ask('Password (min 12 characters, hidden): ', { hidden: true });
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
  if ((await ask('Repeat password (hidden): ', { hidden: true })) !== password) throw new Error('Passwords do not match.');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: databaseSslConfig(process.env), max: 1 });
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { role: 'customer', first_name: firstName, last_name: lastName },
    });
    if (error) throw new Error(`Could not create the account: ${error.message}`);
    const result = await pool.query(
      "update public.profiles set role='admin', first_name=$2, last_name=$3 where id=$1 and role='customer' returning id",
      [data.user.id, firstName, lastName],
    );
    if (!result.rowCount) {
      await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
      throw new Error('The account profile was not created as expected; nothing was kept.');
    }
    console.log(`\nAdmin account created for ${email}. Sign in to the AID admin panel with it.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
