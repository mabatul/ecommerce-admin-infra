// Runs once on startup. Creates 3 Multibranch Pipeline jobs (one per repo),
// each pointed at the real GitHub repo (public, so no credentials needed
// for checkout) — unlike the local Jenkins, which points at file://
// mounts of your own machine and only ever builds whatever branch happens
// to be checked out there.
//
// Multibranch means every branch that exists in the repo gets its own
// sub-job here, built automatically. New/removed branches are picked up:
//   - immediately, via a GitHub webhook hitting this Jenkins' plain
//     /git/notifyCommit endpoint (provided by the git plugin itself — no
//     extra plugin needed; see each repo's GitHub Settings -> Webhooks);
//   - as a fallback, in case a webhook delivery is ever missed or the hook
//     gets deleted, once a day via the PeriodicFolderTrigger below.
//
// Whether a branch actually deploys anywhere is controlled per-Jenkinsfile
// with `when { branch 'main' }` around the deploy stage — see
// ecommerce-admin-backend/Jenkinsfile and
// ecommerce-admin-frontend/Jenkinsfile. Every other branch still builds,
// lints and runs the smoke test, it just never touches Railway.
//
// Idempotent: skips any job that already exists, so redeploys don't touch
// jobs you've since edited by hand in the UI.
import jenkins.model.*
import jenkins.branch.BranchSource
import jenkins.plugins.git.GitSCMSource
import jenkins.plugins.git.traits.BranchDiscoveryTrait
import org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject
import com.cloudbees.hudson.plugins.folder.computed.PeriodicFolderTrigger

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
