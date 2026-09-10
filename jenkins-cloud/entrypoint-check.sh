#!/usr/bin/env bash
# Wraps the real Jenkins entrypoint. Fails the container BEFORE Jenkins
# starts (not after, and not by relying on an init.groovy.d script — those
# run inside the already-starting Jenkins process, and a thrown exception
# there gets logged and ignored, not treated as a boot failure; Jenkins
# comes up wide open regardless — verified the hard way).
set -euo pipefail

if [ -z "${JENKINS_ADMIN_USER:-}" ] || [ -z "${JENKINS_ADMIN_PASSWORD:-}" ]; then
  echo "FATAL: JENKINS_ADMIN_USER and JENKINS_ADMIN_PASSWORD must both be set" >&2
  echo "(Railway service variables) — refusing to start with no admin" >&2
  echo "account configured. This container will keep crash-looping until" >&2
  echo "both are set; that's intentional, not a bug." >&2
  exit 1
fi

exec /usr/local/bin/jenkins.sh "$@"
