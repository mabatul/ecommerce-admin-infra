// Runs once on startup. Creates the 3 pipeline jobs pointing at the real
// GitHub repos (public, so no credentials needed for checkout) — unlike
// the local Jenkins, which points at file:// mounts of your own machine.
// Idempotent: skips any job that already exists, so redeploys don't touch
// jobs you've since edited by hand in the UI.
import jenkins.model.*
import org.jenkinsci.plugins.workflow.job.WorkflowJob
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition
import hudson.plugins.git.GitSCM
import hudson.plugins.git.UserRemoteConfig
import hudson.plugins.git.BranchSpec

def instance = Jenkins.get()

def repos = [
  'ecommerce-admin-infra'   : 'https://github.com/mabatul/ecommerce-admin-infra.git',
  'ecommerce-admin-backend' : 'https://github.com/mabatul/ecommerce-admin-backend.git',
  'ecommerce-admin-frontend': 'https://github.com/mabatul/ecommerce-admin-frontend.git',
]

repos.each { name, url ->
  if (instance.getItem(name) != null) {
    println("[jobs.groovy] ${name} already exists, skipping.")
    return
  }

  def job = instance.createProject(WorkflowJob.class, name)

  def remoteConfig = new UserRemoteConfig(url, null, null, null)
  def scm = new GitSCM(
    [remoteConfig],
    [new BranchSpec('*/main')],
    false, [],
    null, null, []
  )

  job.setDefinition(new CpsScmFlowDefinition(scm, 'Jenkinsfile'))
  job.save()
  println("[jobs.groovy] created ${name} -> ${url}")
}

instance.save()
