#!/usr/bin/env bash
# Smoke-checks every piece of the local stack after `docker compose up`.
#
# HEALTH_CHECK_HOST defaults to "localhost", which is correct when this
# script runs on your machine (published ports are reachable there). When
# it runs INSIDE the Jenkins container (Docker-outside-of-Docker — see
# jenkins/README.md), "localhost" would mean Jenkins' own container, not
# the host where the published ports actually are — the Jenkinsfile sets
# HEALTH_CHECK_HOST=host.docker.internal for that case.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

HOST="${HEALTH_CHECK_HOST:-localhost}"
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

echo "[health-check] checking local stack (host: ${HOST})..."
check "LocalStack"    "http://${HOST}:4566/_localstack/health"
check "Backend API"   "http://${HOST}:${BACKEND_PORT}/api/health"
check "Frontend"      "http://${HOST}:${FRONTEND_PORT}"

if [ "$FAIL" -ne 0 ]; then
  echo "[health-check] one or more checks failed."
  exit 1
fi

echo "[health-check] all checks passed."
