#!/usr/bin/env bash
# Creates the `dev` DynamoDB tables directly via AWS CLI (DynamoDB Local
# on Railway has no CloudFormation engine) — same naming convention as
# infrastructure/cloudformation/main.yaml.
#
# Usage:
#   AWS_ENDPOINT_URL=https://<your-dynamodb-service>.railway.app \
#   ENVIRONMENT=dev PROJECT_NAME=ecommerce-admin \
#   ./scripts/railway-dynamodb-init.sh
set -euo pipefail

: "${AWS_ENDPOINT_URL:?Missing AWS_ENDPOINT_URL (URL of the DynamoDB Local service on Railway)}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
PROJECT_NAME="${PROJECT_NAME:-ecommerce-admin}"
REGION="${AWS_REGION:-us-east-1}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-local}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-local}"

table_name() { echo "${PROJECT_NAME}-${ENVIRONMENT}-$1"; }

create_table() {
  local name="$1"; shift
  if aws dynamodb describe-table --endpoint-url "$AWS_ENDPOINT_URL" --region "$REGION" \
      --table-name "$name" >/dev/null 2>&1; then
    echo "[railway-dynamodb-init] $name already exists, skipping."
    return
  fi
  echo "[railway-dynamodb-init] creating $name..."
  aws dynamodb create-table --endpoint-url "$AWS_ENDPOINT_URL" --region "$REGION" \
    --table-name "$name" --billing-mode PAY_PER_REQUEST "$@" >/dev/null
}

create_table "$(table_name Users)" \
  --attribute-definitions AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH

create_table "$(table_name Categories)" \
  --attribute-definitions AttributeName=categoryId,AttributeType=S \
  --key-schema AttributeName=categoryId,KeyType=HASH

create_table "$(table_name Products)" \
  --attribute-definitions AttributeName=productId,AttributeType=S AttributeName=categoryId,AttributeType=S \
  --key-schema AttributeName=productId,KeyType=HASH \
  --global-secondary-indexes '[{
    "IndexName": "ByCategory",
    "KeySchema": [{"AttributeName": "categoryId", "KeyType": "HASH"}],
    "Projection": {"ProjectionType": "ALL"}
  }]'

create_table "$(table_name Carts)" \
  --attribute-definitions AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH

create_table "$(table_name Wishlists)" \
  --attribute-definitions AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH

echo "[railway-dynamodb-init] done."
