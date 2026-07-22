'use strict';

// ---------------------------------------------------------------------------
// /portfolios endpoints (KAN-15 / contracts C14, C15). Mounted at /portfolios
// by app.js, behind requireSession -- every handler below is reached only for
// an authenticated request.
// ---------------------------------------------------------------------------

const express = require('express');

const {
  getPortfoliosByUserId,
  getPortfolioByUserAndName,
  upsertPortfolioWithVersion,
} = require('../db/portfolios');
const { validatePortfolioName, validateHoldings, ValidationError } = require('../validation/holdings');

const router = express.Router();

// C14 -- list the authenticated user's portfolios. Scoped strictly by the
// session's user id (req.user.id, set by requireSession); never by a
// client-supplied id from req.query / req.params / req.body.
router.get('/', async (req, res) => {
  try {
    const portfolios = await getPortfoliosByUserId(req.user.id);
    return res.status(200).json({ portfolios });
  } catch (err) {
    console.error('[portfolios] get failed:', err && err.message);
    return res.status(500).json({ error: 'failed to load portfolios' });
  }
});

// C15 -- upsert one named portfolio's holdings for the authenticated user.
// name must be in the server-side allowlist; holdings must pass shape/size
// validation; a stale `version` (optimistic concurrency) yields a 409 rather
// than silently clobbering a concurrent write.
router.put('/', async (req, res) => {
  const body = req.body || {};

  try {
    validatePortfolioName(body.name);
    validateHoldings(body.holdings);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }

  const expectedVersion = Number.isInteger(body.version) ? body.version : 0;

  try {
    const { rows, rowCount } = await upsertPortfolioWithVersion(
      req.user.id,
      body.name,
      body.holdings,
      expectedVersion
    );

    if (rowCount === 0) {
      const current = await getPortfolioByUserAndName(req.user.id, body.name);
      return res.status(409).json({
        error: 'version_conflict',
        currentVersion: current ? current.version : null,
      });
    }

    return res.status(200).json(rows[0]);
  } catch (err) {
    console.error('[portfolios] put failed:', err && err.message);
    return res.status(500).json({ error: 'failed to save portfolio' });
  }
});

module.exports = { router };
