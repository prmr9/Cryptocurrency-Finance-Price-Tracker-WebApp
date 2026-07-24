#!/usr/bin/env bash
# ------------------------------------------------------------------
# Configures GitHub Environments + secrets for the EC2 deploys.
# Run this AFTER Terraform has provisioned the infrastructure, from an
# account with ADMIN rights on the repo. Requires: gh (authenticated), terraform.
#
#   cd infra && ./github-setup.sh
# ------------------------------------------------------------------
set -euo pipefail

REPO="prmr9/Cryptocurrency-Finance-Price-Tracker-WebApp"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> Reading Terraform outputs..."
NONPROD_IP="$(cd "$HERE" && terraform output -json instance_public_ips | python3 -c 'import sys,json;print(json.load(sys.stdin)["nonprod"])')"
PROD_IP="$(cd "$HERE" && terraform output -json instance_public_ips | python3 -c 'import sys,json;print(json.load(sys.stdin)["prod"])')"
SSH_KEY="$(cd "$HERE" && terraform output -raw ssh_private_key_pem)"

echo "    nonprod = $NONPROD_IP"
echo "    prod    = $PROD_IP"

REVIEWER_ID="$(gh api user --jq .id)"

echo "==> Creating 'nonprod' environment..."
gh api --method PUT "repos/$REPO/environments/nonprod" >/dev/null

echo "==> Creating 'prod' environment with required reviewer (you)..."
gh api --method PUT "repos/$REPO/environments/prod" \
  -f "reviewers[][type]=User" \
  -F "reviewers[][id]=$REVIEWER_ID" >/dev/null

echo "==> Setting secrets..."
gh secret set EC2_HOST    --env nonprod --repo "$REPO" --body "$NONPROD_IP"
printf '%s' "$SSH_KEY" | gh secret set EC2_SSH_KEY --env nonprod --repo "$REPO"
gh secret set EC2_HOST    --env prod    --repo "$REPO" --body "$PROD_IP"
printf '%s' "$SSH_KEY" | gh secret set EC2_SSH_KEY --env prod    --repo "$REPO"

echo "==> Done. Environments 'nonprod' and 'prod' are configured."
echo "    Push to 'develop' -> nonprod, push to 'main' -> prod (with approval)."
