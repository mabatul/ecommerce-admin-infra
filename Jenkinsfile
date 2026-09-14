// Pipeline for THIS repo only (infra) — doesn't build/deploy backend or
// frontend, each has its own Jenkinsfile. Not the active CI (see
// .github/workflows/ci.yml); kept for a Jenkins with real resources.
// The smoke-test stages need Docker (only true on the local Jenkins);
// scripts/ci-deploy-local.sh skips itself if Docker isn't available.
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
      environment { HEALTH_CHECK_HOST = 'host.docker.internal' }
      steps { sh './scripts/ci-deploy-local.sh health' }
    }

    // Placeholder — needs real AWS credentials before enabling.
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
