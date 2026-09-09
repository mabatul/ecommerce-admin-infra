#!/usr/bin/env bash
# Populates sample Users/Products/Categories/Carts/Wishlists (spec section 24).
# Runs `npm run seed` inside the already-running backend container so it
# reuses that container's dependencies and network access to LocalStack.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "[seed-local] seeding via backend container..."
docker compose exec -T backend npm run seed
echo "[seed-local] done."
