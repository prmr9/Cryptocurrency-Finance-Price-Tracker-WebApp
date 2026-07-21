'use strict';

// Auth session revocation store (KAN-13 / contract C9).
//
// The session mechanism is a stateless JWT carried in a Secure/HttpOnly cookie
// (server/src/auth/session.js). Stateless tokens cannot be un-issued, so logout
// is implemented as REVOCATION: the token's `jti` (JWT id) is recorded here and
// rejected on every subsequent request. This table is the AUTHORITATIVE denylist
// -- it survives a process restart, so a revoked token is never resurrected by an
// in-memory cache miss. The in-memory cache in session.js is only a fast path in
// front of this table.
//
// Ordering: the numeric prefix 1720000000000 sorts AFTER every existing
// migration (the C5 bootstrap 1700000000000 and the KAN-12 domain schema
// 1710000000000), so this is a NEW migration on top of applied history -- it
// never reorders or backdates a migration that a database may already have run.
// There is deliberately NO foreign key from user_id to users(id): revoked_sessions
// is an operational runtime table, and adding an FK would couple this migration's
// apply order to KAN-12's users migration. user_id is stored as uuid to match
// users.id for correlation, but is not constrained.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('revoked_sessions', {
    // The token's JWT id (jwtid claim). Primary key -> one revocation row per
    // token, idempotent on repeated logout.
    jti: { type: 'text', primaryKey: true },
    // The owning user (users.id); correlation only, intentionally not an FK.
    user_id: { type: 'uuid', notNull: true },
    // The token's own expiry. Rows past this are safe to sweep -- an expired
    // token is already rejected by signature verification.
    expires_at: { type: 'timestamptz', notNull: true },
    // When the revocation (logout) happened.
    revoked_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Supports the periodic prune of already-expired revocations.
  pgm.createIndex('revoked_sessions', 'expires_at');
};

exports.down = (pgm) => {
  // The expires_at index drops automatically with the table.
  pgm.dropTable('revoked_sessions');
};
