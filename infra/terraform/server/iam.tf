# What the server itself may do in AWS. The instance gets short-lived credentials for this role from its metadata
# service; no key is stored on it.
data "aws_caller_identity" "current" {}

# Made by ../platform; looked up by name, so this root does not read the other one's state.
data "aws_ecr_repository" "images" {
  for_each = toset(["markup-resume-app", "markup-resume-web"])

  name = each.key
}

data "aws_iam_policy_document" "assume_by_ec2" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "server" {
  name               = "markup-resume-server"
  assume_role_policy = data.aws_iam_policy_document.assume_by_ec2.json
}

# The SSM agent: Session Manager (the shell) and Run Command (the deploy).
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.server.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "server" {
  # Logging in to ECR has no resource of its own.
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [for repository in data.aws_ecr_repository.images : repository.arn]
  }

  # The settings and secrets under /markup-resume/, from which the env file is assembled. SecureString values are
  # encrypted with the AWS managed key aws/ssm, whose key policy already lets the account's principals decrypt through
  # SSM, so no kms:Decrypt here.
  statement {
    sid     = "ReadSettings"
    actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/markup-resume",
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/markup-resume/*",
    ]
  }
}

resource "aws_iam_role_policy" "server" {
  name   = "server"
  role   = aws_iam_role.server.id
  policy = data.aws_iam_policy_document.server.json
}

resource "aws_iam_instance_profile" "server" {
  name = "markup-resume-server"
  role = aws_iam_role.server.name
}
