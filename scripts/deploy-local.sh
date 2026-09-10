#!/usr/bin/env bash
# One-shot bring-up of the INFRASTRUCTURE ONLY:
#   docker compose up -> LocalStack starts -> CloudFormation deployed
#   -> tables/buckets created
#
# Deployment happens automatically via the LocalStack ready.d hook
# (scripts/localstack-init.sh); this script just waits for it to finish so
# you know it's safe to start backend/frontend next.
#
# This repo doesn't start backend/frontend — do that from their own repos,
# independently, once this script says the stack is ready. Then run
# scripts/seed-local.sh from here once the backend is up.
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

echo "[deploy-local] infrastructure ready:"
echo "  LocalStack -> http://localhost:4566/_localstack/health"
echo ""
echo "Next: start ecommerce-admin-backend (its own 'docker compose up'), then"
echo "ecommerce-admin-frontend, then run ./scripts/seed-local.sh from here."
