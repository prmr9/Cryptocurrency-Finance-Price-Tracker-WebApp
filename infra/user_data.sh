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

# nginx site config for a single-page React app. (KAN-31) The Node backend
# reverse-proxy locations are added to this SAME file below, by actually
# RUNNING infra/scripts/provision-backend.sh (see the "Backend runtime"
# section at the end of this script) — not by hand-writing a second copy of
# those location blocks here.
cat > /etc/nginx/sites-available/app <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/app;
    index index.html;

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
# Backend runtime (KAN-31): Node LTS + a systemd-managed server/ process,
# fronted by nginx (/auth/, /portfolios, /me, /health -> 127.0.0.1:8080).
#
# This does NOT hand-write its own Node-install / systemd-unit-write / nginx
# proxy sequence. infra/scripts/provision-backend.sh is the single source of
# truth for all of that; Terraform (infra/main.tf) inlines its exact bytes
# below via file(), and the last line of this section actually EXECUTES the
# inlined script. deploy-backend-ec2.sh pushes and runs that SAME file
# (unmodified) over SSH against already-running instances, so both delivery
# paths always run identical bytes — there is no second, independently-
# written install sequence to drift out of sync.
#
# The systemd unit body ([Unit]/[Service]/[Install], with __AWS_REGION__ /
# __DB_SECRET_NAME__ / __JWT_SECRET_NAME__ placeholders) is likewise inlined
# from infra/systemd/crypto-tracker-backend.service, byte-for-byte, and
# provision-backend.sh renders it via sed using the env vars exported below.
#
# The first release + `npm ci --omit=dev` happen later, via
# deploy-backend-ec2.sh, once server/ has actually been shipped — see that
# script (repo root) for: rsync server/, npm ci --omit=dev inside the new
# release dir, promote via the `current` symlink, systemctl restart, then
# health-check the backend itself (curl -fsS http://$IP/health and a
# POST /auth/login probe) with automatic rollback on failure.
# ------------------------------------------------------------------
export ENVIRONMENT="${environment}"
export AWS_REGION="${aws_region}"
export DB_SECRET_NAME="${db_secret_name}"
export JWT_SECRET_NAME="${jwt_secret_name}"

cat > /opt/crypto-tracker-backend.service.template <<'CRYPTO_TRACKER_BACKEND_UNIT_TEMPLATE'
${backend_unit_template}
CRYPTO_TRACKER_BACKEND_UNIT_TEMPLATE

cat > /opt/provision-backend.sh <<'CRYPTO_TRACKER_PROVISION_BACKEND_SCRIPT'
${provision_backend_script}
CRYPTO_TRACKER_PROVISION_BACKEND_SCRIPT
chmod +x /opt/provision-backend.sh

/opt/provision-backend.sh
