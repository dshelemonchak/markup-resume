# Terraform for the AWS hosting (ADR-0029)

Three roots, applied in this order:

| Root         | State                            | Creates                                                                 |
| ------------ | -------------------------------- | ----------------------------------------------------------------------- |
| `bootstrap/` | local, on purpose                | the S3 bucket that holds the state of every other root                  |
| `platform/`  | in that bucket, with a lock file | the deploy IAM user and its policy, ECR repositories for the two images |
| `server/`    | in that bucket, with a lock file | the EC2 instance, its role, data volume, Elastic IP and security group  |

Backups come in a later stage.

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

Its outputs are what the deploy workflow needs: the `deploy_user` name and the ECR repository URLs.

The deploy user's access key is created by hand when the deploy workflow is set up, not by Terraform, so the secret
never lands in the state:

```bash
aws iam create-access-key --user-name markup-resume-deploy
```

It goes straight into the repository's GitHub secrets and nowhere else.

## The server

```bash
cd ../server
terraform init -backend-config=../platform/backend.hcl
terraform apply
```

On its first boot the instance sets up swap, the data volume and Docker (`server/files/first-boot.sh`), then waits
for `compose.prod.yaml`. Then, in this order:

1. **DNS:** an `A` record for the domain to the `public_ip` output, at the registrar. Caddy asks Let's Encrypt for a
   certificate as soon as it starts and retries until the record resolves.
2. **Settings:** Terraform created the parameters under `/markup-resume/` with the placeholder `unset`; the server
   will not start until each has a value. The values never pass through Terraform, so they are not in the state:

   ```bash
   aws ssm put-parameter --overwrite --name /markup-resume/POSTGRES_PASSWORD --value "$(openssl rand -hex 32)"
   aws ssm put-parameter --overwrite --name /markup-resume/GITHUB_CLIENT_ID --value <client id>
   aws ssm put-parameter --overwrite --name /markup-resume/GITHUB_CLIENT_SECRET --value <client secret>
   aws ssm put-parameter --overwrite --name /markup-resume/ALLOWED_GITHUB_IDS --value <id,id>
   aws ssm put-parameter --overwrite --name /markup-resume/OWNER_GITHUB_ID --value <id>
   ```

   The GitHub OAuth App is the production one, with the callback `https://<domain>/auth/github/callback`. Postgres
   takes `POSTGRES_PASSWORD` when it creates the database on first start; changing it later takes an `ALTER USER` as
   well.

3. **Images** (until the deploy workflow does this), from the repository root:

   ```bash
   registry=<account id>.dkr.ecr.eu-north-1.amazonaws.com
   tag=$(git rev-parse HEAD)
   aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"
   docker buildx build --platform linux/arm64 --target runtime -t "$registry/markup-resume-app:$tag" --push .
   docker buildx build --platform linux/arm64 --target web -t "$registry/markup-resume-web:$tag" --push .
   aws ssm put-parameter --overwrite --name /markup-resume/APP_IMAGE --value "$registry/markup-resume-app:$tag"
   aws ssm put-parameter --overwrite --name /markup-resume/WEB_IMAGE --value "$registry/markup-resume-web:$tag"
   ```

4. **Start** (until the deploy workflow does this): put `compose.prod.yaml` on the server and start the unit, which
   assembles `/etc/markup-resume/app.env` from the parameters, pulls the images and brings them up:

   ```bash
   aws ssm send-command --instance-ids <instance_id> --document-name AWS-RunShellScript \
     --parameters "commands=echo $(base64 < compose.prod.yaml | tr -d '\n') | base64 -d > /opt/markup-resume/compose.prod.yaml && systemctl restart markup-resume"
   ```

A shell on the server, without SSH: `aws ssm start-session --target <instance_id>` (needs the Session Manager plugin
for the AWS CLI). Logs of the first boot are in `/var/log/cloud-init-output.log`, of the unit in
`journalctl -u markup-resume`.

A change to `server/files/` or `server/user-data.tf` replaces the instance on the next apply: a minute or two of
downtime, the data volume (database, certificates) moves to the new one, and the parameters and images stay. Only
step 4 is repeated afterwards.

## Day to day

- `terraform plan` before every `apply`; read what it will change.
- The region is a variable (`eu-north-1` by default); change it in both roots, before the first apply.
- CI runs `terraform fmt -check` and `terraform validate` on every pull request, without AWS credentials.
