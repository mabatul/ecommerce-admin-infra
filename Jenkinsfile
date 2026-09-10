// Pipeline for THIS repo only (infra). Doesn't build or deploy
// backend/frontend — only validates the infrastructure and, if the sibling
// folders exist, runs an end-to-end smoke test against it. Each repo
// (backend, frontend) has its own Jenkinsfile with its own Railway deploy —
// see jenkins/README.md for how they're registered as independent jobs on
// the same local Jenkins instance.
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
      sh './scripts/ci-teardown.sh'
    }
  }
}
