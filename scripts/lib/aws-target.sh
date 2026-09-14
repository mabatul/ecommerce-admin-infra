#!/usr/bin/env bash
# Shared helper sourced by the other scripts/*.sh files. Picks the right AWS
# CLI target for the current $ENVIRONMENT so no script has to hardcode
# LocalStack vs real AWS logic itself (spec section 26).
#
#   ENVIRONMENT=local        -> commands run inside the localstack container
#                                (docker compose exec), via awslocal
#   ENVIRONMENT=dev|prod     -> commands run against real AWS via the host
#                                `aws` CLI (credentials from the environment,
#                                never hardcoded here)

ENVIRONMENT="${ENVIRONMENT:-local}"
PROJECT_NAME="${PROJECT_NAME:-ecommerce-admin}"
STACK_NAME="${PROJECT_NAME}-${ENVIRONMENT}"

aws_cmd() {
  if [ "${ENVIRONMENT}" = "local" ]; then
    docker compose exec -T localstack awslocal "$@"
  else
    aws "$@"
  fi
}

# Like aws_cmd, but for invoking the AWS CLI from the host against a
# LocalStack endpoint (used when no docker compose service is available,
# e.g. CI running LocalStack standalone). Prefer aws_cmd when possible.
aws_cmd_host() {
  if [ "${ENVIRONMENT}" = "local" ]; then
    aws --endpoint-url "${AWS_ENDPOINT_URL:-http://localhost:4566}" "$@"
  else
    aws "$@"
  fi
}
