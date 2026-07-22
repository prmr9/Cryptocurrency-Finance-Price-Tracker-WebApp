'use strict';

// ---------------------------------------------------------------------------
// /me endpoints (KAN-15 / contract C16). Mounted at /me by app.js, behind
// requireSession.
//
// POST /import ingests detected localStorage watchlist/portfolio data (the
// SPA's pre-KAN-15 client state) into the user's DB rows with NO DATA LOSS:
// each of 'default' and 'watchlist' is merged (mergeHoldings), never replaced
// outright, against whatever is already persisted for that user+name. A name
// with no incoming holdings is left untouched (no write at all) so an empty
// or absent import payload can never erase existing server-side data.
// ---------------------------------------------------------------------------

const express = require('express');

const { mergeHoldings } = require('../domain/holdings');
const { validateHoldings, ValidationError, ALLOWED_PORTFOLIO_NAMES } = require('../validation/holdings');
const { getPortfolioByUserAndName, upsertPortfolioWithVersion } = require('../db/portfolios');

const router = express.Router();

router.post('/import', async (req, res) => {
  const body = req.body || {};

  try {
    for (const name of ALLOWED_PORTFOLIO_NAMES) {
      if (Object.prototype.hasOwnProperty.call(body, name)) {
        validateHoldings(body[name]);
      }
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }

  const imported = {};

  try {
    for (const name of ALLOWED_PORTFOLIO_NAMES) {
      const incoming = Array.isArray(body[name]) ? body[name] : [];
      const existingRow = await getPortfolioByUserAndName(req.user.id, name);
      const existingHoldings = existingRow ? existingRow.holdings : [];

      const merged = mergeHoldings(existingHoldings, incoming);
      imported[name] = merged;

      // Nothing to import for this name: skip the write entirely so an
      // empty/absent import payload never overwrites existing server data.
      if (incoming.length === 0) {
        continue;
      }

      const expectedVersion = existingRow ? existingRow.version : 0;
      await upsertPortfolioWithVersion(req.user.id, name, merged, expectedVersion);
    }

    return res.status(200).json({ imported });
  } catch (err) {
    console.error('[me] import failed:', err && err.message);
    return res.status(500).json({ error: 'import failed' });
  }
});

module.exports = { router };
