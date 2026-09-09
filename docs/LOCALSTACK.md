# LocalStack notes and known differences from real AWS

LocalStack is not a 100%-faithful AWS reimplementation. This file lists,
per service, whether we use it locally, how, and what differs from real
AWS. Update it whenever a gap actually bites us during development.

| Service | Used locally? | Notes |
|---|---|---|
| **DynamoDB** | Yes | Full parity for the operations this project uses (GetItem/PutItem/Query/Scan/GSI). No known gaps so far. |
| **S3** | Yes | Object storage (PutObject/sync) works as expected. **Static website hosting** (the `WebsiteConfiguration` on `FrontendBucket`) is only reachable locally through LocalStack's path-style/virtual-host workaround (`http://<bucket>.s3-website.localhost.localstack.cloud:4566` or `s3.amazonaws.com/<bucket>`, depending on version) rather than the real AWS website-endpoint DNS pattern — don't rely on the LocalStack URL shape for anything user-facing; it exists to prove the sync step works, not to preview the real site. |
| **CloudFormation** | Yes | LocalStack Community supports the resource types this template uses (`DynamoDB::Table`, `S3::Bucket`, `IAM::Role`, `SSM::Parameter`). Drift detection, change sets, and stack policies are limited/absent — we only use `cloudformation deploy`, which is supported. |
| **IAM** | Yes (create-only) | Roles/policies are created and stored, but LocalStack Community **does not enforce** the policy document against API calls made with LocalStack's test credentials — anything succeeds regardless of the attached policy. Treat the `BackendExecutionRole` policy as the real, authoritative least-privilege definition; verify it actually restricts access **against real AWS**, not against LocalStack, before trusting it. |
| **SSM** | Yes | Parameter Store (`GetParameter`/`PutParameter`) works as expected for the simple String parameters this project uses. |
| **EC2** | No (AWS-only) | Only appears in the real-AWS deployment diagram. Not part of local dev — the backend runs as a Docker container instead. Will need its own validation pass against real AWS when the EC2/Jenkins deployment path is built out. |

## General rule

LocalStack is for local development, integration testing, and infrastructure
testing — not a substitute for a final validation against real AWS. Before
calling any environment "deployment complete," re-run the relevant checks
against dev/prod AWS directly (see `scripts/deploy-infrastructure.sh` with
`ENVIRONMENT=dev`).
