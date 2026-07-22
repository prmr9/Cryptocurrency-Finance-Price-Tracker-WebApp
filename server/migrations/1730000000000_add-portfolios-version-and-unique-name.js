'use strict';

// Optimistic-concurrency + upsert-by-name migration (KAN-15 / contracts C14,
// C15, C16), layered on the KAN-12 `portfolios` table.
//
// The numeric prefix 1730000000000 sorts AFTER every existing migration (the
// C5 bootstrap 1700000000000, the KAN-12 domain schema 1710000000000, and the
// KAN-13 auth-sessions migration 1720000000000), so this is a NEW migration on
// top of applied history -- it never reorders or backdates a migration a
// database may already have run.
//
// Both changes are additive / non-breaking:
//   (1) `version` integer column, defaulted to 1 for every existing row --
//       backs the optimistic-concurrency check in
//       server/src/db/portfolios.js's upsertPortfolioWithVersion.
//   (2) a UNIQUE index on (user_id, name) -- makes "upsert this user's named
//       portfolio" (ON CONFLICT (user_id, name)) well-defined. Since the
//       KAN-12 migration never constrained (user_id, name), pre-existing data
//       could already contain duplicate groups; those MUST be merged (not
//       simply deleted, which would silently drop holdings) before the unique
//       index can be added, or the CREATE UNIQUE INDEX itself would fail on
//       any such duplicate. The dedupe step:
//         (a) unions each duplicate group's holdings jsonb arrays by `symbol`
//             (the most-recently-updated row in the group wins on a symbol
//             collision) into the row with the max updated_at;
//         (b) deletes the other rows in the group.
//
// No GIN index, no new extensions -- consistent with KAN-12's stated pattern.

exports.shorthands = undefined;

exports.up = (pgm) => {
  // (1) Optimistic-concurrency version column.
  pgm.addColumn('portfolios', {
    version: { type: 'integer', notNull: true, default: 1 },
  });

  // (2a) Dedupe pre-existing (user_id, name) collisions: merge each group's
  // holdings (union by `symbol`, most-recently-updated row wins on collision)
  // into the row with the max updated_at.
  pgm.sql(`
    WITH ranked AS (
      SELECT id, user_id, name, holdings, updated_at,
             ROW_NUMBER() OVER (PARTITION BY user_id, name ORDER BY updated_at DESC, id DESC) AS rn
      FROM portfolios
    ),
    dup_groups AS (
      SELECT user_id, name FROM portfolios GROUP BY user_id, name HAVING COUNT(*) > 1
    ),
    merged AS (
      SELECT g.user_id, g.name,
        (
          SELECT jsonb_agg(entry.value ORDER BY entry.rn)
          FROM (
            SELECT DISTINCT ON (elem ->> 'symbol') elem AS value, r.rn AS rn
            FROM ranked r
            CROSS JOIN LATERAL jsonb_array_elements(r.holdings) AS elem
            WHERE r.user_id = g.user_id AND r.name = g.name
            ORDER BY elem ->> 'symbol', r.rn ASC
          ) entry
        ) AS merged_holdings
      FROM dup_groups g
    )
    UPDATE portfolios p
    SET holdings = COALESCE(m.merged_holdings, '[]'::jsonb)
    FROM ranked r, merged m
    WHERE p.id = r.id AND r.rn = 1 AND m.user_id = r.user_id AND m.name = r.name;
  `);

  // (2b) Delete the now-redundant rows in each duplicate group.
  pgm.sql(`
    DELETE FROM portfolios p
    USING (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, name ORDER BY updated_at DESC, id DESC) AS rn
      FROM portfolios
    ) r
    WHERE p.id = r.id AND r.rn > 1;
  `);

  // (2c) Now safe: make upsert-by-name well-defined.
  pgm.createIndex('portfolios', ['user_id', 'name'], {
    unique: true,
    name: 'portfolios_user_id_name_idx',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('portfolios', ['user_id', 'name'], { name: 'portfolios_user_id_name_idx' });
  pgm.dropColumn('portfolios', 'version');
};
