#!/usr/bin/env bash
# Runs INSIDE the LocalStack container via the ready.d init hook
# (docker-compose.yml mounts this at /etc/localstack/init/ready.d/init.sh).
# LocalStack executes every script under ready.d once the edge service is up,
# so this is what turns `docker compose up` into "infrastructure is ready"
# with no manual step (spec section 23).
set -euo pipefail

STACK_NAME="${PROJECT_NAME:-ecommerce-admin}-${ENVIRONMENT:-local}"
TEMPLATE_PATH="/infrastructure/cloudformation/main.yaml"

echo "[localstack-init] deploying stack '${STACK_NAME}' from ${TEMPLATE_PATH}"

awslocal cloudformation deploy \
  --stack-name "${STACK_NAME}" \
  --template-file "${TEMPLATE_PATH}" \
  --parameter-overrides \
    ProjectName="${PROJECT_NAME:-ecommerce-admin}" \
    Environment="${ENVIRONMENT:-local}" \
  --capabilities CAPABILITY_NAMED_IAM

echo "[localstack-init] stack deployed. Resources:"
awslocal cloudformation describe-stack-resources --stack-name "${STACK_NAME}" \
  --query 'StackResources[].[ResourceType,PhysicalResourceId]' --output table

echo "[localstack-init] done. Run scripts/seed-local.sh once the backend container is up to populate sample data."
