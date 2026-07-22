#!/bin/bash
set -euxo pipefail

# Install nginx
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx rsync

# Web root that the CI deploy will rsync into. Owned by 'ubuntu' so the
# GitHub Actions SSH user can write to it without sudo.
mkdir -p /var/www/app
chown -R ubuntu:ubuntu /var/www/app

# Placeholder page until the first deploy lands
cat > /var/www/app/index.html <<'HTML'
<!doctype html><html><body><h1>Provisioned. Waiting for first deploy...</h1></body></html>
HTML

# nginx site config for a single-page React app, plus (KAN-31) reverse-proxy
# locations for the Node backend (server/) on 127.0.0.1:8080. The backend
# locations are placed BEFORE the `location / { try_files ... }` SPA
# catch-all so they take precedence over the frontend fallback. This same
# block (byte-for-byte) is inserted by infra/scripts/provision-backend.sh
# into an ALREADY-RUNNING instance's site file — see that script for the
# idempotent, marker-guarded version of the identical location blocks below.
cat > /etc/nginx/sites-available/app <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/app;
    index index.html;

    # --- KAN-31 backend proxy (managed by provision-backend.sh) ---
    location /auth/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /portfolios/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /portfolios {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /me/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /health {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # --- end KAN-31 backend proxy ---

    # SPA fallback: unknown routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache hashed static assets aggressively
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl restart nginx

# ------------------------------------------------------------------
# Backend runtime (KAN-31): Node LTS + a systemd-managed server/ process.
#
# This block is kept byte-for-byte identical (same commands, same systemd
# unit body) to infra/scripts/provision-backend.sh / infra/systemd/
# crypto-tracker-backend.service — that script is the idempotent version of
# this same logic, pushed over SSH by deploy-backend-ec2.sh to configure
# ALREADY-RUNNING instances. The only intentional difference is mechanical:
# this file is rendered once by Terraform (templatefile), so the 4
# per-environment values below come in as ${environment}/${aws_region}/
# ${db_secret_name}/${jwt_secret_name} instead of provision-backend.sh's
# exported env vars + sed placeholders.
#
# The first release + `npm ci --omit=dev` happen later, via
# deploy-backend-ec2.sh, once server/ has actually been shipped — see that
# script (repo root) for: rsync server/, npm ci --omit=dev inside the new
# release dir, promote via the `current` symlink, systemctl restart, then
# health-check the backend itself (curl -fsS http://$IP/health and a
# POST /auth/login probe) with automatic rollback on failure.
# ------------------------------------------------------------------
ENVIRONMENT="${environment}"
AWS_REGION="${aws_region}"
DB_SECRET_NAME="${db_secret_name}"
JWT_SECRET_NAME="${jwt_secret_name}"
export ENVIRONMENT AWS_REGION DB_SECRET_NAME JWT_SECRET_NAME

RELEASE_ROOT=/opt/crypto-tracker-backend
NODE_MAJOR_REQUIRED=20

# --- Node.js 20 (LTS): install only if missing or below the required major ---
current_node_major="0"
if command -v node >/dev/null 2>&1; then
  current_node_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
fi
if [ "$current_node_major" -lt "$NODE_MAJOR_REQUIRED" ]; then
  command -v curl >/dev/null 2>&1 || (apt-get update -y && apt-get install -y curl)
  curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR_REQUIRED.x" | bash -
  apt-get install -y nodejs
fi

# --- Release layout: releases/<id>/ promoted via a `current` symlink ---
mkdir -p "$RELEASE_ROOT/releases"
chown -R ubuntu:ubuntu "$RELEASE_ROOT"

# --- systemd unit (same [Unit]/[Service]/[Install] body as
# infra/systemd/crypto-tracker-backend.service), placeholders filled from
# this instance's own environment/region/secret names ---
cat > /etc/systemd/system/crypto-tracker-backend.service.template <<'CRYPTO_TRACKER_BACKEND_UNIT'
[Unit]
Description=crypto-tracker backend (server/) — Node auth/portfolio API
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/crypto-tracker-backend/current
ExecStart=/usr/bin/env node /opt/crypto-tracker-backend/current/src/index.js
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=AWS_REGION=__AWS_REGION__
Environment=DB_SECRET_NAME=__DB_SECRET_NAME__
Environment=JWT_SECRET_NAME=__JWT_SECRET_NAME__
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
CRYPTO_TRACKER_BACKEND_UNIT

sed \
  -e "s#__AWS_REGION__#$AWS_REGION#g" \
  -e "s#__DB_SECRET_NAME__#$DB_SECRET_NAME#g" \
  -e "s#__JWT_SECRET_NAME__#$JWT_SECRET_NAME#g" \
  /etc/systemd/system/crypto-tracker-backend.service.template > /etc/systemd/system/crypto-tracker-backend.service
rm -f /etc/systemd/system/crypto-tracker-backend.service.template

systemctl daemon-reload
systemctl enable crypto-tracker-backend
# Deliberately not started here: until the first release exists under
# /opt/crypto-tracker-backend/current, ExecStart has nothing to run.
# deploy-backend-ec2.sh restarts the service AFTER it promotes a release.
