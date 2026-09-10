// Pipeline for THIS repo only (infra). Doesn't build or deploy
// backend/frontend — only validates the infrastructure and, if Docker is
// available, runs an end-to-end smoke test against a real LocalStack.
// Each repo (backend, frontend) has its own Jenkinsfile with its own
// Railway deploy — see jenkins/README.md (local) for how they're
// registered as independent jobs.
//
// The smoke-test stages need a real Docker daemon (they build and run
// LocalStack + backend containers) — that's only true on the LOCAL
// Jenkins (Docker-outside-of-Docker, see jenkins/README.md). On the
// Railway-hosted Jenkins (see jenkins-cloud/) there's no Docker daemon
// available; ci-deploy-local.sh itself checks for `docker` and exits 0
// without doing anything if it's missing, so those stages show as passed
// (with a "skipping" line in their log) instead of failing — only
// cfn-lint actually runs there. (Tried gating this with the stages'
// `when { expression { sh(...) == 0 } } }` first — that didn't reliably
// skip the stage, so the check lives in the script itself instead.)
pipeline {
  agent any

  environment {
    PROJECT_NAME = 'ecommerce-admin'
    AWS_REGION   = 'us-east-1'
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Validate CloudFormation') {
      steps {
        sh 'cfn-lint infrastructure/cloudformation/main.yaml'
      }
    }

    stage('Deploy to LocalStack (smoke test)') {
      steps { sh './scripts/ci-deploy-local.sh smoke' }
    }

    stage('Health check') {
      // Checks only what this pipeline itself brought up (LocalStack
      // always; backend only if the smoke test actually ran — see
      // ci-deploy-local.sh). Not scripts/health-check.sh: that one assumes
      // backend/frontend are on your own machine's localhost, which isn't
      // true inside this container (Docker-outside-of-Docker) or when the
      // sibling repos aren't part of this job's isolated workspace.
      environment { HEALTH_CHECK_HOST = 'host.docker.internal' }
      steps { sh './scripts/ci-deploy-local.sh health' }
    }

    // Placeholder: deploy to real AWS (prod). Needs credentials/account
    // defined before enabling it — see README.md, environments table.
    stage('Deploy to AWS (prod)') {
      when { expression { return false } }
      steps {
        sh 'echo "TODO: ENVIRONMENT=prod ./scripts/deploy-infrastructure.sh"'
      }
    }
  }

  post {
    failure {
      sh '''
        if command -v docker >/dev/null 2>&1; then
          ./scripts/ci-teardown.sh
        fi
      '''
    }
  }
}
