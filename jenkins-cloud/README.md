# Jenkins on Railway (public instance)

A second Jenkins, separate from the local one (`../jenkins/`), meant to be
reachable by other people — with real login and no Docker daemon (Railway
doesn't give containers access to a host Docker socket, unlike your own
machine).

## What's different from the local Jenkins

| | Local (`../jenkins/`) | Cloud (this one) |
|---|---|---|
| Reachable by | only you, on your machine | anyone with the URL |
| Login | none, on purpose | real user/password |
| Docker | yes (Docker-outside-of-Docker) | no |
| Jobs point at | `file:///home/jenkins/source-*` (your local checkout) | the real GitHub repos |
| Job type | plain Pipeline, single branch (whatever's checked out locally) | Multibranch — every branch in the repo gets its own sub-job, built automatically on push |
| infra job's smoke test | runs for real (builds/runs LocalStack) | skipped — only `cfn-lint` runs (see the Jenkinsfiles: the Docker check lives in `scripts/ci-deploy-local.sh` itself and exits 0 if `docker` isn't found) |
| backend/frontend jobs | same as cloud, but deploy manually via "Build Now" | build, lint, deploy — deploy to Railway only fires on `main` (`when { branch 'main' }`), other branches stop after the smoke test |

## 1. Create the service on Railway

1. New Project (or an existing one) → **New** → **GitHub Repo** →
   `mabatul/ecommerce-admin-infra`.
2. **Settings** → **Root Directory**: `jenkins-cloud`. This makes Railway
   read `jenkins-cloud/railway.json` and build `jenkins-cloud/Dockerfile`
   with that folder as build context — matters because the `COPY` lines in
   the Dockerfile use paths relative to it (`plugins.txt`, not
   `jenkins-cloud/plugins.txt`).
3. **Settings** → **Networking** → **Generate Domain**. This is the public
   URL — note it down, you'll need it for step 3 below.

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

The 3 jobs (`ecommerce-admin-infra`, `-backend`, `-frontend`) are created
automatically on first boot by `init.groovy.d/jobs.groovy`, pointed at the
real GitHub repos, as **Multibranch Pipelines** — nothing to configure by
hand. Each branch that exists in a repo gets built (lint/build/smoke test);
only `main` actually deploys, in the backend/frontend jobs.

## 5. Configure the GitHub webhooks (so pushes trigger builds automatically)

Without this, new/changed branches are only picked up once a day (the
`PeriodicFolderTrigger` fallback in `jobs.groovy`). For each of the 3
repos, add a webhook:

**GitHub repo → Settings → Webhooks → Add webhook**

| Field | Value |
|---|---|
| Payload URL | `<your Jenkins domain>/git/notifyCommit?url=<the repo's .git URL>` |
| Content type | `application/json` |
| Events | Just the push event |

Example for the backend repo, once your Jenkins domain is known:
`https://ecommerce-admin-infra-production.up.railway.app/git/notifyCommit?url=https://github.com/mabatul/ecommerce-admin-backend.git`

This hits the plain git plugin's `/git/notifyCommit` endpoint (no extra
plugin needed) — it re-scans the matching Multibranch job for
new/removed/updated branches as soon as GitHub calls it.

## 6. Configure the Railway deploy credentials (for backend/frontend jobs)

Same as the local Jenkins — see
`../ecommerce-admin-backend/README.md` / `../ecommerce-admin-frontend/README.md`,
"Deployment" section: a **Secret text** credential per repo
(`railway-token-backend`, `railway-token-frontend`), each a Railway
Project Token for that service. Add them here, in this Jenkins' own
**Manage Jenkins → Credentials**, not the local one — they're separate
instances with separate credential stores.

## Inviting other people

Whoever you give the URL and login to can see and run all 3 jobs. This
Jenkins uses "full control once logged in" (any authenticated user has
full access) — there's no per-user restriction. If that's ever a problem,
swap `FullControlOnceLoggedInAuthorizationStrategy` in
`init.groovy.d/basic-security.groovy` for a matrix-based strategy (needs
adding the `matrix-auth` plugin to `plugins.txt`).
