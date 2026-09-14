// Creates the Multibranch Pipeline job for this repo (infra only —
// backend/frontend CI moved to GitHub Actions, see README.md). Idempotent.
import jenkins.model.*
import jenkins.branch.BranchSource
import jenkins.plugins.git.GitSCMSource
import jenkins.plugins.git.traits.BranchDiscoveryTrait
import org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject
import com.cloudbees.hudson.plugins.folder.computed.PeriodicFolderTrigger

def instance = Jenkins.get()

def name = 'ecommerce-admin-infra'
def url = 'https://github.com/mabatul/ecommerce-admin-infra.git'

if (instance.getItem(name) != null) {
  println("[jobs.groovy] ${name} already exists, skipping.")
} else {
  def project = instance.createProject(WorkflowMultiBranchProject.class, name)

  def source = new GitSCMSource(url)
  // Needs an explicit discovery trait or indexing finds zero branches.
  source.setTraits([new BranchDiscoveryTrait()])
  project.getSourcesList().add(new BranchSource(source))

  // Daily fallback re-scan in case the GitHub webhook misses a push.
  project.addTrigger(new PeriodicFolderTrigger('1d'))

  project.save()
  project.scheduleBuild2(0)
  println("[jobs.groovy] created multibranch ${name} -> ${url}")
}

instance.save()
