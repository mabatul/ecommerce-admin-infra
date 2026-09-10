#!/usr/bin/env bash
# Cleans up what ci-deploy-local.sh creates. Used in the pipeline's post{},
# but safe to run by hand too.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PROJECT_NAME="${PROJECT_NAME:-ecommerce-admin}"
PREFIX="${PROJECT_NAME}-ci"

for name in frontend backend localstack; do
  docker rm -f "${PREFIX}-${name}" >/dev/null 2>&1
done
docker network rm "${PREFIX}-net" >/dev/null 2>&1

echo "[ci-teardown] done."
