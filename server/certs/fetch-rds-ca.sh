#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Refresh the pinned RDS global CA bundle (KAN-11 / contract C3).
#
# The runtime pool (server/src/db/pool.js) and the migration runner
# (server/migrate.js) verify the RDS server certificate against the bundle at
# server/certs/rds-global-bundle.pem (rejectUnauthorized: true). AWS publishes
# the authoritative bundle at the URL below; run this to (re)fetch it, e.g. as
# a deploy step or whenever AWS rotates the RDS CAs.
#
#   ./server/certs/fetch-rds-ca.sh
#
# It downloads over TLS from AWS's own trust store host and verifies the file
# actually contains certificates before overwriting the committed copy.
# ---------------------------------------------------------------------------
set -euo pipefail

URL="https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem"
DEST="$(cd "$(dirname "$0")" && pwd)/rds-global-bundle.pem"
TMP="$(mktemp)"

echo "Fetching RDS global CA bundle from ${URL} ..."
curl -fsSL --max-time 60 "$URL" -o "$TMP"

if ! grep -q "BEGIN CERTIFICATE" "$TMP"; then
  echo "ERROR: downloaded file does not look like a PEM bundle; leaving existing copy untouched." >&2
  rm -f "$TMP"
  exit 1
fi

mv "$TMP" "$DEST"
echo "Wrote $(grep -c 'BEGIN CERTIFICATE' "$DEST") certificate(s) to ${DEST}"
