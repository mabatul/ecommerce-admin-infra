# Jenkins with what's needed to run this repo's Jenkinsfile:
#   - Docker CLI + compose plugin (Docker-outside-of-Docker: talks to the
#     HOST's Docker via the socket mounted in docker-compose.jenkins.yml,
#     doesn't run its own daemon)
#   - Node.js 20 (npm ci / npm run lint / npm run build for backend and frontend)
#   - Python3 + cfn-lint (validate infrastructure/cloudformation/main.yaml)
FROM jenkins/jenkins:lts-jdk17

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg python3 python3-pip \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && pip3 install --no-cache-dir --break-system-packages cfn-lint \
    && rm -rf /var/lib/apt/lists/*

COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

# - runSetupWizard=false: skips the setup wizard entirely, this Jenkins
#   starts with no login at all. Fine for local-only dev (see
#   jenkins/README.md), NOT how to run a Jenkins reachable from outside
#   your machine.
# - GitSCM.ALLOW_LOCAL_CHECKOUT=true: the Git plugin refuses file:// remotes
#   by default (treats them as a path-traversal risk). Our jobs point at
#   file:///home/jenkins/source-* on purpose (see docker-compose.jenkins.yml)
#   since these repos aren't pushed anywhere yet — safe here because it's
#   this same container's own read-only mounts, not an arbitrary path an
#   untrusted Jenkinsfile author could control.
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false -Dhudson.plugins.git.GitSCM.ALLOW_LOCAL_CHECKOUT=true"

# Runs as root so it can use the host's Docker socket without having to
# match GIDs between the host (Windows, no unix GIDs) and the container.
# Acceptable for local dev Jenkins; don't do this for a shared/exposed one.
USER root
