'use strict';

// Domain schema migration (KAN-12 / contracts C6, C7, C8).
//
// First application data model in the repo, layered on the C5 baseline
// (1700000000000_bootstrap-migration-tracking.js). The numeric prefix
// 1710000000000 sorts AFTER that baseline so node-pg-migrate applies this
// second. Establishes the users / user_profiles / portfolios relational core.
//
// Deliberate design decisions (see the KAN-12 plan):
//   * Email uniqueness is CASE-INSENSITIVE, enforced by a functional UNIQUE
//     index on lower(email) -- NOT `citext` (which needs a createExtension
//     call, a hard-banned op: see server/test/tls-and-config.test.js).
//     Signup/login in KAN-14 must normalise (lowercase + trim) email on every
//     write and lookup.
//   * `user_profiles` is a true 1:1 table: `user_id` is BOTH the primary key
//     (one profile per user) AND the FK to users -- the PK doubles as the
//     FK/cascade index, so no separate index is needed.
//   * `id` columns use `gen_random_uuid()`, which is PostgreSQL 16 core -- no
//     pgcrypto / createExtension required.
//   * Ownership FKs use ON DELETE CASCADE so deleting a user removes their
//     profile and portfolios.
//
// Password hashing / auth endpoints are OUT OF SCOPE (KAN-14): this migration
// only defines the `password_hash` column and never touches plaintext.

exports.shorthands = undefined;

exports.up = (pgm) => {
  // C6 -- users: identity table. Only a bcrypt/argon2 hash is ever stored in
  // password_hash (enforced by the app layer; the column is just text here).
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true },
    password_hash: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Case-insensitive uniqueness on email via a functional UNIQUE index on
  // lower(email). Intentionally NOT a plain UNIQUE(email) constraint (which is
  // case-SENSITIVE) and NOT citext (needs a banned createExtension).
  pgm.sql('CREATE UNIQUE INDEX users_email_lower_uk ON "users" (lower(email));');

  // C7 -- user_profiles: 1:1 with users. user_id is the PK and the FK.
  pgm.createTable('user_profiles', {
    user_id: {
      type: 'uuid',
      primaryKey: true,
      // References the users primary key (users.id); ON DELETE CASCADE.
      references: '"users"',
      onDelete: 'CASCADE',
    },
    display_name: { type: 'text' },
    avatar_url: { type: 'text' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // C8 -- portfolios: each user owns 0..N portfolios; holdings persisted as
  // queryable jsonb.
  pgm.createTable('portfolios', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: {
      type: 'uuid',
      notNull: true,
      // References the users primary key (users.id); ON DELETE CASCADE.
      references: '"users"',
      onDelete: 'CASCADE',
    },
    name: { type: 'text', notNull: true },
    holdings: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Non-unique index on the ownership FK for "portfolios of a user" lookups.
  pgm.createIndex('portfolios', 'user_id');
};

exports.down = (pgm) => {
  // Drop in reverse dependency order. The functional lower(email) index and the
  // portfolios user_id index drop automatically with their tables.
  pgm.dropTable('portfolios');
  pgm.dropTable('user_profiles');
  pgm.dropTable('users');
};
