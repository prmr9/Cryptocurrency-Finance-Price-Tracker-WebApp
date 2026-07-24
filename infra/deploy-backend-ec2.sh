#!/bin/bash
# ------------------------------------------------------------------
# Thin delegator (KAN-31): the backend release lane's real logic lives in
# the repo-root deploy-backend-ec2.sh — the SAME staged nonprod -> grant ->
# prod flow used by .github/workflows/deploy-backend-nonprod.yml and
# deploy-backend-prod.yml — so there is exactly ONE script, never a second
# independently-written copy here.
#
# Running this script performs, in order: rsync server/ into a new
# releases/<id>/ directory, `npm ci --omit=dev` inside it, run DB migrations
# (`node migrate.js`), promote via the `current` symlink, then
# `systemctl restart crypto-tracker-backend`, then health-check the BACKEND
# itself — `curl -fsS http://$EC2_HOST/health` and
# a POST to /auth/login expecting a structured 400/401 (never nginx's bare
# 404/405) — rolling `current` back to the previous release, restarting,
# and exiting non-zero on failure.
# ------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$REPO_ROOT/deploy-backend-ec2.sh" "$@"
