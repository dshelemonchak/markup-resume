terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Local state on purpose: this root creates the bucket that every other root keeps its state in. Its own state is
  # three resources, and can be re-created by importing them.
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
