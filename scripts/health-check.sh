#!/usr/bin/env bash
# Smoke-checks every piece of the local stack after `docker compose up`.
# HEALTH_CHECK_HOST defaults to "localhost" (correct when run on your own
# machine); override it if the checker itself runs inside a container that
# needs a different route to the published ports.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

HOST="${HEALTH_CHECK_HOST:-localhost}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
STOREFRONT_PORT="${STOREFRONT_PORT:-3001}"
BACKEND_PORT="${BACKEND_PORT:-4000}"
FAIL=0

check() {
  local name="$1" url="$2"
  if curl -sf -o /dev/null "$url"; then
    echo "  [OK]   ${name} (${url})"
  else
    echo "  [FAIL] ${name} (${url})"
    FAIL=1
  fi
}

echo "[health-check] checking local stack (host: ${HOST})..."
check "LocalStack"    "http://${HOST}:4566/_localstack/health"
check "Backend API"   "http://${HOST}:${BACKEND_PORT}/api/health"
check "Admin"         "http://${HOST}:${FRONTEND_PORT}"
check "Storefront"    "http://${HOST}:${STOREFRONT_PORT}/health"

if [ "$FAIL" -ne 0 ]; then
  echo "[health-check] one or more checks failed."
  exit 1
fi

echo "[health-check] all checks passed."
