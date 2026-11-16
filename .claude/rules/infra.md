---
paths:
  - "infra/**"
  - "Dockerfile"
  - ".dockerignore"
  - ".github/**"
---

# Image, pipeline and infrastructure: toolchain facts

Checked against live sources on 2026-11-11. None of this had been run when it was written: the first build, the first `terraform plan` and the first pipeline run happen in this project. Where this file and your memory disagree, this file is right. Where it is silent, read the current documentation.

## Who runs what

- You write the files and run `terraform fmt`, `terraform validate` and, after asking, `terraform init` and `terraform plan`.
- The author runs `aws login`, `ssh-keygen`, `terraform apply` and `terraform destroy`, reads every plan before typing yes, enters the secret and the two variables in GitHub, and switches the registry package to public.
- You never read `~/.ssh` or `~/.aws`, never run an `aws` command and never print a secret. `terraform plan` can still work, because the provider reads the AWS session in its own process.
- Terraform runs only in the main checkout, never in a worktree: the state file lives in `infra/` there and nowhere else.

## The AWS account

- Region `eu-north-1`, assigned to the account and not changeable.
- The account cannot create IAM identity providers, so GitHub Actions cannot use OIDC to sign in to AWS. The design has no IAM resource at all, and the pipeline holds no AWS credentials.
- App Runner is not available. Young accounts are often refused load balancers and CloudFront distributions. API Gateway is inside the account's allow-list.
- CLI credentials come from `aws login` (AWS CLI 2.32.0 or later): a browser sign-in and a 12-hour session. The AWS provider reads such sessions from 6.23.0. If Terraform does not pick the session up, the documented fallback is a profile with `credential_process = aws configure export-credentials --profile <name> --format process`.

## Terraform

- Terraform on the 1.17 line and the AWS provider on 6.x (1.17.2 and 6.72.0 were the newest on 2026-11-11). `.terraform.lock.hcl` is committed. State files, `.terraform/` and `*.tfvars` are gitignored. State is a local file.
- One root module in `infra/`: `versions.tf`, `main.tf`, `variables.tf`, `outputs.tf`, `user-data.sh`. No child modules. About 90 lines of HCL.
- No VPC is named: the account's default VPC is used. If the account has none, `plan` fails at once and that is a stop-and-ask.
- The image comes from AWS's public parameter `/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64`. The instance sets `ignore_changes = [ami]`, or every new Amazon Linux image would replace the live instance.
- Instance: `t3.micro`; `credit_specification { cpu_credits = "standard" }` (T3 launches as `unlimited` by default); `metadata_options { http_tokens = "required" }`; `root_block_device { encrypted = true }`; `user_data_replace_on_change = true`.
- `aws_key_pair` takes an existing public key file. The private key never enters the repository or the state.
- Security group rules are separate resources, `aws_vpc_security_group_ingress_rule` and `aws_vpc_security_group_egress_rule`, never inline and never mixed with inline rules. Open: 80 and 22 inbound, everything outbound.
- `aws_eip` with `domain = "vpc"`; it exports `public_dns`.
- HTTPS: `aws_apigatewayv2_api` with `protocol_type = "HTTP"` and `target = "http://<the instance's public DNS name>"` is a "quick create". It makes the integration, a catch-all route and an auto-deploying default stage, and it exports `api_endpoint`. One variable switches it on or off. Limits: 30 seconds per request, 10 MB per payload.
- Provider `default_tags` put the project name on every resource.
- `user-data.sh` installs and enables Docker (`dnf install -y docker`) and nothing else.

## Dockerfile

- Base image `node:24.22.2-trixie-slim`, pinned by tag and digest and named once in an `ARG`. Debian 13 with glibc. `24-slim` still means Debian 12, so the Debian 13 variant has to be named. Alpine (musl) is an experimental platform for Node.
- Three stages at the repository root: build the backend, build the frontend, runtime. The runtime stage has `npm ci --omit=dev`, the backend's `dist/` and the frontend's build output as `public/`.
- `ENV NODE_ENV=production`, `USER node`, `EXPOSE 3000`, and `CMD ["node", "dist/main.js"]` in exec form, so Node is process 1 and receives the stop signal itself.
- No `HEALTHCHECK` and no init process.
- `.dockerignore` is an allow-list: ignore everything, then re-include `backend/` and `frontend/` without their `node_modules`, `dist` and `coverage`. The image is public.
- A graceful stop ends with exit code 0. A check after `docker stop` looks for "not 137".

## Pipeline

- One workflow, three jobs chained with `needs`: `verify`, `image`, `deploy`. A push to `main` runs all three; a pull request runs `verify` only.
- Name the runner `ubuntu-24.04`. The `ubuntu-latest` label is announced to move to 26.04.
- Only two actions, pinned by full commit SHA with the version in a comment: `actions/checkout` v7.0.1 is `3d3c42e5aac5ba805825da76410c181273ba90b1`, `actions/setup-node` v7.1.0 is `949feb2413d6458794dcd2491c4babbbce0c15c1` (both checked on 2026-11-11; resolve again on the day). Everything else is plain commands in `run` steps.
- The runner's own Node is 22, so `setup-node` reads the version from `.nvmrc`. The runner has Docker and no Terraform.
- `permissions: contents: read` for the workflow; `packages: write` only in the `image` job.
- `verify`: `npm run setup`, `npm run verify`, then `npm audit --omit=dev --audit-level=high` in both packages.
- `image`: build, start the container on the runner, run the smoke script against it, stop it and check that it stopped on its own, log in with the built-in token, push with the commit SHA as the tag.
- The registry is GitHub Container Registry. The image path `ghcr.io/<owner>/<repo>` must be lower case; the workflow reads the names from GitHub's own variables and lower-cases the path itself. A new package starts private, even from a public repository, and no API call changes that.
- `deploy`: `environment: production` (it holds the secret; environments are free only on public repositories), a `concurrency` group without cancellation, plain `ssh` with the pinned host key and strict host key checking, `infra/deploy.sh` sent over SSH, then the smoke script against the public address.
- Terraform checks are local only: `npm run verify:infra`.

## Deploy script and line endings

- `infra/deploy.sh` is bash and runs on the instance under `sudo`: note the running image; pull the new one; stop and remove the old container; start the new one with `--restart unless-stopped`, `-p 80:3000`, `--memory 512m` and `--log-driver journald`; wait for `/health` on localhost with curl's retry flags; on failure print the container's log, remove it, start the previous image and exit non-zero; on success prune unused images.
- `infra/deploy.sh` and `infra/user-data.sh` run on Linux and are edited on Windows. `.gitattributes` has `* text=auto eol=lf`. A script with Windows line endings fails on Linux.
