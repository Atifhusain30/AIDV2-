function databaseSslConfig(env = process.env) {
  if (env.DATABASE_SSL === 'false') return false;
  const ca = env.DATABASE_CA ? env.DATABASE_CA.replace(/\\n/g, '\n') : undefined;
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

module.exports = { databaseSslConfig };
