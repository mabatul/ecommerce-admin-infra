// Real admin login (unlike the local Jenkins) — creds from env vars,
// enforced first by entrypoint-check.sh (this check alone isn't enough,
// since a thrown exception here doesn't stop Jenkins from booting).
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

// Free tier (512MB) — forces builds to run one at a time.
instance.setNumExecutors(1)

instance.save()
