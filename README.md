# ecommerce-admin-infra

Infrastructure and architecture documentation for the **ecommerce-admin**
admin panel. This repo has no application code — it defines how the
infrastructure (DynamoDB, S3, IAM, SSM) is created and how the project's
other two repos connect to each other.

## The three repos

| Repo | Contents |
|---|---|
| **ecommerce-admin-infra** (this one) | CloudFormation, LocalStack, deployment scripts, local dev docker-compose, architecture docs |
| [ecommerce-admin-backend](../ecommerce-admin-backend) | Next.js API. Reads/writes the DynamoDB tables defined here via environment variables — no infrastructure config hardcoded |
| [ecommerce-admin-frontend](../ecommerce-admin-frontend) | Next.js dashboard. Consumes the backend's API over HTTP; never talks to AWS/LocalStack directly |

```
┌─────────────────────┐      HTTP       ┌─────────────────────┐
│ ecommerce-admin-     │ ───────────────▶│ ecommerce-admin-     │
│ frontend             │                  │ backend               │
│ (dashboard)          │◀─────────────────│ (API)                 │
└─────────────────────┘                  └───────────┬───────────┘
                                                       │ AWS SDK
                                                       │ (AWS_ENDPOINT_URL)
                                          ┌────────────▼────────────┐
                                          │ DynamoDB / S3 / IAM / SSM │
                                          │ (this repo: infra)        │
                                          │  local  -> LocalStack     │
                                          │  dev    -> Railway        │
                                          │           (DynamoDB Local)│
                                          │  prod   -> real AWS       │
                                          └───────────────────────────┘
```

The backend never knows whether it's talking to LocalStack, DynamoDB Local
on Railway, or real AWS — it's all driven by a single environment variable,
`AWS_ENDPOINT_URL` (empty = real AWS). See
`ecommerce-admin-backend/lib/aws/config.ts`.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/)
- Node.js 20+ (optional, only if you want to run something outside Docker)

No AWS CLI or AWS account needed for local development.

## Bringing up the full local environment

Each repo starts **independently** — this repo doesn't build or start
backend/frontend, and they don't know how infra is built. Clone the 3 repos
as sibling folders:

```bash
git clone <infra-url> ecommerce-admin-infra
git clone <backend-url> ecommerce-admin-backend
git clone <frontend-url> ecommerce-admin-frontend
```

**1. Infrastructure first**, from `ecommerce-admin-infra`:

```bash
cp .env.example .env.local
docker compose up
```

Brings up LocalStack and deploys the CloudFormation stack on its own (via
the `ready.d` hook) — nothing else. Once
[http://localhost:4566/_localstack/health](http://localhost:4566/_localstack/health)
responds, the infrastructure is ready.

**2. Backend**, independently, from `ecommerce-admin-backend`:

```bash
docker compose up
```

Reaches LocalStack via `host.docker.internal:4566` (see that repo's
README). Once up: http://localhost:4000/api/health.

**3. Frontend**, independently, from `ecommerce-admin-frontend`:

```bash
docker compose up
```

Once up: http://localhost:3000.

**4. Load sample data**, back in `ecommerce-admin-infra` (needs the backend
container from step 2 running):

```bash
./scripts/seed-local.sh
```

**Shortcut for step 1** (start LocalStack + wait for the stack, nothing
more — steps 2-4 are still separate, on purpose):

```bash
./scripts/deploy-local.sh
```

Verify everything is responding (checks all three, wherever they were
started from):

```bash
./scripts/health-check.sh
```

## CI/CD: Jenkins locally, one job per repo

See [`jenkins/README.md`](jenkins/README.md) — a single local Jenkins
instance, but with an independent job per repo (each reading its own
`Jenkinsfile`), so each service builds/tests/deploys on its own instead of
through one shared pipeline.

## Environments

| Environment | Where compute runs | Where the data lives |
|---|---|---|
| `local` | Docker, on your machine | LocalStack (this repo) |
| `dev` | Railway (backend/frontend repos, each with its own deploy) | DynamoDB Local, as a Docker service on Railway — see below |
| `prod` | To be defined | Real AWS (same `infrastructure/cloudformation/main.yaml`) |

### `dev`: DynamoDB Local on Railway

Railway doesn't offer DynamoDB as a native database (it has Postgres/MySQL/
Mongo/Redis). Instead, we deploy
[`amazon/dynamodb-local`](https://hub.docker.com/r/amazon/dynamodb-local)
as just another Docker service inside the Railway project — the backend
still talks to it with the same AWS SDK, only `AWS_ENDPOINT_URL` changes to
the internal URL Railway assigns that service.

Important difference from `local`/`prod`: DynamoDB Local **doesn't**
understand CloudFormation, IAM, or SSM — it only simulates the DynamoDB
API. So in `dev` the tables aren't created with
`infrastructure/cloudformation/main.yaml`, but with
[`scripts/railway-dynamodb-init.sh`](scripts/railway-dynamodb-init.sh),
which creates them directly via AWS CLI/SDK. Step-by-step guide:
[`docs/RAILWAY.md`](docs/RAILWAY.md).

## Structure

```
infrastructure/cloudformation/main.yaml   Shared template (local/prod)
docker/Dockerfile.localstack               LocalStack with the stack baked in
docker-compose.yml                          LocalStack only — nothing else
scripts/                                    Deployment, seed, health-check
jenkins/                                    Local Jenkins (one job per repo)
docs/LOCALSTACK.md                          LocalStack parity per service
docs/RAILWAY.md                             DynamoDB Local on Railway, step by step
```

See also [`infrastructure/README.md`](infrastructure/README.md) for the
details of what the template creates.
