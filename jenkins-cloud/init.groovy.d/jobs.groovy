// Runs once on startup. Creates a single Multibranch Pipeline job, for
// THIS repo (infra) only — pointed at the real GitHub repo (public, so no
// credentials needed for checkout).
//
// backend/frontend used to get their own jobs here too, but this Jenkins
// runs on Railway's free tier (512MB) and even just indexing all 3 repos
// at boot — no builds, just git clone/fetch — was enough to OOM-kill the
// whole container (verified live, twice). Their CI moved to GitHub
// Actions instead (.github/workflows/ci.yml in each repo) — free and
// unlimited for public repos, with far more headroom than this instance
// has. See ecommerce-admin-infra/jenkins-cloud/README.md.
//
// Multibranch means every branch in the repo gets its own sub-job here,
// built automatically. New/removed branches are picked up:
//   - immediately, via a GitHub webhook hitting this Jenkins' plain
//     /git/notifyCommit endpoint (provided by the git plugin itself — no
//     extra plugin needed; see this repo's GitHub Settings -> Webhooks);
//   - as a fallback, in case a webhook delivery is ever missed or the hook
//     gets deleted, once a day via the PeriodicFolderTrigger below.
//
// Idempotent: skips creation if the job already exists, so redeploys
// don't touch it if you've since edited it by hand in the UI.
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
  // The plain constructor above doesn't come with any discovery trait —
  // without this, branch indexing runs but finds nothing (verified the
  // hard way: indexing log said "SUCCESS" with zero branches discovered).
  source.setTraits([new BranchDiscoveryTrait()])
  project.getSourcesList().add(new BranchSource(source))

  // Fallback re-scan — see the header comment above. Harmless to also
  // have this even when the webhook is working fine.
  project.addTrigger(new PeriodicFolderTrigger('1d'))

  project.save()
  project.scheduleBuild2(0)
  println("[jobs.groovy] created multibranch ${name} -> ${url}")
}

instance.save()
