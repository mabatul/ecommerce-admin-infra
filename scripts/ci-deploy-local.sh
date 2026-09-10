#!/usr/bin/env bash
# Infrastructure smoke test for THIS repo's Jenkins pipeline
# (infra/Jenkinsfile): brings up LocalStack with the real stack and, if the
# sibling backend/frontend folders exist, builds and runs them against that
# infrastructure — same pattern ecommerce-admin-backend/Jenkinsfile and
# ecommerce-admin-frontend/Jenkinsfile use for their own smoke tests, but
# here the focus is validating that the infrastructure itself works end to
# end.
#
# Uses plain `docker` (build/run/network) instead of `docker compose`: this
# repo's Jenkins talks to the HOST's Docker via the mounted socket
# (Docker-outside-of-Docker, see jenkins/README.md), and there relative
# bind-mounts don't resolve correctly — that's why it builds images that
# bake the code in (COPY) instead of mounting it.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PROJECT_NAME="${PROJECT_NAME:-ecommerce-admin}"
PREFIX="${PROJECT_NAME}-ci"
NETWORK="${PREFIX}-net"
BACKEND_PATH="${BACKEND_PATH:-../ecommerce-admin-backend}"
FRONTEND_PATH="${FRONTEND_PATH:-../ecommerce-admin-frontend}"

ensure_network() {
  docker network create "${NETWORK}" >/dev/null 2>&1 || true
}

deploy_infra() {
  ensure_network
  echo "[ci-deploy-local:infra] build + run localstack..."
  docker rm -f "${PREFIX}-localstack" >/dev/null 2>&1 || true
  docker build -f docker/Dockerfile.localstack -t "${PREFIX}-localstack:latest" .
  docker run -d --name "${PREFIX}-localstack" --network "${NETWORK}" \
    -p 4566:4566 \
    -e SERVICES="${LOCALSTACK_SERVICES:-dynamodb,s3,cloudformation,iam,ssm,sts}" \
    -e DEBUG="${LOCALSTACK_DEBUG:-0}" \
    -e PERSISTENCE=0 \
    "${PREFIX}-localstack:latest"

  echo "[ci-deploy-local:infra] waiting for LocalStack to be healthy..."
  until docker exec "${PREFIX}-localstack" curl -sf http://localhost:4566/_localstack/health >/dev/null 2>&1; do
    sleep 2
  done

  echo "[ci-deploy-local:infra] waiting for the CloudFormation stack to finish..."
  STACK_NAME="${PROJECT_NAME}-local"
  until docker exec "${PREFIX}-localstack" awslocal cloudformation describe-stacks \
      --stack-name "${STACK_NAME}" --query 'Stacks[0].StackStatus' --output text 2>/dev/null | grep -q "COMPLETE"; do
    sleep 2
  done
  STATUS=$(docker exec "${PREFIX}-localstack" awslocal cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" --query 'Stacks[0].StackStatus' --output text)
  echo "[ci-deploy-local:infra] stack status: ${STATUS}"
  if [[ "${STATUS}" != *COMPLETE* ]] || [[ "${STATUS}" == *ROLLBACK* ]]; then
    echo "[ci-deploy-local:infra] stack did not reach a successful state (${STATUS})."
    exit 1
  fi
}

smoke_test_backend() {
  if [ ! -d "${BACKEND_PATH}" ]; then
    echo "[ci-deploy-local:backend] ${BACKEND_PATH} does not exist, skipping smoke test."
    return
  fi
  ensure_network
  echo "[ci-deploy-local:backend] build + run backend (smoke test)..."
  docker rm -f "${PREFIX}-backend" >/dev/null 2>&1 || true
  docker build -f "${BACKEND_PATH}/Dockerfile.ci" -t "${PREFIX}-backend:latest" "${BACKEND_PATH}"
  docker run -d --name "${PREFIX}-backend" --network "${NETWORK}" \
    -p 4000:4000 \
    -e ENVIRONMENT=local \
    -e PROJECT_NAME="${PROJECT_NAME}" \
    -e AWS_REGION="${AWS_REGION:-us-east-1}" \
    -e AWS_ENDPOINT_URL="http://${PREFIX}-localstack:4566" \
    -e AWS_ACCESS_KEY_ID=test \
    -e AWS_SECRET_ACCESS_KEY=test \
    -e BACKEND_PORT=4000 \
    "${PREFIX}-backend:latest"

  echo "[ci-deploy-local:backend] waiting for the backend to respond..."
  until docker exec "${PREFIX}-backend" wget -qO- http://localhost:4000/api/health >/dev/null 2>&1; do
    sleep 2
  done
}

health_check() {
  # Checks only what THIS script actually brought up — not
  # scripts/health-check.sh's job (that one is for a developer's own
  # machine, where backend/frontend are reliably reachable on localhost;
  # here, from inside Jenkins, "localhost" means Jenkins' own container,
  # and backend/frontend may not have been started at all if the sibling
  # folders weren't available — see smoke_test_backend above).
  local host="${HEALTH_CHECK_HOST:-localhost}"
  local fail=0

  if docker exec "${PREFIX}-localstack" curl -sf http://localhost:4566/_localstack/health >/dev/null 2>&1; then
    echo "  [OK]   LocalStack"
  else
    echo "  [FAIL] LocalStack"
    fail=1
  fi

  if docker ps --format '{{.Names}}' | grep -qx "${PREFIX}-backend"; then
    if curl -sf "http://${host}:4000/api/health" >/dev/null 2>&1; then
      echo "  [OK]   Backend (smoke test)"
    else
      echo "  [FAIL] Backend (smoke test)"
      fail=1
    fi
  else
    echo "  [SKIP] Backend (smoke test wasn't run — see above)"
  fi

  [ "$fail" -eq 0 ]
}

case "${1:-infra}" in
  infra) deploy_infra ;;
  smoke) deploy_infra; smoke_test_backend ;;
  health) health_check ;;
  *)
    echo "usage: $0 {infra|smoke|health}" >&2
    exit 1
    ;;
esac
