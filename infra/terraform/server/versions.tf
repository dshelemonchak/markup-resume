terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # The same bucket and lock file as ../platform, under its own key: the server can be planned, replaced or destroyed
  # without touching the deploy user or the image repositories. Same backend.hcl:
  # terraform init -backend-config=../platform/backend.hcl
  backend "s3" {
    key          = "server/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  # Project=markup-resume on the instance is what lets the deploy user run commands on it (../platform/deploy-user.tf).
  default_tags {
    tags = {
      Project   = "markup-resume"
      ManagedBy = "terraform"
    }
  }
}
