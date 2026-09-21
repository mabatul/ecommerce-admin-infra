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
5. Generate a public domain (or keep it on the project's private network
   only if the backend lives in the same Railway project — simpler, and it
   doesn't expose the database to the internet).

## 2. Create the tables

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

## 4. Add the storefront service

The customer shop is a separate Railway service in the **same project**:

1. **New** → **GitHub Repo** → `ecommerce-storefront`, named
   `ecommerce-storefront` (the CI's `--service` flag uses that name).
2. Variables: `NEXT_PUBLIC_API_URL=<the backend's public URL>` (also set as
   the `NEXT_PUBLIC_API_URL` *repository variable* on GitHub, because it is
   baked into the build). Optionally `API_URL=<the backend's private URL>` so
   server-side rendering stays on Railway's private network.
3. **Settings → Networking → Generate Domain** for the public URL.

The storefront needs no secrets. The health check is `/health`, which does
not call the backend.

## Rollout order when adding the admin key

The admin dashboard and the backend deploy independently, so order matters or
the live dashboard is locked out:

1. Deploy the admin dashboard (it sends the key when one is stored; harmless
   against a backend that doesn't check yet).
2. Set `ADMIN_API_KEY` on the backend service in Railway.
3. Deploy the backend.
4. Open the dashboard and sign in with the key.

## Differences to keep in mind

- No guaranteed persistence unless you attach a volume to `dynamodb-local`
  on Railway — by default it keeps data in memory and loses everything on
  container restart. If `dev` needs real persistence, add a volume and run
  the image with `-dbPath` (see the
  [image's README](https://hub.docker.com/r/amazon/dynamodb-local)).
- No S3, IAM, or SSM simulated in `dev` — if the backend ever needs one of
  those services in `dev`, it has to be solved separately (Railway has its
  own object storage via plugins, it's not AWS S3).
- This is a development/staging environment, not a substitute for final
  validation against real AWS before `prod` (same principle as with
  LocalStack, see [`LOCALSTACK.md`](LOCALSTACK.md)).
