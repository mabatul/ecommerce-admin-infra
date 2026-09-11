// Runs once on startup. Creates a real admin user (unlike the local
// Jenkins, which intentionally has no auth at all — see
// ../../jenkins/Dockerfile) and requires login for everything.
//
// Reads credentials from environment variables so nothing is hardcoded
// here — set JENKINS_ADMIN_USER / JENKINS_ADMIN_PASSWORD as Railway
// variables before first boot. The real check for their presence is in
// ../entrypoint-check.sh, which stops the container before Jenkins even
// starts — an exception thrown from an init.groovy.d script gets logged
// and ignored, NOT treated as a boot failure, so Jenkins comes up wide
// open regardless. The check below is just a second line of defense /
// clearer log message; it should never actually be what stops this.
import jenkins.model.*
import hudson.security.*

def env = System.getenv()
def user = env['JENKINS_ADMIN_USER']
def pass = env['JENKINS_ADMIN_PASSWORD']

if (!user || !pass) {
  throw new IllegalStateException(
    "JENKINS_ADMIN_USER and JENKINS_ADMIN_PASSWORD must be set (Railway " +
    "service variables) before this Jenkins can start — refusing to boot " +
    "with no admin account configured."
  )
}

def instance = Jenkins.get()

def realm = new HudsonPrivateSecurityRealm(false)
realm.createAccount(user, pass)
instance.setSecurityRealm(realm)

def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
strategy.setAllowAnonymousRead(false)
instance.setAuthorizationStrategy(strategy)

// This instance runs on Railway's free tier (512MB) — two builds' worth
// of `npm ci`/git at once was enough to OOM-kill the whole container
// (verified live). One executor forces every build across all 3 jobs to
// run strictly one at a time.
instance.setNumExecutors(1)

instance.save()
