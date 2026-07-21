'use strict';

// ---------------------------------------------------------------------------
// Runtime DB secret fetch (KAN-11 / contract C3).
//
// fetchDbSecret() reads the connection secret from AWS Secrets Manager at
// RUNTIME, via the backend's attached IAM role. It is selected purely by
// secret NAME (DB_SECRET_NAME) in a given region (AWS_REGION) -- see
// DATABASE.md §3-4. Both env vars are required and validated BEFORE any AWS
// call, so a misconfiguration fails loudly rather than silently.
//
// Raw credentials (DB_HOST / DB_PASSWORD / DATABASE_URL / PGPASSWORD / ...) are
// NEVER read here. There is no embedded / fallback credential path: if the
// fetch is denied the error propagates and no connection is opened.
// ---------------------------------------------------------------------------

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require('@aws-sdk/client-secrets-manager');

// Selected by secret name only. DBSECRETNAME is accepted as the underscore-free
// alias used by some runtimes; DB_SECRET_NAME is the documented contract.
function secretName() {
  return process.env.DB_SECRET_NAME || process.env.DBSECRETNAME;
}

// Build a libpq connection URL from the secret components when the secret does
// not already carry one, so callers connect from the fetched credentials only.
function buildUrl(secret) {
  const user = encodeURIComponent(secret.username);
  const pass = encodeURIComponent(secret.password);
  return `postgres://${user}:${pass}@${secret.host}:${secret.port}/${secret.dbname}`;
}

async function fetchDbSecret() {
  const name = secretName();
  if (!name) {
    throw new Error('DB_SECRET_NAME is required to fetch the database secret');
  }
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error('AWS_REGION is required to fetch the database secret');
  }

  const client = new SecretsManagerClient({ region });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: name })
  );
  const secret = JSON.parse(response.SecretString);

  return { ...secret, url: secret.url || buildUrl(secret) };
}

module.exports = { fetchDbSecret };
