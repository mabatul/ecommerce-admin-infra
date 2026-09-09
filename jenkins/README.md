# Local Jenkins

A single Jenkins instance running in Docker, with **one job per repo** —
not one pipeline that does everything. Each repo builds, tests, and deploys
independently, with its own parameters:

| Job | Reads the Jenkinsfile from | What it does |
|---|---|---|
| `ecommerce-admin-infra` | this repo | validates CloudFormation, smoke test against LocalStack |
| `ecommerce-admin-backend` | `../ecommerce-admin-backend` | lint, build, deploy to Railway |
| `ecommerce-admin-frontend` | `../ecommerce-admin-frontend` | lint, build, deploy to Railway |

## Why a single instance (and not 3 Jenkins servers)

For local development there's no point spinning up 3 full Jenkins servers.
What matters is that each **pipeline** is independent — every repo defines
its own `Jenkinsfile`, with its own stages, credentials, and deploy
parameters — and that's achieved with 3 *jobs* on one instance, not 3
instances.

## How it talks to the host's Docker

Same as before: the Jenkins container uses the host's Docker socket
(`/var/run/docker.sock`, Docker-outside-of-Docker). That's why the `infra`
pipeline uses `scripts/ci-deploy-local.sh` (plain build/run) instead of
`docker compose` — the normal `docker-compose.yml`'s relative paths don't
resolve correctly when the `docker` client itself runs inside another
container.

## 1. Bring up Jenkins

Assuming the 3 repos are cloned as siblings (see root README):

```bash
docker compose -f docker-compose.jenkins.yml up -d --build
```

Go to **http://localhost:8080** (no login, on purpose — this Jenkins is
100% local, see the security note in the `Dockerfile`).

## 2. Create the 3 jobs

Repeat for each repo, changing the name and the `Repository URL`:

| Job | Repository URL |
|---|---|
| `ecommerce-admin-infra` | `file:///home/jenkins/source-infra` |
| `ecommerce-admin-backend` | `file:///home/jenkins/source-backend` |
| `ecommerce-admin-frontend` | `file:///home/jenkins/source-frontend` |

Steps (per job):

1. **New Item** → name from the table above → type **Pipeline** → OK.
2. **Pipeline** → Definition: **Pipeline script from SCM**.
3. SCM: **Git** → the matching Repository URL.
4. Branch Specifier: `*/master`.
5. Script Path: `Jenkinsfile` (default).
6. **Save**.

## 3. Run each one

Each job is triggered independently with **Build Now** — running just
`ecommerce-admin-backend`, for example, doesn't touch infra or frontend.
Nicer visual view: **http://localhost:8080/blue**.

## Updating the code Jenkins sees

Each `Repository URL` is a read-only bind-mount of the corresponding repo's
real folder — Jenkins sees your commits as soon as you make them in
**any** of the 3 repos, no rebuild needed. You just need to have committed
(a dirty working tree isn't reflected).

## Bringing Jenkins down

```bash
docker compose -f docker-compose.jenkins.yml down       # keeps jobs/history
docker compose -f docker-compose.jenkins.yml down -v     # start from scratch
```
