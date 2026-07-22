#!/bin/bash
# ------------------------------------------------------------------
# Idempotent provisioning for an ALREADY-RUNNING backend instance (KAN-31).
# Pushed + run by deploy-backend-ec2.sh over SSH ahead of every release so a
# box provisioned by an older infra/user_data.sh (or one that has drifted)
# ends up with the same Node runtime / systemd unit / nginx proxy config as
# a freshly-launched instance. Safe to re-run: the Node install is
# version-gated, the systemd unit is fully re-rendered from the template
# every run, and the nginx location blocks are inserted only once
# (marker-guarded).
#
# Required env vars (set by deploy-backend-ec2.sh):
#   ENVIRONMENT      - "nonprod" | "prod"
#   AWS_REGION       - region the Secrets Manager secrets live in
#   DB_SECRET_NAME   - Secrets Manager secret name for the DB connection
#   JWT_SECRET_NAME  - Secrets Manager secret name for the JWT signing key
#
# Expects /opt/crypto-tracker-backend.service.template to already be in
# place -- deploy-backend-ec2.sh rsyncs infra/systemd/crypto-tracker-backend.service
# there (renamed) before invoking this script.
# ------------------------------------------------------------------
set -euo pipefail

: "${ENVIRONMENT:?ENVIRONMENT is required (nonprod|prod)}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${DB_SECRET_NAME:?DB_SECRET_NAME is required}"
: "${JWT_SECRET_NAME:?JWT_SECRET_NAME is required}"

SERVICE_TEMPLATE=/opt/crypto-tracker-backend.service.template
SERVICE_UNIT=/etc/systemd/system/crypto-tracker-backend.service
RELEASE_ROOT=/opt/crypto-tracker-backend
NODE_MAJOR_REQUIRED=20
NGINX_SITE=/etc/nginx/sites-available/app

echo "==> [$ENVIRONMENT] Provisioning Node runtime"
current_node_major="0"
if command -v node >/dev/null 2>&1; then
  current_node_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
fi
if [ "$current_node_major" -lt "$NODE_MAJOR_REQUIRED" ]; then
  command -v curl >/dev/null 2>&1 || (apt-get update -y && apt-get install -y curl)
  curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR_REQUIRED.x" | bash -
  apt-get install -y nodejs
fi

echo "==> [$ENVIRONMENT] Ensuring release layout"
mkdir -p "$RELEASE_ROOT/releases"
chown -R ubuntu:ubuntu "$RELEASE_ROOT"

echo "==> [$ENVIRONMENT] Rendering systemd unit from $SERVICE_TEMPLATE"
[ -f "$SERVICE_TEMPLATE" ] || { echo "missing $SERVICE_TEMPLATE" >&2; exit 1; }
sed \
  -e "s#__AWS_REGION__#$AWS_REGION#g" \
  -e "s#__DB_SECRET_NAME__#$DB_SECRET_NAME#g" \
  -e "s#__JWT_SECRET_NAME__#$JWT_SECRET_NAME#g" \
  "$SERVICE_TEMPLATE" > "$SERVICE_UNIT"

systemctl daemon-reload
systemctl enable crypto-tracker-backend
# Deliberately not (re)started here: deploy-backend-ec2.sh restarts the
# service AFTER it promotes the new release.

echo "==> [$ENVIRONMENT] Ensuring nginx backend proxy locations"
BEGIN_MARKER="# --- KAN-31 backend proxy (managed by provision-backend.sh) ---"
END_MARKER="# --- end KAN-31 backend proxy ---"

if [ -f "$NGINX_SITE" ] && ! grep -qF "$BEGIN_MARKER" "$NGINX_SITE"; then
  tmp_site="$(mktemp)"
  awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" '
    !done && /location \/ \{/ {
      print "    " begin
      print "    location /auth/ {"
      print "        proxy_pass http://127.0.0.1:8080;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "    }"
      print "    location /portfolios/ {"
      print "        proxy_pass http://127.0.0.1:8080;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "    }"
      print "    location = /portfolios {"
      print "        proxy_pass http://127.0.0.1:8080;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "    }"
      print "    location /me/ {"
      print "        proxy_pass http://127.0.0.1:8080;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "    }"
      print "    location /health {"
      print "        proxy_pass http://127.0.0.1:8080;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "    }"
      print "    " end
      done = 1
    }
    { print }
  ' "$NGINX_SITE" > "$tmp_site"
  mv "$tmp_site" "$NGINX_SITE"
  nginx -t
  systemctl reload nginx
fi
