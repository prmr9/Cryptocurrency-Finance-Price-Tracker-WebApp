'use strict';

// ---------------------------------------------------------------------------
// JWT signing-key provenance (KAN-13 / contract C9).
//
// getJwtSecret() returns the HMAC signing key used to sign and verify session
// tokens. It follows the SAME runtime-fetch discipline as the DB credential
// (server/src/db/secrets.js): the key is NEVER hardcoded and there is NO
// committed/default fallback that could be used to forge sessions.
//
// Provenance, in order:
//   * JWT_SECRET_NAME set -> fetch from AWS Secrets Manager via the attached IAM
//     role (memoized, same pattern as fetchDbSecret);
//   * else JWT_SECRET read from the environment.
//
// The resolved key is VALIDATED on every call: it must be a non-empty string of
// at least 32 characters, otherwise getJwtSecret throws. index.js awaits this at
// boot and refuses to listen() if it throws, so the process never signs with an
// undefined or too-weak key.
// ---------------------------------------------------------------------------

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require('@aws-sdk/client-secrets-manager');

// Minimum key length. 32 chars ~= 256 bits of key material for HS256.
const MIN_SECRET_LENGTH = 32;

// Memoize ONLY the Secrets Manager fetch (network). The env path is re-read on
// every call so configuration changes/tests take effect without a stale cache.
let cachedManagedSecret = null;

async function fetchManagedSecret(name) {
  if (cachedManagedSecret) return cachedManagedSecret;
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error('AWS_REGION is required to fetch the JWT secret');
  }
  const client = new SecretsManagerClient({ region });
  const response = await client.send(new GetSecretValueCommand({ SecretId: name }));
  const raw = response.SecretString;
  // The secret may be a bare string or a JSON blob carrying the key under a
  // conventional field. Never invent a value if none is present.
  let value = raw;
  try {
    const parsed = JSON.parse(raw);
    value = parsed.jwtSecret || parsed.secret || parsed.JWT_SECRET || raw;
  } catch (_e) {
    // Not JSON -> treat SecretString as the raw key.
  }
  cachedManagedSecret = value;
  return value;
}

function validate(secret) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error(
      'JWT secret is not configured: set JWT_SECRET (or JWT_SECRET_NAME) — no default is allowed'
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT secret is too short (${secret.length} chars); a minimum of ${MIN_SECRET_LENGTH} is required`
    );
  }
  return secret;
}

/**
 * Resolve and validate the JWT signing key. Throws if it is absent or shorter
 * than the required minimum — there is no fallback.
 *
 * @returns {Promise<string>}
 */
async function getJwtSecret() {
  const name = process.env.JWT_SECRET_NAME;
  if (name) {
    return validate(await fetchManagedSecret(name));
  }
  return validate(process.env.JWT_SECRET);
}

// Test seam: allow the memoized managed secret to be cleared between tests.
function _resetSecretCache() {
  cachedManagedSecret = null;
}

module.exports = { getJwtSecret, MIN_SECRET_LENGTH, _resetSecretCache };
