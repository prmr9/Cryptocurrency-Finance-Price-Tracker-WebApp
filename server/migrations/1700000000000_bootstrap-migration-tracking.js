'use strict';

// Baseline migration (KAN-11 / contract C5).
//
// This establishes the node-pg-migrate harness for every environment. The
// migration-tracking table `pgmigrations` is created and managed automatically
// by the runner; recording this baseline in it is what gives us
// skip-already-applied idempotency on re-runs.
//
// Deliberately extension-free and free of any superuser-only op: this slice
// adds NO domain tables. KAN-12 owns users/portfolios (and introduces pgcrypto
// as its own migration). Keeping the baseline as a documented no-op means no
// privileged operation is required here.

exports.shorthands = undefined;

exports.up = (/* pgm */) => {
  // Intentionally empty: baseline marker only. Domain schema arrives in KAN-12.
};

exports.down = (/* pgm */) => {
  // Nothing to undo for the baseline marker.
};
