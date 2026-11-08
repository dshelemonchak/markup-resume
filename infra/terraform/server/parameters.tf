# The settings of compose.prod.yaml (deploy/app.env.example) in SSM Parameter Store, one parameter per variable under
# /markup-resume/; the server assembles its env file from them (files/markup-resume-up.sh).

resource "aws_ssm_parameter" "site_address" {
  name  = "/markup-resume/SITE_ADDRESS"
  type  = "String"
  value = var.domain
}

# Created by Terraform, filled by hand (aws ssm put-parameter --overwrite; the image tags later by the deploy).
# Terraform writes the placeholder "unset" once, through a write-only argument: it never reads a value back, so the
# real ones, secrets included, never reach the state. (A plain value with ignore_changes would not do: every refresh
# reads the parameter, decrypted, into the state.) The server refuses to start while any of them is still "unset".
locals {
  manual_parameters = {
    POSTGRES_PASSWORD    = "SecureString"
    GITHUB_CLIENT_SECRET = "SecureString"
    GITHUB_CLIENT_ID     = "String"
    ALLOWED_GITHUB_IDS   = "String"
    OWNER_GITHUB_ID      = "String"
    APP_IMAGE            = "String"
    WEB_IMAGE            = "String"
  }
}

resource "aws_ssm_parameter" "manual" {
  for_each = local.manual_parameters

  name             = "/markup-resume/${each.key}"
  type             = each.value
  value_wo         = "unset"
  value_wo_version = 1
}
