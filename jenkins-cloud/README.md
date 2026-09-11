# Jenkins on Railway (public instance) — parked

**Status: not currently running.** This was meant to be a second Jenkins,
separate from the local one (`../jenkins/`), reachable by other people with
real login. It doesn't work on Railway's **free tier**: verified live,
twice, that Jenkins itself plus this plugin set (git + workflow-aggregator,
the minimum for a Multibranch Pipeline) OOM-kills the whole 512MB
container just from booting and indexing **a single repo** — before
building anything, before backend/frontend were ever involved.

Real CI for all 3 repos now runs on **GitHub Actions** instead
(`.github/workflows/ci.yml` in each repo) — free and unlimited for public
repos, with far more headroom (2 vCPU / 7GB RAM per runner) than this
instance ever had. That's what actually builds, lints, smoke-tests and (for
backend/frontend) deploys to Railway on every push now. See each repo's
Actions tab on GitHub.

Everything below is kept as-is in case this project ever moves to a paid
Railway plan (Hobby's usage-based resources are enough for this — it's
specifically the free tier's fixed 512MB ceiling that doesn't fit). If you
do upgrade and want to bring this back:

## What's different from the local Jenkins

| | Local (`../jenkins/`) | Cloud (this one) |
|---|---|---|
| Reachable by | only you, on your machine | anyone with the URL |
| Login | none, on purpose | real user/password |
| Docker | yes (Docker-outside-of-Docker) | no |
| Jobs point at | `file:///home/jenkins/source-*` (your local checkout) | the real GitHub repo |
| Job type | plain Pipeline, single branch (whatever's checked out locally) | Multibranch — every branch gets its own sub-job, built automatically on push |

## 1. Create the service on Railway

1. New Project (or an existing one, **on a paid plan** — see the status
   note above) → **New** → **GitHub Repo** → `mabatul/ecommerce-admin-infra`.
2. **Settings** → **Root Directory**: `jenkins-cloud`. This makes Railway
   read `jenkins-cloud/railway.json` and build `jenkins-cloud/Dockerfile`
   with that folder as build context — matters because the `COPY` lines in
   the Dockerfile use paths relative to it (`plugins.txt`, not
   `jenkins-cloud/plugins.txt`).
3. **Settings** → **Networking** → **Generate Domain**. This is the public
   URL — note it down, you'll need it below.

## 2. Add a persistent volume

**Settings** → **Volumes** → **New Volume** → mount path `/var/jenkins_home`.

Without this, every redeploy wipes Jenkins' state (jobs, build history,
the admin account) and it all gets recreated from `init.groovy.d/` on next
boot — the jobs.groovy script is idempotent, so that part self-heals, but
build history wouldn't.

## 3. Set the required variables

**Settings** → **Variables**:

| Variable | Value |
|---|---|
| `JENKINS_ADMIN_USER` | pick one |
| `JENKINS_ADMIN_PASSWORD` | pick a real password — this becomes the login for a public URL |

`init.groovy.d/basic-security.groovy` refuses to boot without both set —
that's on purpose, so this never accidentally starts wide open.

## 4. Deploy

Push to `main` (or trigger a manual deploy from the Railway dashboard).
First build takes a few minutes. Once it's up, go to your Railway domain —
it should ask for login.

The `ecommerce-admin-infra` job is created automatically on first boot by
`init.groovy.d/jobs.groovy`, pointed at the real GitHub repo, as a
**Multibranch Pipeline** — nothing to configure by hand.

## 5. Configure the GitHub webhook (so pushes trigger a rescan automatically)

Without this, new/changed branches are only picked up once a day (the
`PeriodicFolderTrigger` fallback in `jobs.groovy`).

**GitHub repo (`ecommerce-admin-infra`) → Settings → Webhooks → Add webhook**

| Field | Value |
|---|---|
| Payload URL | `<your Jenkins domain>/git/notifyCommit?url=https://github.com/mabatul/ecommerce-admin-infra.git` |
| Content type | `application/json` |
| Events | Just the push event |

This hits the plain git plugin's `/git/notifyCommit` endpoint (no extra
plugin needed) — it re-scans the Multibranch job for new/removed/updated
branches as soon as GitHub calls it.

`hudson.plugins.git.GitStatus.NOTIFY_COMMIT_ACCESS_CONTROL=disabled-for-polling`
(set in the Dockerfile's `JAVA_OPTS`) is what lets this call in
anonymously — otherwise the git plugin's own token requirement blocks it,
and GitHub webhooks have no way to supply Basic Auth or a matching token
(verified live: embedding `user:token@` in the webhook URL gets silently
dropped by GitHub before the request is even sent).

## Inviting other people

Whoever you give the URL and login to can see and run the job. This
Jenkins uses "full control once logged in" (any authenticated user has
full access) — there's no per-user restriction. If that's ever a problem,
swap `FullControlOnceLoggedInAuthorizationStrategy` in
`init.groovy.d/basic-security.groovy` for a matrix-based strategy (needs
adding the `matrix-auth` plugin to `plugins.txt`).
