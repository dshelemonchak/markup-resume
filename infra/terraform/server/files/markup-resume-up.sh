#!/bin/bash
# Brings compose.prod.yaml up with the settings from SSM Parameter Store (ADR-0029). Run by markup-resume.service at
# boot; the deploy runs it again after putting a new compose.prod.yaml or image tags in place.
set -euo pipefail

# AWS_REGION and REGISTRY, written by cloud-init; exported, so the AWS CLI sees the region.
set -a
source /etc/markup-resume/server.env
set +a
cd /opt/markup-resume

# Every parameter under /markup-resume/ becomes a line NAME=value of the env file, readable by root only. A
# parameter still holding Terraform's placeholder stops the start instead of running with it. Values are used as
# they are: no quotes, no $, no newlines (the secrets are hex).
umask 077
aws ssm get-parameters-by-path --path /markup-resume --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text |
  while IFS=$'\t' read -r name value; do
    if [[ $value == unset ]]; then
      echo "The SSM parameter $name is not set yet." >&2
      exit 1
    fi
    printf '%s=%s\n' "${name#/markup-resume/}" "$value"
  done >/etc/markup-resume/app.env.new
mv /etc/markup-resume/app.env.new /etc/markup-resume/app.env

# ECR's login lasts 12 hours, so it is renewed on every run.
aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY"

compose=(docker compose -f compose.prod.yaml --env-file /etc/markup-resume/app.env)
"${compose[@]}" pull
"${compose[@]}" up -d --remove-orphans
