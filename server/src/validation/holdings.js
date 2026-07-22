'use strict';

// ---------------------------------------------------------------------------
// Input validation for portfolio names and holdings payloads (KAN-15 /
// contracts C14-C16). Thrown ValidationErrors are mapped to 400 responses by
// the routes in ../routes/portfolios.js and ../routes/me.js -- never reaching
// a DB write with a malformed or unauthorized-name payload.
// ---------------------------------------------------------------------------

class ValidationError extends Error {}

// Server-side allowlist: a portfolio row's `name` is never an arbitrary,
// client-supplied string. Watchlist data (per the KAN-15 clarification) is
// stored as its own named row using the same `holdings` jsonb shape.
const ALLOWED_PORTFOLIO_NAMES = ['default', 'watchlist'];

const MAX_HOLDINGS_ENTRIES = 500;
const MAX_SYMBOL_LENGTH = 10;
const MAX_PAYLOAD_BYTES = 65536;

function validatePortfolioName(name) {
  if (!ALLOWED_PORTFOLIO_NAMES.includes(name)) {
    throw new ValidationError(`name must be one of: ${ALLOWED_PORTFOLIO_NAMES.join(', ')}`);
  }
}

/**
 * Throws a ValidationError unless `payload` is an array of at most
 * MAX_HOLDINGS_ENTRIES objects, each shaped as
 * { symbol: non-empty string <= MAX_SYMBOL_LENGTH chars, shares: finite number >= 0 },
 * and whose JSON-serialized size is within MAX_PAYLOAD_BYTES.
 */
function validateHoldings(payload) {
  if (!Array.isArray(payload)) {
    throw new ValidationError('holdings must be an array');
  }
  if (payload.length > MAX_HOLDINGS_ENTRIES) {
    throw new ValidationError(`holdings must contain at most ${MAX_HOLDINGS_ENTRIES} entries`);
  }

  for (const entry of payload) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ValidationError('each holding must be an object');
    }
    if (typeof entry.symbol !== 'string' || entry.symbol.length === 0 || entry.symbol.length > MAX_SYMBOL_LENGTH) {
      throw new ValidationError(`holding.symbol must be a non-empty string of at most ${MAX_SYMBOL_LENGTH} characters`);
    }
    if (typeof entry.shares !== 'number' || !Number.isFinite(entry.shares) || entry.shares < 0) {
      throw new ValidationError('holding.shares must be a finite number >= 0');
    }
  }

  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES) {
    throw new ValidationError(`holdings payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  }
}

module.exports = {
  ValidationError,
  ALLOWED_PORTFOLIO_NAMES,
  validatePortfolioName,
  validateHoldings,
};
