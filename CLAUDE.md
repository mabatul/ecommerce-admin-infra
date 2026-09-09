# CLAUDE.md

Context for Claude Code (or any AI assistant) working in this repo.

## What this repo is

`ecommerce-admin-infra` is one of **three independent repos** that make up
the ecommerce-admin project:

- **ecommerce-admin-infra** (this repo) — infrastructure only. No
  application code. Defines the CloudFormation template (DynamoDB, S3, IAM,
  SSM), the LocalStack setup, the local dev `docker-compose.yml` that
  orchestrates all three services, deployment scripts, and Jenkins.
- **ecommerce-admin-backend** — Next.js API. Lives in a sibling folder,
  `../ecommerce-admin-backend`.
- **ecommerce-admin-frontend** — Next.js dashboard. Lives in a sibling
  folder, `../ecommerce-admin-frontend`.

They're meant to be cloned as sibling directories. This repo's
`docker-compose.yml` and `docker-compose.jenkins.yml` reference
`../ecommerce-admin-backend` and `../ecommerce-admin-frontend` by relative
path (overridable via `BACKEND_PATH`/`FRONTEND_PATH`).

## Key design decisions (don't undo these without a reason)

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
  Conventional Commits prefixes like `feat:`/`chore:`), and they carry a
  `Co-Authored-By: Claude ...` trailer when Claude Code made the change —
  that trailer stays; it's a transparency requirement, not a style choice.
- Don't fabricate commit timestamps/history to make automated work look
  like it happened incrementally over time it didn't.

## Where to look for more detail

- `README.md` — architecture overview, how to bring up all three services locally.
- `infrastructure/README.md` — what the CloudFormation template creates.
- `docs/LOCALSTACK.md` — per-service LocalStack parity notes.
- `docs/RAILWAY.md` — DynamoDB Local on Railway, step by step.
- `jenkins/README.md` — local Jenkins setup, one job per repo.
