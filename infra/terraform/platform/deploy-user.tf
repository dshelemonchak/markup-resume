# How GitHub Actions gets into AWS to push images and deploy (ADR-0029).
#
# The plan was GitHub OIDC: short-lived credentials, no stored key. The AWS project's service control policy denies
# iam:*Provider* on the Free plan, so OIDC identity providers cannot be created until the account activates advanced
# features (which needs the paid plan). Until then: an IAM user whose only permissions are the deploy's, with an
# access key kept in GitHub's secrets. The key is created by hand (aws iam create-access-key), never by Terraform, so
# the secret is not written into the state.
resource "aws_iam_user" "deploy" {
  name = "markup-resume-deploy"
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "deploy" {
  # Logging in to ECR has no resource of its own.
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [for repository in aws_ecr_repository.images : repository.arn]
  }

  # Run the deploy commands on the server, and only there: instances tagged as this project's (../server), with AWS's
  # shell-script document.
  statement {
    sid       = "DeployToServer"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/*"]

    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Project"
      values   = ["markup-resume"]
    }
  }

  statement {
    sid       = "DeployDocument"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ssm:${var.region}::document/AWS-RunShellScript"]
  }

  # Wait for the command and read its output.
  statement {
    sid       = "DeployResult"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }

  # Find the server by its Project tag, so the workflow needs no instance id, which changes when the server is
  # replaced. The action has no resource of its own.
  statement {
    sid       = "FindServer"
    actions   = ["ssm:DescribeInstanceInformation"]
    resources = ["*"]
  }

  # Point the server at the new images (../server/parameters.tf), so a reboot starts the same version. Only these two
  # parameters: the secrets stay out of reach.
  statement {
    sid     = "SetImageTags"
    actions = ["ssm:PutParameter"]
    resources = [
      for name in ["APP_IMAGE", "WEB_IMAGE"] :
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/markup-resume/${name}"
    ]
  }
}

resource "aws_iam_user_policy" "deploy" {
  name   = "deploy"
  user   = aws_iam_user.deploy.name
  policy = data.aws_iam_policy_document.deploy.json
}
