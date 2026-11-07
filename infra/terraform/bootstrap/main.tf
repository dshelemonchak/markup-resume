# The bucket that holds Terraform state for the other roots (ADR-0029). Its name carries the account id, so it is
# unique without guessing.
data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "state" {
  bucket = "markup-resume-tfstate-${data.aws_caller_identity.current.account_id}"

  # Losing the state would leave every resource unmanaged.
  lifecycle {
    prevent_destroy = true
  }
}

# Every write keeps the previous version: a broken apply can be rolled back to the state before it.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Old state versions are kept 90 days, then go.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}
