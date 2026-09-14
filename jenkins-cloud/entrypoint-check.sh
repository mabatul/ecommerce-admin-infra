#!/usr/bin/env bash
# Refuses to start without admin creds — an init.groovy.d exception alone
# gets logged but doesn't stop Jenkins from booting wide open.
set -euo pipefail

if [ -z "${JENKINS_ADMIN_USER:-}" ] || [ -z "${JENKINS_ADMIN_PASSWORD:-}" ]; then
  echo "FATAL: JENKINS_ADMIN_USER and JENKINS_ADMIN_PASSWORD must both be set" >&2
  echo "(Railway service variables) — refusing to start with no admin" >&2
  echo "account configured." >&2
  exit 1
fi

exec /usr/local/bin/jenkins.sh "$@"
