/**
 * Regression test for KAN-5: [Metrics] Instrument the change from KAN-4.
 *
 * The KAN-4 wallet-account onboarding flow shipped with NO analytics
 * instrumentation: the approved 8-event plan was not emitted anywhere in the
 * source and docs/analytics-events.md did not exist.
 *
 * These assertions are source-level on purpose. The instrumentation is a
 * cross-cutting contract (which events exist, which properties they carry, and
 * that they are documented) rather than the behaviour of a single unit, and it
 * must hold no matter which module ends up owning the emit helper.
 *
 * Two assertions here originally encoded the ticket's first-draft design and
 * were rewritten against the approved implementation plan: address_length was
 * replaced by the address_format shape enum, and the emit ownership moved from
 * accountStore.js to the component layer (see 'persistence/telemetry boundary').
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const ACCOUNT_STORE = path.join(SRC_DIR, 'services', 'accountStore.js');
const ACCOUNTS_VIEW = path.join(SRC_DIR, 'components', 'Accounts.js');
const ANALYTICS_DOC = path.join(REPO_ROOT, 'docs', 'analytics-events.md');

/** The human-approved event plan from the KAN-5 ticket. */
const APPROVED_EVENTS = [
  {
    name: 'accounts_view_opened',
    properties: ['entry_source', 'existing_account_count', 'is_first_visit'],
  },
  {
    // address_format supersedes the ticket's original address_length: a raw
    // length is address-derived and, at a near-constant 42 for EVM, carries no
    // signal worth the exposure. See docs/analytics-events.md.
    name: 'add_account_submitted',
    properties: ['label_provided', 'address_format', 'existing_account_count'],
  },
  {
    name: 'add_account_validation_failed',
    properties: ['error_code', 'error_message', 'field', 'attempt_number'],
  },
  {
    name: 'account_added',
    properties: [
      'account_id',
      'account_count_after',
      'is_first_account',
      'attempts_before_success',
      'time_to_add_ms',
    ],
  },
  {
    name: 'account_activated',
    properties: [
      'account_id',
      'account_count',
      'was_auto_selected',
      'previous_active_account_id',
    ],
  },
  {
    name: 'trade_link_clicked',
    properties: ['source', 'account_id', 'destination_url', 'account_count'],
  },
  {
    name: 'accounts_returned',
    properties: [
      'account_count',
      'active_account_id',
      'days_since_first_account',
      'sessions_since_first_account',
    ],
  },
  {
    name: 'account_removed',
    properties: [
      'account_id',
      'account_count_after',
      'was_active',
      'account_age_days',
    ],
  },
];

function collectSourceFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      found.push(...collectSourceFiles(full));
    } else if (/\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

let sourceBlob = '';
beforeAll(() => {
  sourceBlob = collectSourceFiles(SRC_DIR)
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
});

describe('KAN-5 analytics instrumentation', () => {
  describe('emitted events', () => {
    it.each(APPROVED_EVENTS.map((e) => [e.name]))(
      'emits a tracking call for "%s" somewhere in src/',
      (eventName) => {
        // Matches track("event") / track('event') / track(`event`), with or
        // without a namespace prefix (analytics.track, trackEvent, etc.).
        const emitted = new RegExp(
          `track\\w*\\(\\s*['"\`]${eventName}['"\`]`
        ).test(sourceBlob);

        expect(emitted).toBe(true);
      }
    );

    it.each(
      APPROVED_EVENTS.flatMap((e) =>
        e.properties.map((prop) => [e.name, prop])
      )
    )('passes the approved "%s" property %s', (eventName, prop) => {
      // The property must appear as an object key in source, e.g. `account_id:`
      // or a shorthand/spread-free key inside the payload object.
      expect(sourceBlob).toMatch(new RegExp(`\\b${prop}\\b\\s*:`));
    });
  });

  // The approved implementation plan inverts the emit ownership these
  // assertions originally encoded. Telemetry is a one-way dependency: the
  // components own the store and pass already-loaded data into track(), so
  // accountStore.js stays a pure persistence module and analytics.js never
  // imports it. The commit-boundary requirement still holds — account_added and
  // account_removed are emitted from inside the resolved store promise — it is
  // just the component layer, not the store, that owns the call.
  describe('persistence/telemetry boundary', () => {
    let storeSource = '';
    let accountsSource = '';

    beforeAll(() => {
      expect(fs.existsSync(ACCOUNT_STORE)).toBe(true);
      storeSource = fs.readFileSync(ACCOUNT_STORE, 'utf8');
      accountsSource = fs.readFileSync(ACCOUNTS_VIEW, 'utf8');
    });

    it('keeps accountStore.js free of telemetry', () => {
      expect(storeSource).not.toMatch(/track\w*\s*\(/);
      expect(storeSource).not.toMatch(/analytics/i);
    });

    it('keeps analytics.js from importing the store, so there is no cycle', () => {
      const analyticsSource = fs.readFileSync(
        path.join(SRC_DIR, 'services', 'analytics.js'),
        'utf8'
      );

      // Match real module resolution only — the file's header prose names
      // accountStore.js precisely to document that it must never import it.
      expect(analyticsSource).not.toMatch(
        /(?:^|\n)\s*import[\s\S]*?from\s*['"][^'"]*accountStore/
      );
      expect(analyticsSource).not.toMatch(/require\(\s*['"][^'"]*accountStore/);
    });

    it('emits account_added from the view once the persistence commit resolves', () => {
      expect(accountsSource).toMatch(/track\w*\(\s*['"`]account_added['"`]/);
      // The emit sits inside addAccount(...).then(...), never before it.
      expect(accountsSource).toMatch(
        /addAccount\([\s\S]*?\.then\([\s\S]*?track\(\s*['"`]account_added['"`]/
      );
    });

    it('emits account_removed from the view once the deletion commits', () => {
      expect(accountsSource).toMatch(/track\w*\(\s*['"`]account_removed['"`]/);
      expect(accountsSource).toMatch(
        /removeAccount\([\s\S]*?\.then\([\s\S]*?track\(\s*['"`]account_removed['"`]/
      );
    });
  });

  describe('docs/analytics-events.md', () => {
    let doc = '';

    beforeAll(() => {
      expect(fs.existsSync(ANALYTICS_DOC)).toBe(true);
      doc = fs.readFileSync(ANALYTICS_DOC, 'utf8');
    });

    it.each(APPROVED_EVENTS.map((e) => [e.name]))(
      'documents the "%s" event',
      (eventName) => {
        expect(doc).toContain(eventName);
      }
    );

    it.each(
      APPROVED_EVENTS.flatMap((e) =>
        e.properties.map((prop) => [e.name, prop])
      )
    )('documents the %s property "%s"', (eventName, prop) => {
      expect(doc).toContain(prop);
    });

    it('records the loop coverage for the approved plan', () => {
      expect(doc).toMatch(/activation/i);
      expect(doc).toMatch(/retention/i);
      expect(doc).toMatch(/revenue/i);
      expect(doc).toMatch(/engagement/i);
    });
  });
});
