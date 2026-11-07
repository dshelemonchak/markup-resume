terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # State in the bucket made by ../bootstrap, locked with a lock file next to it (no DynamoDB table). The bucket and
  # region come from backend.hcl: terraform init -backend-config=backend.hcl
  backend "s3" {
    key          = "platform/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "markup-resume"
      ManagedBy = "terraform"
    }
  }
}
