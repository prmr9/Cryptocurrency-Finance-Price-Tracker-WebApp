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
#   2. Ships server/ into a NEW versioned release directory and promotes it
#      via a `current` symlink, keeping the previous release around.
#   3. Health-checks the BACKEND itself (GET /health, POST /auth/login)
#      through the public endpoint — i.e. through nginx's reverse proxy —
#      not just nginx's static root.
#   4. On a failed health check, rolls the `current` symlink back to the
#      previous release, restarts the service, and exits non-zero.
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

# Optional caller-supplied correlation id (see the workflows' deploy_id input).
# It is embedded in the release manifest and therefore surfaces in GET /health,
# which is what lets a caller prove THIS dispatch is the one now serving traffic
# rather than trusting a run id it had to guess at.
#
# It reaches a remote shell and a JSON document, so the charset is restricted
# rather than escaped: anything outside [A-Za-z0-9._:-] is rejected outright.
DEPLOY_ID="${DEPLOY_ID:-}"
if [ -n "$DEPLOY_ID" ] && ! printf '%s' "$DEPLOY_ID" | grep -Eq '^[A-Za-z0-9._:-]{1,64}$'; then
  echo "==> [$ENVIRONMENT] Refusing to deploy: DEPLOY_ID must match ^[A-Za-z0-9._:-]{1,64}$" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Log level per environment. Deliberately a two-line shell conditional and not a
# lookup into observability/connectors.json: that file is METADATA describing
# where logs end up (for humans and DevAgent), and nothing at runtime reads it.
# Keeping prod at info is also the cost control — debug multiplies CloudWatch
# ingest volume.
if [ "$ENVIRONMENT" = "prod" ]; then LOG_LEVEL="${LOG_LEVEL:-info}"; else LOG_LEVEL="${LOG_LEVEL:-debug}"; fi

echo "==> [$ENVIRONMENT] Observability: log_level=$LOG_LEVEL -> /crypto-tracker/$ENVIRONMENT/backend"

SSH_KEY_PATH="$(mktemp)"
trap 'rm -f "$SSH_KEY_PATH"' EXIT
echo "$EC2_SSH_KEY" > "$SSH_KEY_PATH"
chmod 600 "$SSH_KEY_PATH"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes -i "$SSH_KEY_PATH")

ssh_run() {
  ssh "${SSH_OPTS[@]}" "ubuntu@${EC2_HOST}" "$@"
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
  sudo env ENVIRONMENT=$ENVIRONMENT AWS_REGION=$AWS_REGION DB_SECRET_NAME=$DB_SECRET_NAME JWT_SECRET_NAME=$JWT_SECRET_NAME LOG_LEVEL=$LOG_LEVEL /opt/provision-backend.sh"

echo "==> [$ENVIRONMENT] Shipping server/ to $RELEASE_DIR"
ssh_run "mkdir -p $RELEASE_DIR"
rsync -avz --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude 'node_modules' \
  --exclude '.env' \
  "$SCRIPT_DIR/server/" "ubuntu@${EC2_HOST}:${RELEASE_DIR}/"

echo "==> [$ENVIRONMENT] Installing production dependencies in $RELEASE_DIR"
ssh_run "cd $RELEASE_DIR && npm ci --omit=dev"

# --- Release manifest: the identity GET /health will report back. Written
# AFTER the rsync (which runs --delete and would otherwise remove it) and
# BEFORE promotion, so the release is never `current` without its identity.
# Every value here is non-secret by construction. ---
GIT_SHA="$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "==> [$ENVIRONMENT] Writing release manifest (release_id=$RELEASE_ID git_sha=$GIT_SHA deploy_id=${DEPLOY_ID:-<none>})"
ssh_run "cat > $RELEASE_DIR/release.json" <<JSON
{
  "release_id": "$RELEASE_ID",
  "git_sha": "$GIT_SHA",
  "deploy_id": "$DEPLOY_ID",
  "deployed_at": "$DEPLOYED_AT",
  "environment": "$ENVIRONMENT"
}
JSON

echo "==> [$ENVIRONMENT] Promoting release: $CURRENT_LINK -> $RELEASE_DIR"
ssh_run "ln -sfn $RELEASE_DIR $CURRENT_LINK && sudo systemctl restart crypto-tracker-backend"

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

# --- Outcome reporting. The pass/fail decision, the rollback, and both exit
# codes below are unchanged: this script remains the single rollback authority,
# and a caller must consume the outcome rather than re-deciding or re-rolling
# it. The RESULT= lines exist so that outcome is machine-readable in the job
# log instead of only inferable from the exit code. ---
if [ "$health_ok" = true ] && { [ "$login_status" = "400" ] || [ "$login_status" = "401" ]; }; then
  echo "==> [$ENVIRONMENT] Health check passed: GET /health is up, POST /auth/login -> $login_status"
  echo "==> [$ENVIRONMENT] Pruning old releases (keeping the 5 most recent)"
  ssh_run "cd $RELEASE_ROOT/releases && ls -1t | tail -n +6 | xargs -r rm -rf"
  echo "==> [$ENVIRONMENT] RESULT=released release_id=$RELEASE_ID git_sha=$GIT_SHA deploy_id=${DEPLOY_ID:-<none>} rollback=none"
  exit 0
fi

echo "==> [$ENVIRONMENT] Health check FAILED (health_ok=$health_ok, /auth/login status=$login_status)"

if [ -n "$PREVIOUS_RELEASE" ]; then
  echo "==> [$ENVIRONMENT] Rolling back: $CURRENT_LINK -> $PREVIOUS_RELEASE"
  ssh_run "ln -sfn $PREVIOUS_RELEASE $CURRENT_LINK && sudo systemctl restart crypto-tracker-backend"
  echo "==> [$ENVIRONMENT] RESULT=rolled_back release_id=$RELEASE_ID deploy_id=${DEPLOY_ID:-<none>} rollback=$PREVIOUS_RELEASE"
else
  echo "==> [$ENVIRONMENT] No previous release recorded (first-ever deploy) — nothing to roll back to"
  echo "==> [$ENVIRONMENT] RESULT=failed_no_rollback release_id=$RELEASE_ID deploy_id=${DEPLOY_ID:-<none>} rollback=unavailable"
fi

exit 1
