/**
 * Regression guard for KAN-60 — post-merge CI fragility.
 *
 * Evidence: KAN-57 ("CI failed after merge"). Root cause: backend unit tests
 * were colocated in server/migrations/ as `<timestamp>_<name>.test.js`.
 * node-pg-migrate discovers migrations by scanning that directory and orders
 * them by the leading numeric timestamp, so these `.test.js` files match the
 * migration filename shape and get loaded as migrations. `migrate up` then
 * tries to run a Jest test file as a migration, which breaks CI — and because
 * it only surfaces once a merge adds or changes a migration, it shows up as
 * intermittent, hard-to-reproduce post-merge failures.
 *
 * Every other backend test lives in server/test/. The fix is to keep
 * server/migrations/ free of test files (move the three colocated tests into
 * server/test/). This guard fails while any `*.test.js` remains under
 * server/migrations/ and passes once the directory holds only migrations.
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'server', 'migrations');
const TEST_FILE = /\.test\.[cm]?js$/;

test('server/migrations must not contain colocated test files (KAN-60)', () => {
  const offenders = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => TEST_FILE.test(name))
    .sort();

  // node-pg-migrate would try to execute each of these as a migration.
  expect(offenders).toEqual([]);
});
