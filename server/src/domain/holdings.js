'use strict';

// ---------------------------------------------------------------------------
// Holdings merge logic (KAN-15 / contracts C15, C16).
//
// Pure, DB-independent so it is unit-testable on its own. Used by both
// PUT /portfolios (merging a single name's stored row forward) and
// POST /me/import (merging detected localStorage data into 'default' and
// 'watchlist' without discarding either side).
// ---------------------------------------------------------------------------

/**
 * Union two holdings arrays by `symbol`: entries in `incoming` overwrite a
 * matching `existing` entry (same symbol); entries in `existing` with no
 * match in `incoming` are preserved untouched. An empty/missing `incoming`
 * returns `existing` unchanged -- no data loss.
 *
 * @param {Array<{symbol: string}>} existing
 * @param {Array<{symbol: string}>} incoming
 * @returns {Array<{symbol: string}>}
 */
function mergeHoldings(existing, incoming) {
  const existingArr = Array.isArray(existing) ? existing : [];
  const incomingArr = Array.isArray(incoming) ? incoming : [];

  if (incomingArr.length === 0) {
    return existingArr.slice();
  }

  const bySymbol = new Map();
  for (const entry of existingArr) {
    if (entry && typeof entry.symbol === 'string') {
      bySymbol.set(entry.symbol, entry);
    }
  }
  for (const entry of incomingArr) {
    if (entry && typeof entry.symbol === 'string') {
      bySymbol.set(entry.symbol, entry);
    }
  }

  return Array.from(bySymbol.values());
}

module.exports = { mergeHoldings };
