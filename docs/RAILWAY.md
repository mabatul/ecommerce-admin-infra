# `dev` environment: DynamoDB Local on Railway

Railway doesn't have DynamoDB as a native database (it offers Postgres/
MySQL/MongoDB/Redis). To keep the backend unchanged across environments, we
deploy [`amazon/dynamodb-local`](https://hub.docker.com/r/amazon/dynamodb-local)
— AWS's open-source engine that simulates the DynamoDB API — as just
another Docker service inside the Railway project.

## 1. Create the service on Railway

1. In the Railway project: **New** → **Empty Service** (or **Docker Image**).
2. Image: `amazon/dynamodb-local:latest`.
3. Port: `8000` (the one the image exposes).
4. Suggested name: `dynamodb-local`.
5. **Do not generate a public domain.** DynamoDB Local has no authentication:
   anyone who can reach it can read and overwrite every table. Keep it on the
   project's private network and point the backend at its internal address.

## 2. Create the tables

**Automatic:** the backend service's **Pre-deploy command** is
`npm run init-tables` (Settings → Deploy). It runs on every deploy, inside the
private network, and creates any missing table, so you don't need to expose the
database to do it. The backend's `railway.json` declares it too, but Railway
doesn't apply `railway.json` to a service that already exists — set it in the
service settings, then trigger a *new* deployment (a plain "redeploy" replays
the old settings).
Deploying the backend (after the variables in step 3 are set) is enough. The
data survives restarts if you attach a volume (see
[Persistence](#persistence)); without one, a restart leaves the database empty
and the next backend deploy recreates the tables, after which you re-seed.

**Manual alternative**, only if you need to do it by hand:

DynamoDB Local doesn't understand CloudFormation/IAM/SSM — only the
DynamoDB API. Tables are created with
[`../scripts/railway-dynamodb-init.sh`](../scripts/railway-dynamodb-init.sh):

```bash
AWS_ENDPOINT_URL=https://<service-domain>.railway.app \
ENVIRONMENT=dev PROJECT_NAME=ecommerce-admin \
./scripts/railway-dynamodb-init.sh
```

It's idempotent — running it again doesn't fail if the tables already
exist. Run it once by hand after creating the service; the CI/CD workflows
don't call it automatically.

## 3. Configure the backend

On the backend's Railway service (repo `ecommerce-admin-backend`),
environment variables:

```env
ENVIRONMENT=dev
PROJECT_NAME=ecommerce-admin
AWS_REGION=us-east-1
AWS_ENDPOINT_URL=<internal-or-public-url-of-the-dynamodb-local-service>
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local
ADMIN_API_KEY=<a long random secret>
```

`ADMIN_API_KEY` is **required** outside `ENVIRONMENT=local`: without it every
admin route answers `503`. Generate something long and random (for example
`openssl rand -base64 32`), keep it only in Railway's variables and a password
manager, and type it into the admin dashboard's sign-in page. The public
storefront routes don't use it.

Nothing else changes — it's exactly the same mechanism as `local`
(`AWS_ENDPOINT_URL` pointing at a simulator instead of real AWS), just that
here the simulator lives on Railway instead of your local Docker.

> **Careful with the CLI:** `railway domain --service dynamodb-local` doesn't
> just list domains — it **creates** a public one if none exists. Since DynamoDB
> Local has no authentication, that would expose the whole database. Check
> domains with the dashboard or a GraphQL `domains` query instead.

## 4. Add the storefront service

The customer shop is a separate Railway service in the **same project**:

1. **New** → **GitHub Repo** → `ecommerce-storefront`, named
   `ecommerce-storefront` (the CI's `--service` flag uses that name).
2. Variables: `NEXT_PUBLIC_API_URL=<the backend's public URL>` (also set as
   the `NEXT_PUBLIC_API_URL` *repository variable* on GitHub, because it is
   baked into the build). Optionally `API_URL=<the backend's private URL>` so
   server-side rendering stays on Railway's private network.
3. **Settings → Networking → Generate Domain** for the public URL.

The storefront needs no secrets. Its health check is `/health`, which does not
call the backend; it works because the app listens on the `PORT` Railway
injects (the backend and dashboard don't, which is why they have no health
check). For CI deploys, create a **Project Token** (project → Settings →
Tokens) and store it as the `RAILWAY_TOKEN` secret of the storefront repo.

## Rollout order when adding the admin key

The admin dashboard and the backend deploy independently, but neither works
with the other's *old* version: a backend from before the key existed doesn't
allow the `Authorization` header in CORS (so the new dashboard is blocked by
the browser), and the new backend answers `401` to the old dashboard. Move
them together, backend first:

1. Set `ADMIN_API_KEY` on the backend service in Railway (harmless to the old
   code; it just redeploys).
2. Deploy the backend.
3. Deploy the admin dashboard straight after. Until it's live the old
   dashboard gets `401`s — a few minutes of downtime.
4. Open the dashboard and sign in with the key.

## Persistence

Left alone, `dynamodb-local` writes its database file inside the container's own
filesystem, so every restart or redeploy wipes the data. To keep it, on the
`dynamodb-local` service:

1. Attach a **volume** mounted at `/data`.
2. Set the variable `RAILWAY_RUN_UID=0` (the image runs as a non-root user, which
   cannot write to a freshly mounted volume).
3. Set the start command to
   `java -jar DynamoDBLocal.jar -sharedDb -dbPath /data`.

Tables are created by the backend's pre-deploy command, and the sample data is
loaded with the seed script through the admin API (the database itself is only
reachable from inside the private network):

```bash
cd ecommerce-admin-backend
API_URL=https://<backend-domain> ADMIN_API_KEY=<key> npm run seed:remote
```

It is idempotent, so it is also the way to restore the sample data after
changing it in the dashboard.

## Differences to keep in mind

- A single volume-backed container is not a production database: no
  replication, no backups, and downtime while it restarts. Fine for `dev`;
  real AWS (via [`../infrastructure/cloudformation/main.yaml`](../infrastructure/cloudformation/main.yaml))
  is the answer for `prod`.
- No S3, IAM, or SSM simulated in `dev` — if the backend ever needs one of
  those services in `dev`, it has to be solved separately (Railway has its
  own object storage via plugins, it's not AWS S3).
- This is a development/staging environment, not a substitute for final
  validation against real AWS before `prod` (same principle as with
  LocalStack, see [`LOCALSTACK.md`](LOCALSTACK.md)).
