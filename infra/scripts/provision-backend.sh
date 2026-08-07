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
# Optional:
#   LOG_LEVEL  - debug|info|warn|error for the backend's structured logger.
#                Defaults to info. There is no credential of any kind in the
#                observability path: the CloudWatch agent authenticates with the
#                EC2 instance role.
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

# Deliberately NOT required: an instance provisioned without it still logs, at
# info, to disk. Telemetry degrades; it never disappears.
LOG_LEVEL="${LOG_LEVEL:-info}"

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

# The unit uses StandardOutput=append:/var/log/crypto-tracker/backend.log, and
# systemd sets standard output up BEFORE it would create a LogsDirectory=. So the
# directory has to exist here, before the unit is rendered and started, or the
# service fails at spawn with status=209/STDOUT and restart-loops.
#
# This bites harder than it looks: deploy-backend-ec2.sh's rollback re-points the
# release symlink but does NOT restore the previous unit file, so a unit that
# cannot start takes the rolled-back release down with it. Creating the directory
# here — in the same script that writes the unit — keeps the unit's precondition
# and the unit itself in one place.
#
# Left root-owned DELIBERATELY. systemd opens StandardOutput= as root and only
# then drops to User=ubuntu, so the service writes through an already-open file
# descriptor and never needs write permission on the directory or the file. That
# means logrotate can run as root (see below) and truncate a root-owned file,
# which is the only combination where rotation actually works here.
echo "==> [$ENVIRONMENT] Ensuring log directory /var/log/crypto-tracker"
mkdir -p /var/log/crypto-tracker
chown root:root /var/log/crypto-tracker

echo "==> [$ENVIRONMENT] Rendering systemd unit from $SERVICE_TEMPLATE"
[ -f "$SERVICE_TEMPLATE" ] || { echo "missing $SERVICE_TEMPLATE" >&2; exit 1; }
sed \
  -e "s#__AWS_REGION__#$AWS_REGION#g" \
  -e "s#__DB_SECRET_NAME__#$DB_SECRET_NAME#g" \
  -e "s#__JWT_SECRET_NAME__#$JWT_SECRET_NAME#g" \
  -e "s#__LOG_LEVEL__#$LOG_LEVEL#g" \
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

# ------------------------------------------------------------------
# Log shipping: backend.log -> CloudWatch Logs.
#
# The backend writes one JSON object per line to
# /var/log/crypto-tracker/backend.log (systemd StandardOutput=append:, see
# infra/systemd/crypto-tracker-backend.service). The CloudWatch agent tails that
# FILE and ships it to this environment's log group using the EC2 instance role
# -- there is no token, key or secret anywhere in this path.
#
# WHY A FILE AND NOT THE JOURNAL: the CloudWatch agent collects log files and
# Windows events. It cannot read the systemd journal. An earlier version of this
# script left the backend on journald and configured the agent to tail only the
# nginx files, which meant backend logs never left the box at all.
#
# PER-ENVIRONMENT ISOLATION: the log group name is derived from $ENVIRONMENT, and
# infra/observability.tf grants each instance role write access to ITS OWN log
# group ARNs only. A nonprod box therefore cannot write into prod's log group
# even if this config were wrong -- the isolation is enforced by IAM, not by the
# correctness of this file.
#
# Idempotent and marker-guarded like the nginx block above.
# ------------------------------------------------------------------
CW_AGENT_CONFIG=/opt/aws/amazon-cloudwatch-agent/etc/crypto-tracker.json
CW_AGENT_CTL=/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl
BACKEND_LOG=/var/log/crypto-tracker/backend.log
CW_LOG_GROUP_BACKEND="/crypto-tracker/$ENVIRONMENT/backend"
CW_LOG_GROUP_NGINX="/crypto-tracker/$ENVIRONMENT/nginx"

# --- logrotate ------------------------------------------------------
#
# COPYTRUNCATE IS REQUIRED, not a preference. systemd's `StandardOutput=append:`
# holds an open file descriptor for the life of the process. The default
# logrotate mode renames the file and creates a new one, which leaves the
# backend writing into the renamed inode forever -- the "new" log stays empty
# until the service restarts, and the agent ships nothing. copytruncate copies
# then truncates in place, so the existing descriptor keeps working.
#
# NO `su` DIRECTIVE, also deliberate. systemd creates backend.log as root:root
# 0644 (it opens stdio before dropping to User=ubuntu). An earlier version had
# `su ubuntu ubuntu`, which made logrotate act as ubuntu -- unable to truncate a
# root-owned file, so rotation silently failed and the log would have grown until
# it filled the disk. Running logrotate as root, against a root-owned file, is
# the combination that works.
#
# 50M x 5 caps local disk at ~250MB, comfortably inside the 8GB root volume.
echo "==> [$ENVIRONMENT] Ensuring logrotate for $BACKEND_LOG"
cat > /etc/logrotate.d/crypto-tracker <<'LOGROTATE'
/var/log/crypto-tracker/backend.log {
    daily
    rotate 5
    size 50M
    copytruncate
    compress
    delaycompress
    missingok
    notifempty
}
LOGROTATE

# --- CloudWatch agent -----------------------------------------------
echo "==> [$ENVIRONMENT] Ensuring CloudWatch agent (log group: $CW_LOG_GROUP_BACKEND)"

if [ ! -f "$CW_AGENT_CTL" ]; then
  tmp_deb="$(mktemp --suffix=.deb)"
  # A failure here must NOT abort the deploy. The application keeps serving and
  # keeps writing structured logs to disk; only the shipping is degraded, and it
  # recovers on the next deploy. Telemetry never takes the service down.
  if curl -fsSL -o "$tmp_deb" "https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb"; then
    dpkg -i -E "$tmp_deb" || echo "==> [$ENVIRONMENT] WARNING: CloudWatch agent install failed; logs remain on disk at $BACKEND_LOG"
  else
    echo "==> [$ENVIRONMENT] WARNING: could not download the CloudWatch agent; logs remain on disk at $BACKEND_LOG"
  fi
  rm -f "$tmp_deb"
fi

if [ -f "$CW_AGENT_CTL" ]; then
  mkdir -p "$(dirname "$CW_AGENT_CONFIG")"
  # Rewritten every run so a changed environment or log group takes effect,
  # matching how the systemd unit is fully re-rendered above.
  cat > "$CW_AGENT_CONFIG" <<CWCONFIG
{
  "agent": { "run_as_user": "root" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "$BACKEND_LOG",
            "log_group_name": "$CW_LOG_GROUP_BACKEND",
            "log_stream_name": "{instance_id}/backend",
            "timezone": "UTC"
          },
          {
            "file_path": "/var/log/nginx/access.log",
            "log_group_name": "$CW_LOG_GROUP_NGINX",
            "log_stream_name": "{instance_id}/access"
          },
          {
            "file_path": "/var/log/nginx/error.log",
            "log_group_name": "$CW_LOG_GROUP_NGINX",
            "log_stream_name": "{instance_id}/error"
          }
        ]
      }
    }
  }
}
CWCONFIG

  "$CW_AGENT_CTL" -a fetch-config -m ec2 -s -c "file:$CW_AGENT_CONFIG" \
    || echo "==> [$ENVIRONMENT] WARNING: CloudWatch agent config reload failed; logs remain on disk at $BACKEND_LOG"
fi
