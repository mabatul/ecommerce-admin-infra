# infrastructure

CloudFormation template shared between LocalStack and real AWS. It's **the
same template** for both targets — the only thing that changes is the
`Environment` parameter and which endpoint `deploy` runs against. Don't
create a "LocalStack version" and an "AWS version": if something needs to
diverge, document it here and in
[`../docs/LOCALSTACK.md`](../docs/LOCALSTACK.md), don't fork the template.

## What `cloudformation/main.yaml` creates

| Resource | Type | Physical name |
|---|---|---|
| `UsersTable` | DynamoDB | `${ProjectName}-${Environment}-Users` |
| `CategoriesTable` | DynamoDB | `${ProjectName}-${Environment}-Categories` |
| `ProductsTable` (+ GSI `ByCategory`) | DynamoDB | `${ProjectName}-${Environment}-Products` |
| `CartsTable` | DynamoDB | `${ProjectName}-${Environment}-Carts` |
| `WishlistsTable` | DynamoDB | `${ProjectName}-${Environment}-Wishlists` |
| `FrontendBucket` | S3 (static hosting) | `${ProjectName}-${Environment}-frontend` |
| `BackendExecutionRole` | IAM Role | `${ProjectName}-${Environment}-backend-role` |
| 6 parameters | SSM Parameter Store | `/${ProjectName}/${Environment}/dynamodb/*-table`, `/${ProjectName}/${Environment}/s3/frontend-bucket` |

All names are derived from `ProjectName` + `Environment` — the backend
(repo `ecommerce-admin-backend`, in `lib/aws/config.ts`) computes the same
names from those two environment variables, so they never need to be
copied by hand from one repo to another.

## Parameters

| Parameter | Default | Allowed values |
|---|---|---|
| `ProjectName` | `ecommerce-admin` | any string |
| `Environment` | `local` | `local`, `dev`, `prod` |

## Deploying manually

Usually not needed — `docker compose up` (see this repo's root README)
does it for `local` automatically via
[`../scripts/localstack-init.sh`](../scripts/localstack-init.sh). To deploy
by hand (debugging, or `dev`/`prod`):

```bash
ENVIRONMENT=local ./scripts/deploy-infrastructure.sh
ENVIRONMENT=dev   ./scripts/deploy-infrastructure.sh
```

## Validating the template

```bash
pip install cfn-lint
cfn-lint infrastructure/cloudformation/main.yaml
```

## Known LocalStack limitations for these resources

See [`../docs/LOCALSTACK.md`](../docs/LOCALSTACK.md) — in short: DynamoDB
and SSM have full parity for what we use; S3 works but the website-hosting
URL differs from real AWS; IAM resources are created correctly but
LocalStack Community **does not enforce** the policies against test
credentials, so real permission validation has to happen against AWS.
