# Jenkins for hosting on Railway (or any PaaS without a Docker daemon
# available to the container). Same base as the local jenkins/Dockerfile,
# but:
#   - NO Docker CLI / socket — Railway doesn't give you a host Docker
#     daemon to talk to, so there's nothing to connect it to. Pipeline
#     stages that build Docker images are made conditional (see each repo's
#     Jenkinsfile: `if command -v docker`) and skip themselves here instead
#     of failing.
#   - Real login (init.groovy.d/basic-security.groovy), instead of the
#     local setup's "no auth at all" — this instance is meant to be public.
#   - Jobs pointing at the real GitHub repos (init.groovy.d/jobs.groovy),
#     instead of file:// mounts of a local checkout.
FROM jenkins/jenkins:lts-jdk17

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg python3 python3-pip \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && pip3 install --no-cache-dir --break-system-packages cfn-lint \
    && npm install -g @railway/cli \
    && rm -rf /var/lib/apt/lists/*

COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

COPY init.groovy.d/ /usr/share/jenkins/ref/init.groovy.d/

# Skip the setup wizard's interactive flow — init.groovy.d/basic-security.groovy
# sets up real auth instead (see that file). JENKINS_ADMIN_USER/
# JENKINS_ADMIN_PASSWORD are read by that script from the environment
# (set them as Railway variables, never hardcoded here).
#
# hudson.plugins.git.GitStatus.NOTIFY_COMMIT_ACCESS_CONTROL=disabled-for-polling:
# lets GitHub's webhook call /git/notifyCommit anonymously to trigger a
# branch re-scan (that's all it needs to do), while still refusing any
# unauthenticated request that tries to force an immediate build via a
# `sha1` param — that part still needs a real login/token. Everything
# else in this Jenkins stays fully locked down (see basic-security.groovy);
# this is a narrow, documented carve-out for exactly this endpoint.
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false -Dhudson.plugins.git.GitStatus.NOTIFY_COMMIT_ACCESS_CONTROL=disabled-for-polling"

# entrypoint-check.sh refuses to start Jenkins at all if those two
# variables aren't set — checked BEFORE Jenkins boots, not via the
# init.groovy.d script alone: an exception thrown there gets logged and
# ignored, not treated as a boot failure, so Jenkins would otherwise come
# up wide open with no auth configured. Verified this the hard way.
COPY entrypoint-check.sh /usr/local/bin/entrypoint-check.sh
RUN chmod +x /usr/local/bin/entrypoint-check.sh
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint-check.sh"]

USER root
