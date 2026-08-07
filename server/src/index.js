'use strict';

// ---------------------------------------------------------------------------
// Backend HTTP entrypoint (KAN-13 / contracts C4, C9).
//
// This is the net-new HTTP listener C4 requires — before this ticket the server/
// package had only a DB layer and no web tier. At boot we FAIL FAST if the JWT
// signing key is not configured: getJwtSecret() throws when JWT_SECRET (or the
// Secrets Manager JWT_SECRET_NAME) is absent or shorter than 32 chars, so the
// process never starts listening with an undefined or weak key that could forge
// or mis-verify sessions.
//
// TLS termination (HTTPS) is provided in front of this service by the deployment
// tier (nginx+certbot or an ALB — see DEPLOYMENT.md). The session cookie's Secure
// flag is env-gated (NODE_ENV=production / COOKIE_SECURE) so it activates once
// that terminator is in place.
// ---------------------------------------------------------------------------

const { createApp } = require('./app');
const { getJwtSecret } = require('./auth/config');
const { logger, initObservability, installProcessHandlers, flush } = require('./observability');

const PORT = process.env.PORT || 8080;

const log = logger.child({ component: 'boot' });

async function main() {
  // Observability comes up FIRST — before the secret check, before the port.
  // The fail-fast below is precisely the failure most worth having a structured,
  // shipped log line for: a backend that refuses to start is invisible to every
  // signal that depends on it being up, so its last words are the only evidence.
  initObservability();
  installProcessHandlers();

  // Fail fast: validate the signing key BEFORE we bind a port. Throws if the key
  // is missing or too short — there is no default/fallback.
  await getJwtSecret();

  const app = createApp();
  app.listen(PORT, () => {
    log.info('backend listening', { port: Number(PORT) });
  });
}

if (require.main === module) {
  main().catch((err) => {
    // flush() before exit, so the one record explaining why the process died is
    // written before the runtime tears stdout down.
    log.fatal('backend failed to start', { error: err });
    flush().finally(() => process.exit(1));
  });
}

module.exports = { main };
