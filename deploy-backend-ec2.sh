#!/bin/bash
# ------------------------------------------------------------------
# Deploy server/ (the Node auth/portfolio backend) to an EC2 host, wired
# into the SAME staged nonprod -> grant -> prod lane the frontend deploy
# (deploy.yml) uses. See .github/workflows/deploy-backend-nonprod.yml and
# deploy-backend-prod.yml for how nonprod and prod invoke this script.
#
# Unlike the frontend's plain rsync-and-done deploy, this script:
#   1. Idempotently (re-)provisions the target box (Node/systemd/nginx) by
#      pushing + running infra/scripts/provision-backend.sh — this IS the
#      in-place provisioning mechanism for already-running instances (see
#      infra/user_data.sh for the equivalent path for future/replaced ones).
#   2. Ships server/ into a NEW versioned release directory, installs deps,
#      then runs the repo's node-pg-migrate migrations (server/migrate.js)
#      against the release before it's ever promoted or served.
#   3. Promotes the release via a `current` symlink and restarts the
#      service, then immediately confirms the process is actually up
#      (`systemctl is-active`) before probing it over the network — so a
#      process that never starts is distinguished from an nginx/proxy
#      misconfiguration instead of both surfacing as the same generic
#      curl failure.
#   4. Health-checks the BACKEND itself (GET /health, POST /auth/login)
#      through the public endpoint — i.e. through nginx's reverse proxy —
#      not just nginx's static root.
#   5. On any failure (migration, service-start, or health check), rolls
#      the `current` symlink back to the previous release, restarts the
#      service, and exits non-zero. Failure diagnostics (journalctl /
#      systemctl status) are captured and redacted before ever being
#      logged or written to $GITHUB_STEP_SUMMARY.
#
# Required env vars:
#   EC2_HOST      - target IP (nonprod or prod; from a GitHub Environment secret)
#   EC2_SSH_KEY   - private key contents (from a GitHub Environment secret)
#   ENVIRONMENT   - "nonprod" | "prod" (used to derive Secrets Manager names)
#   AWS_REGION    - region the target's Secrets Manager secrets live in
# Optional:
#   PROJECT_NAME  - defaults to crypto-tracker (must match infra/variables.tf)
# ------------------------------------------------------------------
set -euo pipefail

: "${EC2_HOST:?EC2_HOST is required}"
: "${EC2_SSH_KEY:?EC2_SSH_KEY is required}"
: "${ENVIRONMENT:?ENVIRONMENT is required (nonprod|prod)}"
: "${AWS_REGION:?AWS_REGION is required}"

PROJECT_NAME="${PROJECT_NAME:-crypto-tracker}"
DB_SECRET_NAME="${PROJECT_NAME}/${ENVIRONMENT}/db"
JWT_SECRET_NAME="${PROJECT_NAME}/${ENVIRONMENT}/jwt"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SSH_KEY_PATH="$(mktemp)"
trap 'rm -f "$SSH_KEY_PATH"' EXIT
echo "$EC2_SSH_KEY" > "$SSH_KEY_PATH"
chmod 600 "$SSH_KEY_PATH"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes -i "$SSH_KEY_PATH")

ssh_run() {
  ssh "${SSH_OPTS[@]}" "ubuntu@${EC2_HOST}" "$@"
}

# Strips any line that looks like it carries a credential/secret value before
# it is ever written to the deploy log or $GITHUB_STEP_SUMMARY. `|| true`
# guards against `grep -v` legitimately matching (and thus emitting nothing,
# exit 1) when EVERY captured line happens to look secret-ish -- that must
# not abort the script under `set -e`/`pipefail`.
redact_secrets() {
  grep -viE 'password|secret|token|authorization|postgres://|jwt' || true
}

# Captures journalctl/systemctl output for the backend service, redacts it,
# and writes the redacted text to both the deploy log (stdout) and, when
# running in Actions, $GITHUB_STEP_SUMMARY. Called from every deploy failure
# path (migration failure, service-start failure) so the CAUSE is visible
# instead of a bare curl "connection refused".
capture_backend_diagnostics() {
  echo "==> [$ENVIRONMENT] Capturing backend diagnostics (secrets redacted)"
  local diagnostics
  diagnostics="$(ssh_run "sudo systemctl status crypto-tracker-backend --no-pager -l 2>&1; echo '---- journalctl (last 200 lines) ----'; sudo journalctl -u crypto-tracker-backend --no-pager -n 200 2>&1" | redact_secrets)" || true
  printf '%s\n' "$diagnostics"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### [$ENVIRONMENT] Backend deploy diagnostics (secrets redacted)"
      echo '```'
      printf '%s\n' "$diagnostics"
      echo '```'
    } >> "$GITHUB_STEP_SUMMARY"
  fi
}

# Points `current` back at the previously-deployed release (if any) and
# restarts the service. Shared by every failure path below and by the
# final health-check failure at the bottom of this script.
rollback() {
  if [ -n "$PREVIOUS_RELEASE" ]; then
    echo "==> [$ENVIRONMENT] Rolling back: $CURRENT_LINK -> $PREVIOUS_RELEASE"
    ssh_run "ln -sfn $PREVIOUS_RELEASE $CURRENT_LINK && sudo systemctl restart crypto-tracker-backend"
  else
    echo "==> [$ENVIRONMENT] No previous release recorded (first-ever deploy) — nothing to roll back to"
  fi
}

RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo local)"
RELEASE_ROOT=/opt/crypto-tracker-backend
RELEASE_DIR="$RELEASE_ROOT/releases/$RELEASE_ID"
CURRENT_LINK="$RELEASE_ROOT/current"

echo "==> [$ENVIRONMENT] Deploying release $RELEASE_ID to $EC2_HOST"

# Capture the release we'd roll back to, BEFORE touching anything. Empty if
# this is the first deploy ever (no `current` symlink yet).
PREVIOUS_RELEASE="$(ssh_run "[ -L $CURRENT_LINK ] && readlink -f $CURRENT_LINK || true")"

echo "==> [$ENVIRONMENT] Provisioning host (Node runtime / systemd unit / nginx proxy)"
rsync -avz -e "ssh ${SSH_OPTS[*]}" \
  "$SCRIPT_DIR/infra/scripts/provision-backend.sh" \
  "$SCRIPT_DIR/infra/systemd/crypto-tracker-backend.service" \
  "ubuntu@${EC2_HOST}:/tmp/"

ssh_run "sudo mv /tmp/crypto-tracker-backend.service /opt/crypto-tracker-backend.service.template && \
  sudo mv /tmp/provision-backend.sh /opt/provision-backend.sh && \
  sudo chmod +x /opt/provision-backend.sh && \
  sudo env ENVIRONMENT=$ENVIRONMENT AWS_REGION=$AWS_REGION DB_SECRET_NAME=$DB_SECRET_NAME JWT_SECRET_NAME=$JWT_SECRET_NAME /opt/provision-backend.sh"

echo "==> [$ENVIRONMENT] Shipping server/ to $RELEASE_DIR"
ssh_run "mkdir -p $RELEASE_DIR"
rsync -avz --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude 'node_modules' \
  --exclude '.env' \
  "$SCRIPT_DIR/server/" "ubuntu@${EC2_HOST}:${RELEASE_DIR}/"

echo "==> [$ENVIRONMENT] Installing production dependencies in $RELEASE_DIR"
ssh_run "cd $RELEASE_DIR && npm ci --omit=dev"

# Runs the repo's node-pg-migrate migrations (server/migrate.js) against the
# just-shipped release, BEFORE it is promoted/restarted, so /auth/login's
# 400/401-vs-500 depends on the users table actually existing. migrate.js
# dials `PGHOST` (falling back to 127.0.0.1, the operator-tunnel case from
# DATABASE.md §5) but this box is already inside the RDS security group, so
# we resolve the real RDS host from the same Secrets Manager secret the
# backend itself uses and pass it through explicitly -- no tunnel needed.
run_migrations() {
  echo "==> [$ENVIRONMENT] Resolving database host for migrations"
  local db_host
  db_host="$(ssh_run "cd $RELEASE_DIR && DB_SECRET_NAME=$DB_SECRET_NAME AWS_REGION=$AWS_REGION node -e \"require('./src/db/secrets').fetchDbSecret().then(s => process.stdout.write(s.host), e => { console.error(e); process.exit(1); })\"")" || true
  if [ -z "$db_host" ]; then
    echo "==> [$ENVIRONMENT] Migrations FAILED (could not resolve database host from Secrets Manager)"
    capture_backend_diagnostics
    rollback
    exit 1
  fi

  echo "==> [$ENVIRONMENT] Running database migrations (node migrate.js)"
  if ! ssh_run "cd $RELEASE_DIR && DB_SECRET_NAME=$DB_SECRET_NAME AWS_REGION=$AWS_REGION PGHOST=$db_host node migrate.js"; then
    echo "==> [$ENVIRONMENT] Migrations FAILED"
    capture_backend_diagnostics
    rollback
    exit 1
  fi
  echo "==> [$ENVIRONMENT] Migrations applied"
}
run_migrations

echo "==> [$ENVIRONMENT] Promoting release: $CURRENT_LINK -> $RELEASE_DIR"
ssh_run "ln -sfn $RELEASE_DIR $CURRENT_LINK && sudo systemctl restart crypto-tracker-backend"

# --- Confirm the PROCESS itself came up before ever probing it over the
# network, so a service that never starts is distinguished in the log from
# an nginx/proxy misconfiguration instead of both surfacing as the same
# generic curl failure. Same retry/backoff shape as the health check below. ---
service_active=false
for _attempt in 1 2 3 4 5; do
  if ssh_run "sudo systemctl is-active --quiet crypto-tracker-backend"; then
    service_active=true
    break
  fi
  sleep 3
done

if [ "$service_active" != true ]; then
  echo "==> [$ENVIRONMENT] Backend service FAILED to start (systemctl is-active check failed)"
  capture_backend_diagnostics
  rollback
  exit 1
fi

echo "==> [$ENVIRONMENT] Waiting for the backend to come up"
sleep 3

# --- Health check: the BACKEND, through nginx's public endpoint — not a
# frontend-root 200. A green frontend alone must never mark this done. ---
health_ok=false
for _attempt in 1 2 3 4 5; do
  if curl -fsS "http://${EC2_HOST}/health" >/dev/null 2>&1; then
    health_ok=true
    break
  fi
  sleep 3
done

login_status="000"
if [ "$health_ok" = true ]; then
  login_status="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' \
    -d '{"email":"kan31-healthcheck@example.invalid","password":"not-a-real-password"}' \
    "http://${EC2_HOST}/auth/login" || echo 000)"
fi

if [ "$health_ok" = true ] && { [ "$login_status" = "400" ] || [ "$login_status" = "401" ]; }; then
  echo "==> [$ENVIRONMENT] Health check passed: GET /health is up, POST /auth/login -> $login_status"
  echo "==> [$ENVIRONMENT] Pruning old releases (keeping the 5 most recent)"
  ssh_run "cd $RELEASE_ROOT/releases && ls -1t | tail -n +6 | xargs -r rm -rf"
  exit 0
fi

echo "==> [$ENVIRONMENT] Health check FAILED (health_ok=$health_ok, /auth/login status=$login_status)"

capture_backend_diagnostics
rollback

exit 1
