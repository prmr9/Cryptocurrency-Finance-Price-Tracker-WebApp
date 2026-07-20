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

# nginx site config for a single-page React app
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
