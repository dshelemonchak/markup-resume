# Terraform for the AWS hosting (ADR-0029)

Two roots, applied in this order:

| Root         | State                            | Creates                                                                    |
| ------------ | -------------------------------- | -------------------------------------------------------------------------- |
| `bootstrap/` | local, on purpose                | the S3 bucket that holds the state of every other root                     |
| `platform/`  | in that bucket, with a lock file | GitHub OIDC provider, the deploy role, ECR repositories for the two images |

The server (EC2, Elastic IP, security group, SSM parameters, backups) comes in a later stage.

## Prerequisites

- An AWS account with MFA on the root user and an admin user in IAM Identity Center.
- Signed in on the command line: `aws sso login --profile <profile>`, then `export AWS_PROFILE=<profile>`.
- Terraform 1.17 (`brew install terraform`), or the same version in Docker:
  `docker run --rm -it -v "$PWD:/tf" -w /tf -v ~/.aws:/root/.aws -e AWS_PROFILE hashicorp/terraform:1.17.1 <command>`.

## First apply

```bash
cd infra/terraform/bootstrap
terraform init
terraform apply
```

Copy `platform/backend.hcl.example` to `platform/backend.hcl` (git ignores it) and put in the `state_bucket` and
`region` outputs. Then:

```bash
cd ../platform
terraform init -backend-config=backend.hcl
terraform apply
```

Its outputs are what the deploy workflow needs: `deploy_role_arn` and the ECR repository URLs.

## Day to day

- `terraform plan` before every `apply`; read what it will change.
- The region is a variable (`eu-north-1` by default); change it in both roots, before the first apply.
- CI runs `terraform fmt -check` and `terraform validate` on every pull request, without AWS credentials.
