'use strict';

// Behavioural tests for the riskiest integration (KAN-11 / contract C3):
// fetchDbSecret() at RUNTIME. We patch the AWS SDK client's send() so no
// network/credentials are needed, then assert:
//   * happy path  -> the fetched secret is returned and a libpq url is built
//                    from the fetched components (AC 1: connect from fetched creds);
//   * url passthrough -> a secret that already carries `url` is used verbatim;
//   * auth failure -> the SecretsManager error is rethrown UNCHANGED, with no
//                     fallback/embedded credential substituted (AC 2).

const test = require('node:test');
const assert = require('node:assert');

const sdk = require('@aws-sdk/client-secrets-manager');
const { fetchDbSecret } = require('../src/db/secrets');

// Replace the client's send() with a stub; return a restore() that removes the
// override (the real method is inherited from the smithy Client base, so the
// override is an own prop we simply delete).
function stubSend(impl) {
  const proto = sdk.SecretsManagerClient.prototype;
  const hadOwn = Object.prototype.hasOwnProperty.call(proto, 'send');
  const prevDesc = Object.getOwnPropertyDescriptor(proto, 'send');
  proto.send = impl;
  return function restore() {
    if (hadOwn && prevDesc) Object.defineProperty(proto, 'send', prevDesc);
    else delete proto.send;
  };
}

function withEnv(fn) {
  const prev = { name: process.env.DB_SECRET_NAME, region: process.env.AWS_REGION };
  process.env.DB_SECRET_NAME = 'crypto-tracker/nonprod/db';
  process.env.AWS_REGION = 'us-east-1';
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev.name === undefined) delete process.env.DB_SECRET_NAME;
      else process.env.DB_SECRET_NAME = prev.name;
      if (prev.region === undefined) delete process.env.AWS_REGION;
      else process.env.AWS_REGION = prev.region;
    });
}

test('fetchDbSecret returns the fetched secret and builds a libpq url from its components', () =>
  withEnv(async () => {
    const restore = stubSend(async () => ({
      SecretString: JSON.stringify({
        engine: 'postgres',
        host: 'crypto-nonprod.abc123.us-east-1.rds.amazonaws.com',
        port: 5432,
        dbname: 'cryptotracker',
        username: 'app_admin',
        password: 'p@ss/w:rd',
      }),
    }));
    try {
      const secret = await fetchDbSecret();
      assert.equal(secret.host, 'crypto-nonprod.abc123.us-east-1.rds.amazonaws.com');
      assert.equal(secret.username, 'app_admin');
      // Credentials/host in the url come ONLY from the fetched secret, url-encoded.
      assert.equal(
        secret.url,
        'postgres://app_admin:p%40ss%2Fw%3Ard@crypto-nonprod.abc123.us-east-1.rds.amazonaws.com:5432/cryptotracker'
      );
    } finally {
      restore();
    }
  }));

test('fetchDbSecret uses the secret\'s own url verbatim when present', () =>
  withEnv(async () => {
    const restore = stubSend(async () => ({
      SecretString: JSON.stringify({ url: 'postgres://u:pw@host:5432/db', host: 'host' }),
    }));
    try {
      const secret = await fetchDbSecret();
      assert.equal(secret.url, 'postgres://u:pw@host:5432/db');
    } finally {
      restore();
    }
  }));

test('fetchDbSecret rethrows the SecretsManager authorization error unchanged (no fallback credentials)', () =>
  withEnv(async () => {
    const authError = Object.assign(
      new Error('User is not authorized to perform secretsmanager:GetSecretValue'),
      { name: 'AccessDeniedException', $metadata: { httpStatusCode: 400 } }
    );
    const restore = stubSend(async () => {
      throw authError;
    });
    try {
      // The SAME error object propagates — proving there is no embedded/fallback
      // credential path that would otherwise swallow it and connect anyway.
      await assert.rejects(fetchDbSecret(), (err) => {
        assert.strictEqual(err, authError);
        assert.equal(err.name, 'AccessDeniedException');
        return true;
      });
    } finally {
      restore();
    }
  }));
