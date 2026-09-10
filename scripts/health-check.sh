#!/usr/bin/env bash
# Smoke-checks every piece of the local stack after `docker compose up`.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

FRONTEND_PORT="${FRONTEND_PORT:-3000}"
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

echo "[health-check] checking local stack..."
check "LocalStack"    "http://localhost:4566/_localstack/health"
check "Backend API"   "http://localhost:${BACKEND_PORT}/api/health"
check "Frontend"      "http://localhost:${FRONTEND_PORT}"

if [ "$FAIL" -ne 0 ]; then
  echo "[health-check] one or more checks failed."
  exit 1
fi

echo "[health-check] all checks passed."
