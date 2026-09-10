#!/usr/bin/env bash
# Populates sample Users/Products/Categories/Carts/Wishlists.
# Runs `npm run seed` inside the already-running backend container — by
# container name (plain `docker exec`), not `docker compose exec`, since
# the backend is started independently by ecommerce-admin-backend's own
# docker-compose.yml, not by this repo's.
set -euo pipefail

CONTAINER="${BACKEND_CONTAINER:-ecommerce-admin-backend}"

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "[seed-local] container '${CONTAINER}' is not running." >&2
  echo "  Start ecommerce-admin-backend first (its own 'docker compose up')." >&2
  exit 1
fi

echo "[seed-local] seeding via ${CONTAINER}..."
docker exec "${CONTAINER}" npm run seed
echo "[seed-local] done."
