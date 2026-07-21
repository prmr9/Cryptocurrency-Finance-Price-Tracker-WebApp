'use strict';

// ---------------------------------------------------------------------------
// Migration runner (KAN-11 / contract C5) -- node-pg-migrate against RDS
// PostgreSQL 16.
//
// Migrations are applied from an operator box through an SSH tunnel
// (DATABASE.md §5): we dial the LOCAL tunnel endpoint (PGHOST || 127.0.0.1)
// but pin the TLS servername to the REAL RDS host so certificate verification
// still checks the genuine endpoint against the pinned RDS CA bundle.
// Verification is never disabled (rejectUnauthorized:true).
//
// Credentials come from the runtime Secrets Manager fetch -- never from raw
// configuration.
// ---------------------------------------------------------------------------

const path = require('path');
const runner = require('node-pg-migrate');
const runMigrations = runner.default || runner;
const { fetchDbSecret } = require('./src/db/secrets');
const { getRdsCa } = require('./src/db/tls');

const MIGRATIONS_TABLE = 'pgmigrations';

async function migrate(direction = 'up') {
  const secret = await fetchDbSecret();
  const host = process.env.PGHOST || '127.0.0.1';
  const port = Number(process.env.PGPORT) || secret.port || 5432;

  await runMigrations({
    databaseUrl: {
      host,
      port,
      user: secret.username,
      password: secret.password,
      database: secret.dbname,
      ssl: {
        ca: getRdsCa(),
        rejectUnauthorized: true,
        // Dial the tunnel, but verify against the real RDS host.
        servername: secret.host,
      },
    },
    dir: path.join(__dirname, 'migrations'),
    // The migrations dir also holds a co-located *.test.js unit test; exclude
    // it from the runner's scan so it is never treated as a migration.
    ignorePattern: '.*\\.test\\.js',
    direction,
    migrationsTable: MIGRATIONS_TABLE,
    count: Infinity,
  });
}

if (require.main === module) {
  migrate(process.argv[2] === 'down' ? 'down' : 'up').then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}

module.exports = { migrate, MIGRATIONS_TABLE };
