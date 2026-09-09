#!/usr/bin/env bash
# One-shot local bring-up (spec section 23):
#   docker compose up -> LocalStack starts -> CloudFormation deployed
#   -> tables/buckets created -> seed data inserted -> backend/frontend start
#
# Infrastructure deployment happens automatically via the LocalStack ready.d
# hook (scripts/localstack-init.sh); this script waits for that, then seeds
# and brings the rest of the stack up. For a from-scratch run this is what
# `docker compose up` alone does not give you (seed data) — see README.md.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export ENVIRONMENT=local

echo "[deploy-local] starting LocalStack..."
docker compose up -d localstack

echo "[deploy-local] waiting for LocalStack to be healthy..."
until docker compose exec -T localstack curl -sf http://localhost:4566/_localstack/health >/dev/null 2>&1; do
  sleep 2
done

echo "[deploy-local] waiting for the CloudFormation stack (deployed by the"
echo "  ready.d init hook, scripts/localstack-init.sh) to reach *_COMPLETE..."
STACK_NAME="${PROJECT_NAME:-ecommerce-admin}-local"
until docker compose exec -T localstack awslocal cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null | grep -q "COMPLETE"; do
  sleep 2
done

echo "[deploy-local] starting backend + frontend..."
docker compose up -d --build backend frontend

echo "[deploy-local] waiting for backend to be ready..."
until docker compose exec -T backend curl -sf http://localhost:4000/api/health >/dev/null 2>&1; do
  sleep 2
done

./scripts/seed-local.sh
./scripts/health-check.sh

echo "[deploy-local] ready:"
echo "  frontend -> http://localhost:${FRONTEND_PORT:-3000}"
echo "  backend  -> http://localhost:${BACKEND_PORT:-4000}/api/health"
