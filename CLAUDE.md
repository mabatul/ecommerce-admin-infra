# CLAUDE.md

Context for Claude Code (or any AI assistant) working in this repo.

## What this repo is

`ecommerce-admin-infra` is one of **three independent repos** that make up
the ecommerce-admin project:

- **ecommerce-admin-infra** (this repo) — infrastructure only. No
  application code. Defines the CloudFormation template (DynamoDB, S3, IAM,
  SSM), the LocalStack setup (`docker-compose.yml`, LocalStack only),
  deployment scripts, and Jenkins.
- **ecommerce-admin-backend** — Next.js API. Lives in a sibling folder,
  `../ecommerce-admin-backend`. Starts on its own, with its own
  `docker-compose.yml`.
- **ecommerce-admin-frontend** — Next.js dashboard. Lives in a sibling
  folder, `../ecommerce-admin-frontend`. Same — starts on its own.

They're meant to be cloned as sibling directories, but this repo's
`docker-compose.yml` does **not** build or reference the other two — it
only brings up LocalStack. `docker-compose.jenkins.yml` still mounts the
sibling repos (read-only, for the Jenkins jobs), and
`scripts/ci-deploy-local.sh` still references
`../ecommerce-admin-backend` for its optional CI smoke test — those are the
only two places this repo knows the siblings exist, and both are CI/tooling
concerns, not runtime orchestration.

## Key design decisions (don't undo these without a reason)

- **Each repo starts independently.** `docker compose up` in this repo
  brings up LocalStack only. Backend and frontend are started separately,
  from their own repos, each with its own `docker-compose.yml`. Backend
  reaches LocalStack via `host.docker.internal:4566` (LocalStack publishes
  4566 to the host, so any container can reach it that way, without a
  shared Docker network or this repo needing to build backend's image).
  `scripts/seed-local.sh` reaches the backend container by name
  (`docker exec ecommerce-admin-backend ...`), not via `docker compose
  exec`, for the same reason. Don't reintroduce `backend`/`frontend`
  services into this repo's `docker-compose.yml` — that's exactly the
  coupling this split was meant to remove.
- **One CloudFormation template, no forking per environment.** The same
  `infrastructure/cloudformation/main.yaml` deploys to LocalStack (`local`)
  and real AWS (`prod`), parameterized by `Environment`. If LocalStack can't
  handle something the template needs, document it in `docs/LOCALSTACK.md`
  instead of splitting the template.
- **`dev` runs on Railway, but Railway has no native DynamoDB.** We deploy
  `amazon/dynamodb-local` as a Docker service there instead. See
  `docs/RAILWAY.md` and `scripts/railway-dynamodb-init.sh`. DynamoDB Local
  doesn't understand CloudFormation/IAM/SSM, so `dev` tables are created by
  a plain AWS-CLI script, not by the shared template.
- **One Jenkins instance, one job per repo — not one shared pipeline.**
  Each repo has its own `Jenkinsfile` and deploys independently, with its
  own Railway credentials/parameters. See `jenkins/README.md`. Don't merge
  the three Jenkinsfiles back into one.
- **Docker-outside-of-Docker for the local Jenkins.** Jenkins here talks to
  the *host's* Docker daemon via a mounted socket. That means relative
  bind-mounts (like the normal `docker-compose.yml` uses) don't resolve
  correctly from inside a Jenkins-triggered build — `scripts/ci-deploy-local.sh`
  works around this by building images that bake the code in with `COPY`
  (`docker/Dockerfile.localstack`, and the sibling repos'
  `Dockerfile.ci`) instead of mounting it.
- **No app logic knows about AWS vs. LocalStack vs. Railway.** That
  distinction lives entirely in environment variables
  (`AWS_ENDPOINT_URL` etc.), resolved in
  `ecommerce-admin-backend/lib/aws/config.ts`. Don't add
  environment-specific branches anywhere else.

## Conventions across all three repos

- Documentation (README, docs/*) and code comments: **English**, even
  though conversations about this project may happen in Spanish.
- Commit messages: plain-language summaries of what changed (not
  Conventional Commits prefixes like `feat:`/`chore:`).
- Don't fabricate commit timestamps/history to make automated work look
  like it happened incrementally over time it didn't.

## Where to look for more detail

- `README.md` — architecture overview, how to bring up all three services locally.
- `infrastructure/README.md` — what the CloudFormation template creates.
- `docs/LOCALSTACK.md` — per-service LocalStack parity notes.
- `docs/RAILWAY.md` — DynamoDB Local on Railway, step by step.
- `jenkins/README.md` — local Jenkins setup, one job per repo.
