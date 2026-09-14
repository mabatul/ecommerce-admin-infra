#!/usr/bin/env bash
# Deploys infrastructure/cloudformation/main.yaml against the target named by
# $ENVIRONMENT (local -> LocalStack, dev/prod -> real AWS). Same template
# either way (spec section 21) — only the target and parameters change.
#
# Usage:
#   ENVIRONMENT=local ./scripts/deploy-infrastructure.sh
#   ENVIRONMENT=dev   ./scripts/deploy-infrastructure.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source scripts/lib/aws-target.sh

TEMPLATE_PATH="infrastructure/cloudformation/main.yaml"

echo "[deploy-infrastructure] environment=${ENVIRONMENT} stack=${STACK_NAME}"

if [ "${ENVIRONMENT}" = "local" ]; then
  # Runs inside the localstack container; that container has
  # ./infrastructure mounted read-only at /infrastructure (docker-compose.yml).
  aws_cmd cloudformation deploy \
    --stack-name "${STACK_NAME}" \
    --template-file "/infrastructure/cloudformation/main.yaml" \
    --parameter-overrides ProjectName="${PROJECT_NAME}" Environment="${ENVIRONMENT}" \
    --capabilities CAPABILITY_NAMED_IAM
else
  aws cloudformation deploy \
    --stack-name "${STACK_NAME}" \
    --template-file "${TEMPLATE_PATH}" \
    --parameter-overrides ProjectName="${PROJECT_NAME}" Environment="${ENVIRONMENT}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "${AWS_REGION:-us-east-1}"
fi

echo "[deploy-infrastructure] done."
