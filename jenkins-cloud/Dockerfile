# Jenkins for hosting on Railway — no Docker daemon available (pipeline
# stages that build images skip themselves), real login, jobs point at
# the real GitHub repos instead of local file:// mounts.
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

# basic-security.groovy sets up real auth. NOTIFY_COMMIT_ACCESS_CONTROL
# lets the GitHub webhook trigger a branch re-scan anonymously without
# opening anything else up — see jenkins-cloud/README.md.
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false -Dhudson.plugins.git.GitStatus.NOTIFY_COMMIT_ACCESS_CONTROL=disabled-for-polling"

# Refuses to boot without admin creds set — see entrypoint-check.sh.
COPY entrypoint-check.sh /usr/local/bin/entrypoint-check.sh
RUN chmod +x /usr/local/bin/entrypoint-check.sh
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint-check.sh"]

USER root
